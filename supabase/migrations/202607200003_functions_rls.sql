begin;

create or replace function public.set_updated_at() returns trigger language plpgsql as $$ begin new.updated_at=now(); return new; end $$;
do $$ declare r record; begin for r in select tablename from pg_tables where schemaname='public' and tablename <> 'audit_logs' loop execute format('drop trigger if exists set_updated_at on public.%I',r.tablename); execute format('create trigger set_updated_at before update on public.%I for each row execute function public.set_updated_at()',r.tablename); end loop; end $$;

create or replace function public.handle_new_user() returns trigger language plpgsql security definer set search_path=public as $$
begin
 insert into public.profiles(id,username,display_name,timezone) values(new.id,'user_'||substr(replace(new.id::text,'-',''),1,10),coalesce(new.raw_user_meta_data->>'display_name','New member'),coalesce(new.raw_user_meta_data->>'timezone','UTC')) on conflict do nothing;
 insert into public.user_settings(user_id) values(new.id) on conflict do nothing;
 insert into public.notification_preferences(user_id) values(new.id) on conflict do nothing;
 return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

create or replace function public.is_admin() returns boolean language sql stable security definer set search_path=public as $$ select coalesce((select is_admin from profiles where id=auth.uid() and account_status='active'),false) $$;
create or replace function public.is_circle_member(p_circle uuid,p_user uuid default auth.uid()) returns boolean language sql stable security definer set search_path=public as $$ select exists(select 1 from circle_members where circle_id=p_circle and user_id=p_user and status='active' and deleted_at is null) $$;
create or replace function public.is_circle_moderator(p_circle uuid,p_user uuid default auth.uid()) returns boolean language sql stable security definer set search_path=public as $$ select exists(select 1 from circle_members where circle_id=p_circle and user_id=p_user and status='active' and role in ('owner','moderator') and deleted_at is null) $$;
create or replace function public.users_blocked(a uuid,b uuid) returns boolean language sql stable security definer set search_path=public as $$ select exists(select 1 from blocks where (blocker_id=a and blocked_id=b) or (blocker_id=b and blocked_id=a)) $$;

create or replace function public.create_circle(p_name text,p_description text default null) returns uuid language plpgsql security definer set search_path=public as $$
declare v_id uuid:=gen_random_uuid();v_code text;
begin
 if auth.uid() is null then raise exception 'authentication required'; end if;
 if exists(select 1 from circle_members where user_id=auth.uid() and status='active') and not exists(select 1 from entitlements where user_id=auth.uid() and identifier='pro' and status='active' and (expires_at is null or expires_at>now())) then raise exception 'CalledOut Pro is required to create a second circle'; end if;
 insert into circles(id,name,description,owner_id) values(v_id,trim(p_name),nullif(trim(p_description),''),auth.uid());
 insert into circle_members(circle_id,user_id,role,status) values(v_id,auth.uid(),'owner','active');
 v_code:=upper(substr(encode(gen_random_bytes(8),'hex'),1,8));
 insert into circle_invites(circle_id,code,created_by,expires_at) values(v_id,v_code,auth.uid(),now()+interval '30 days');
 insert into activity_events(actor_id,circle_id,event_type,payload) values(auth.uid(),v_id,'member_joined',jsonb_build_object('role','owner'));
 return v_id;
end $$;

create or replace function public.join_circle_by_code(p_code text) returns uuid language plpgsql security definer set search_path=public as $$
declare v_inv circle_invites%rowtype;v_count int;begin
 if auth.uid() is null then raise exception 'authentication required'; end if;
 select * into v_inv from circle_invites where code=upper(trim(p_code)) and revoked_at is null and (expires_at is null or expires_at>now()) for update;
 if not found then raise exception 'Invite code is invalid or expired'; end if;
 select count(*) into v_count from circle_members where circle_id=v_inv.circle_id and status='active';
 if v_count >= (select member_limit from circles where id=v_inv.circle_id) then raise exception 'Circle is full'; end if;
 if v_inv.max_uses is not null and v_inv.uses>=v_inv.max_uses then raise exception 'Invite has reached its use limit'; end if;
 insert into circle_members(circle_id,user_id,role,status) values(v_inv.circle_id,auth.uid(),'member','active') on conflict(circle_id,user_id) do update set status='active',deleted_at=null,joined_at=now();
 update circle_invites set uses=uses+1 where id=v_inv.id;
 insert into activity_events(actor_id,circle_id,event_type) values(auth.uid(),v_inv.circle_id,'member_joined');
 return v_inv.circle_id;
end $$;

create or replace function public.create_schedule_with_commitments(p_title text,p_workout_type public.workout_type,p_days_of_week integer[],p_deadline_hour integer,p_minimum_duration integer,p_proof_method public.proof_method,p_requires_location boolean,p_circle_id uuid default null) returns uuid language plpgsql security definer set search_path=public as $$
declare v_schedule uuid:=gen_random_uuid();v_tz text;d date;v_deadline timestamptz;begin
 if auth.uid() is null then raise exception 'authentication required'; end if;
 if p_deadline_hour not between 0 and 23 then raise exception 'invalid deadline hour'; end if;
 if p_circle_id is not null and not is_circle_member(p_circle_id) then raise exception 'not a circle member'; end if;
 select timezone into v_tz from profiles where id=auth.uid();
 insert into commitment_schedules(id,user_id,circle_id,title,workout_type,timezone,days_of_week,deadline_local,minimum_duration_minutes,proof_method,requires_location)
 values(v_schedule,auth.uid(),p_circle_id,trim(p_title),p_workout_type,v_tz,p_days_of_week::smallint[],make_time(p_deadline_hour,0,0),p_minimum_duration,p_proof_method,p_requires_location);
 for d in select generate_series(current_date,current_date+30,interval '1 day')::date loop
  if extract(dow from d)::int=any(p_days_of_week) then
   v_deadline:=((d::text||' '||lpad(p_deadline_hour::text,2,'0')||':00:00')::timestamp at time zone v_tz);
   insert into commitments(user_id,circle_id,schedule_id,title,workout_type,commitment_date,proof_window_starts_at,deadline_at,timezone,minimum_duration_minutes,proof_method,requires_location,status)
   values(auth.uid(),p_circle_id,v_schedule,trim(p_title),p_workout_type,d,v_deadline-interval '4 hours',v_deadline,v_tz,p_minimum_duration,p_proof_method,p_requires_location,case when now()>=v_deadline-interval '4 hours' then 'proof_window_open'::commitment_status else 'upcoming'::commitment_status end)
   on conflict(schedule_id,commitment_date) do nothing;
  end if;
 end loop;
 return v_schedule;
end $$;

create or replace function public.start_redemption(p_commitment_id uuid) returns uuid language plpgsql security definer set search_path=public as $$
declare v_missed missed_commitments%rowtype;v_red uuid;v_commit uuid:=gen_random_uuid();begin
 select m.* into v_missed from missed_commitments m where m.commitment_id=p_commitment_id and m.user_id=auth.uid() and m.deleted_at is null;
 if not found then raise exception 'missed commitment not found'; end if;
 insert into redemptions(missed_commitment_id,user_id,status,rules,opens_at,deadline_at) values(v_missed.id,auth.uid(),'in_progress','{"type":"verified_workout","minutes":30}'::jsonb,now(),now()+interval '24 hours') on conflict(missed_commitment_id) do update set status='in_progress' returning id into v_red;
 insert into commitments(id,user_id,circle_id,title,workout_type,commitment_date,proof_window_starts_at,deadline_at,timezone,minimum_duration_minutes,proof_method,requires_location,status,redemption_rules)
 select v_commit,c.user_id,c.circle_id,'Redemption workout',c.workout_type,current_date,now(),now()+interval '24 hours',c.timezone,30,'live_photo',false,'proof_window_open','{}'::jsonb from commitments c where c.id=p_commitment_id;
 update redemptions set redemption_commitment_id=v_commit where id=v_red;
 update commitments set status='redemption_available' where id=p_commitment_id;
 return v_red;
end $$;

create or replace function public.cast_verification_vote(p_submission uuid,p_vote text,p_reason text default null) returns void language plpgsql security definer set search_path=public as $$
declare v_commit commitments%rowtype;v_accept int;v_reject int;begin
 select c.* into v_commit from proof_submissions p join commitments c on c.id=p.commitment_id where p.id=p_submission and p.status='circle_review';
 if not found or v_commit.circle_id is null or not is_circle_member(v_commit.circle_id) or v_commit.user_id=auth.uid() then raise exception 'not authorized to review'; end if;
 insert into verification_votes(proof_submission_id,voter_id,vote,reason) values(p_submission,auth.uid(),p_vote,p_reason) on conflict(proof_submission_id,voter_id) do update set vote=excluded.vote,reason=excluded.reason;
 select count(*) filter(where vote='accept'),count(*) filter(where vote='reject') into v_accept,v_reject from verification_votes where proof_submission_id=p_submission;
 if v_accept>=2 then update proof_submissions set status='verified',decided_at=now() where id=p_submission;update commitments set status='verified',verified_at=now() where id=v_commit.id;elsif v_reject>=2 then update proof_submissions set status='rejected',decided_at=now() where id=p_submission;update commitments set status='rejected' where id=v_commit.id;end if;
end $$;

create or replace function public.process_commitment_deadlines() returns jsonb language plpgsql security definer set search_path=public as $$
declare v_opened int:=0;v_missed int:=0;v_expired int:=0;begin
 perform pg_advisory_xact_lock(hashtext('calledout_deadline_job'));
 update commitments set status='proof_window_open' where status='upcoming' and proof_window_starts_at<=now() and deadline_at>now();get diagnostics v_opened=row_count;
 with changed as (update commitments set status='missed',missed_at=now() where status in ('upcoming','proof_window_open') and deadline_at+(grace_period_minutes||' minutes')::interval<now() returning *)
 insert into missed_commitments(commitment_id,user_id,circle_id,missed_at) select id,user_id,circle_id,coalesce(missed_at,now()) from changed on conflict(commitment_id) do nothing;
 get diagnostics v_missed=row_count;
 insert into redemptions(missed_commitment_id,user_id,status,rules,opens_at,deadline_at)
 select m.id,m.user_id,'available',c.redemption_rules,now(),now()+make_interval(hours=>coalesce((c.redemption_rules->>'window_hours')::int,24)) from missed_commitments m join commitments c on c.id=m.commitment_id left join redemptions r on r.missed_commitment_id=m.id where r.id is null and m.missed_at>now()-interval '2 minutes';
 insert into activity_events(actor_id,circle_id,commitment_id,event_type,payload)
 select c.user_id,c.circle_id,c.id,'commitment_missed',jsonb_build_object('title',c.title) from commitments c left join activity_events a on a.commitment_id=c.id and a.event_type='commitment_missed' where c.status='missed' and c.missed_at>now()-interval '2 minutes' and a.id is null;
 update redemptions set status='expired' where status in ('available','in_progress') and deadline_at<now();get diagnostics v_expired=row_count;
 return jsonb_build_object('opened',v_opened,'missed',v_missed,'redemptions_expired',v_expired,'processed_at',now());
end $$;

create or replace view public.wall_rankings as
select m.circle_id,m.user_id,min(m.id) as id,count(*)::int as missed_count,max(m.missed_at) as most_recent_missed_at,p.completion_rate,
 exists(select 1 from redemptions r join missed_commitments mm on mm.id=r.missed_commitment_id where mm.user_id=m.user_id and mm.circle_id=m.circle_id and r.status='in_progress') as redemption_in_progress
from missed_commitments m join profiles p on p.id=m.user_id where m.wall_visible and m.deleted_at is null and m.circle_id is not null group by m.circle_id,m.user_id,p.completion_rate;

-- RLS
alter table public.profiles enable row level security;alter table public.user_settings enable row level security;alter table public.devices enable row level security;alter table public.circles enable row level security;alter table public.circle_members enable row level security;alter table public.circle_invites enable row level security;alter table public.commitment_schedules enable row level security;alter table public.commitments enable row level security;alter table public.proof_submissions enable row level security;alter table public.proof_assets enable row level security;alter table public.verification_checks enable row level security;alter table public.verification_votes enable row level security;alter table public.missed_commitments enable row level security;alter table public.redemptions enable row level security;alter table public.grace_passes enable row level security;alter table public.activity_events enable row level security;alter table public.reactions enable row level security;alter table public.comments enable row level security;alter table public.blocks enable row level security;alter table public.reports enable row level security;alter table public.moderation_actions enable row level security;alter table public.notification_preferences enable row level security;alter table public.push_tokens enable row level security;alter table public.subscriptions enable row level security;alter table public.entitlements enable row level security;alter table public.health_connections enable row level security;alter table public.audit_logs enable row level security;alter table public.account_deletion_requests enable row level security;

create policy profiles_self_or_circle_read on profiles for select using (id=auth.uid() or is_admin() or (not users_blocked(auth.uid(),id) and exists(select 1 from circle_members mine join circle_members theirs on theirs.circle_id=mine.circle_id where mine.user_id=auth.uid() and mine.status='active' and theirs.user_id=profiles.id and theirs.status='active')) or (public_profile_opt_in and account_status='active'));
create policy profiles_self_update on profiles for update using(id=auth.uid()) with check(id=auth.uid() and is_admin=false);
create policy own_settings on user_settings for all using(user_id=auth.uid()) with check(user_id=auth.uid());
create policy own_devices on devices for all using(user_id=auth.uid()) with check(user_id=auth.uid());
create policy circles_read on circles for select using(deleted_at is null and (privacy='public' or is_circle_member(id) or is_admin()));
create policy circle_owner_update on circles for update using(is_circle_moderator(id)) with check(is_circle_moderator(id));
create policy circle_members_read on circle_members for select using(is_circle_member(circle_id) and not users_blocked(auth.uid(),user_id) or is_admin());
create policy circle_members_manage on circle_members for update using(is_circle_moderator(circle_id)) with check(is_circle_moderator(circle_id));
create policy invites_moderators on circle_invites for select using(is_circle_moderator(circle_id) or is_admin());
create policy schedules_owner on commitment_schedules for all using(user_id=auth.uid() or is_admin()) with check(user_id=auth.uid());
create policy commitments_read on commitments for select using(user_id=auth.uid() or (circle_id is not null and is_circle_member(circle_id) and not users_blocked(auth.uid(),user_id)) or is_admin());
create policy commitments_insert_self on commitments for insert with check(user_id=auth.uid() and (circle_id is null or is_circle_member(circle_id)));
create policy commitments_update_before_window on commitments for update using(user_id=auth.uid() and status='upcoming' and now()<proof_window_starts_at) with check(user_id=auth.uid());
create policy proofs_read on proof_submissions for select using(user_id=auth.uid() or exists(select 1 from commitments c where c.id=commitment_id and c.circle_id is not null and is_circle_member(c.circle_id) and not users_blocked(auth.uid(),user_id)) or is_admin());
create policy proofs_insert_self on proof_submissions for insert with check(user_id=auth.uid() and exists(select 1 from commitments c where c.id=commitment_id and c.user_id=auth.uid() and c.status in ('upcoming','proof_window_open') and captured_at<=c.deadline_at+make_interval(mins=>c.grace_period_minutes)));
create policy proof_assets_read on proof_assets for select using(exists(select 1 from proof_submissions p join commitments c on c.id=p.commitment_id where p.id=proof_submission_id and (p.user_id=auth.uid() or (c.circle_id is not null and is_circle_member(c.circle_id)))) or is_admin());
create policy checks_read on verification_checks for select using(exists(select 1 from proof_submissions p join commitments c on c.id=p.commitment_id where p.id=proof_submission_id and (p.user_id=auth.uid() or (c.circle_id is not null and is_circle_member(c.circle_id)))) or is_admin());
create policy votes_read on verification_votes for select using(exists(select 1 from proof_submissions p join commitments c on c.id=p.commitment_id where p.id=proof_submission_id and c.circle_id is not null and is_circle_member(c.circle_id)) or is_admin());
create policy missed_read on missed_commitments for select using(user_id=auth.uid() or (circle_id is not null and is_circle_member(circle_id) and not users_blocked(auth.uid(),user_id)) or is_admin());
create policy redemptions_own on redemptions for select using(user_id=auth.uid() or is_admin());
create policy grace_own on grace_passes for select using(user_id=auth.uid() or is_admin());
create policy activity_circle_read on activity_events for select using(actor_id=auth.uid() or (circle_id is not null and is_circle_member(circle_id) and not users_blocked(auth.uid(),actor_id)) or visibility='public' or is_admin());
create policy reactions_circle on reactions for select using(user_id=auth.uid() or exists(select 1 from missed_commitments m where m.id=missed_commitment_id and is_circle_member(m.circle_id)) or is_admin());
create policy reactions_insert on reactions for insert with check(user_id=auth.uid() and exists(select 1 from missed_commitments m where m.id=missed_commitment_id and is_circle_member(m.circle_id) and m.user_id<>auth.uid()));
create policy comments_circle on comments for select using(moderation_state='visible' and exists(select 1 from activity_events a where a.id=activity_event_id and is_circle_member(a.circle_id)) or user_id=auth.uid() or is_admin());
create policy comments_insert on comments for insert with check(user_id=auth.uid() and exists(select 1 from activity_events a join circles c on c.id=a.circle_id where a.id=activity_event_id and c.comments_enabled and is_circle_member(c.id)));
create policy blocks_own on blocks for all using(blocker_id=auth.uid()) with check(blocker_id=auth.uid());
create policy reports_insert on reports for insert with check(reporter_id=auth.uid());create policy reports_read on reports for select using(reporter_id=auth.uid() or is_admin());
create policy moderation_admin on moderation_actions for all using(is_admin()) with check(is_admin());
create policy notification_own on notification_preferences for all using(user_id=auth.uid()) with check(user_id=auth.uid());
create policy push_own on push_tokens for all using(user_id=auth.uid()) with check(user_id=auth.uid());
create policy subscriptions_own on subscriptions for select using(user_id=auth.uid() or is_admin());
create policy entitlements_own on entitlements for select using(user_id=auth.uid() or is_admin());
create policy health_own on health_connections for all using(user_id=auth.uid()) with check(user_id=auth.uid());
create policy audit_admin_or_actor on audit_logs for select using(actor_id=auth.uid() or is_admin());
create policy deletion_own on account_deletion_requests for select using(user_id=auth.uid() or is_admin());

grant execute on function public.create_circle(text,text) to authenticated;grant execute on function public.join_circle_by_code(text) to authenticated;grant execute on function public.create_schedule_with_commitments(text,public.workout_type,integer[],integer,integer,public.proof_method,boolean,uuid) to authenticated;grant execute on function public.start_redemption(uuid) to authenticated;grant execute on function public.cast_verification_vote(uuid,text,text) to authenticated;
grant select on public.wall_rankings to authenticated;
commit;
