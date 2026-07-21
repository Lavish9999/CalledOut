begin;

create table public.notification_outbox (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references public.profiles(id) on delete cascade,
 category text not null,
 title text not null,
 body text not null,
 data jsonb not null default '{}'::jsonb,
 deliver_after timestamptz not null default now(),
 status text not null default 'pending' check(status in ('pending','sent','failed','cancelled')),
 attempts integer not null default 0,
 last_error text,
 sent_at timestamptz,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create index notification_outbox_pending_idx on public.notification_outbox(status,deliver_after) where status='pending';
alter table public.notification_outbox enable row level security;
create policy notification_outbox_admin_read on public.notification_outbox for select using(public.is_admin());
create trigger set_updated_at before update on public.notification_outbox for each row execute function public.set_updated_at();

create unique index grace_pass_month_unique_idx on public.grace_passes(user_id,coalesce(circle_id,'00000000-0000-0000-0000-000000000000'::uuid),granted_for_month,source);

create or replace function public.has_active_pro(p_user uuid default auth.uid()) returns boolean language sql stable security definer set search_path=public as $$
 select exists(select 1 from entitlements where user_id=p_user and identifier='pro' and status='active' and (expires_at is null or expires_at>now()))
$$;

create or replace function public.create_schedule_with_commitments(p_title text,p_workout_type public.workout_type,p_days_of_week integer[],p_deadline_hour integer,p_minimum_duration integer,p_proof_method public.proof_method,p_requires_location boolean,p_circle_id uuid default null) returns uuid language plpgsql security definer set search_path=public as $$
declare v_schedule uuid:=gen_random_uuid();v_tz text;d date;v_deadline timestamptz;begin
 if auth.uid() is null then raise exception 'authentication required'; end if;
 if p_deadline_hour not between 0 and 23 then raise exception 'invalid deadline hour'; end if;
 if p_minimum_duration not between 1 and 1440 then raise exception 'invalid duration'; end if;
 if p_circle_id is not null and not is_circle_member(p_circle_id) then raise exception 'not a circle member'; end if;
 if not has_active_pro() and exists(select 1 from commitment_schedules where user_id=auth.uid() and is_active and deleted_at is null) then raise exception 'CalledOut Pro is required for additional recurring schedules'; end if;
 select timezone into v_tz from profiles where id=auth.uid();
 insert into commitment_schedules(id,user_id,circle_id,title,workout_type,timezone,days_of_week,deadline_local,minimum_duration_minutes,proof_method,requires_location)
 values(v_schedule,auth.uid(),p_circle_id,trim(p_title),p_workout_type,v_tz,p_days_of_week::smallint[],make_time(p_deadline_hour,0,0),p_minimum_duration,p_proof_method,p_requires_location);
 for d in select generate_series(current_date,current_date+30,interval '1 day')::date loop
  if extract(dow from d)::int=any(p_days_of_week) then
   v_deadline:=((d::text||' '||lpad(p_deadline_hour::text,2,'0')||':00:00')::timestamp at time zone v_tz);
   if v_deadline>now() then
    insert into commitments(user_id,circle_id,schedule_id,title,workout_type,commitment_date,proof_window_starts_at,deadline_at,timezone,minimum_duration_minutes,proof_method,requires_location,status)
    values(auth.uid(),p_circle_id,v_schedule,trim(p_title),p_workout_type,d,v_deadline-interval '4 hours',v_deadline,v_tz,p_minimum_duration,p_proof_method,p_requires_location,case when now()>=v_deadline-interval '4 hours' then 'proof_window_open'::commitment_status else 'upcoming'::commitment_status end)
    on conflict(schedule_id,commitment_date) do nothing;
   end if;
  end if;
 end loop;
 return v_schedule;
end $$;

create or replace function public.join_circle_by_code(p_code text) returns uuid language plpgsql security definer set search_path=public as $$
declare v_inv circle_invites%rowtype;v_count int;v_memberships int;begin
 if auth.uid() is null then raise exception 'authentication required'; end if;
 select count(*) into v_memberships from circle_members where user_id=auth.uid() and status='active' and deleted_at is null;
 if v_memberships>=1 and not has_active_pro() then raise exception 'CalledOut Pro is required to join another circle'; end if;
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

create or replace function public.grant_monthly_grace_passes() returns integer language plpgsql security definer set search_path=public as $$
declare v_count int:=0;begin
 insert into grace_passes(user_id,circle_id,granted_for_month,source,expires_at)
 select p.id,null,date_trunc('month',current_date)::date,'free_monthly',(date_trunc('month',current_date)+interval '1 month')
 from profiles p where p.account_status='active' and p.deleted_at is null
 on conflict do nothing;
 get diagnostics v_count=row_count;
 insert into grace_passes(user_id,circle_id,granted_for_month,source,expires_at)
 select p.id,null,date_trunc('month',current_date)::date,'pro_monthly',(date_trunc('month',current_date)+interval '1 month')
 from profiles p where p.account_status='active' and has_active_pro(p.id)
 on conflict do nothing;
 return v_count;
end $$;

create or replace function public.use_grace_pass(p_commitment_id uuid,p_use_type text,p_extend_minutes integer default 60) returns void language plpgsql security definer set search_path=public as $$
declare v_commit commitments%rowtype;v_pass uuid;begin
 select * into v_commit from commitments where id=p_commitment_id and user_id=auth.uid() for update;
 if not found then raise exception 'commitment not found'; end if;
 if now()>v_commit.deadline_at then raise exception 'grace pass must be used before the deadline'; end if;
 if v_commit.status not in ('upcoming','proof_window_open') then raise exception 'commitment cannot use a grace pass in this state'; end if;
 select id into v_pass from grace_passes where user_id=auth.uid() and used_at is null and expires_at>now() and (circle_id is null or circle_id=v_commit.circle_id) order by case when source='free_monthly' then 0 else 1 end,expires_at for update skip locked limit 1;
 if v_pass is null then raise exception 'no grace passes available'; end if;
 if p_use_type='excuse' then update commitments set status='excused',excused_at=now() where id=p_commitment_id;
 elsif p_use_type='extend' then update commitments set deadline_at=deadline_at+make_interval(mins=>least(greatest(p_extend_minutes,15),240)) where id=p_commitment_id;
 else raise exception 'unsupported grace action';end if;
 update grace_passes set used_commitment_id=p_commitment_id,use_type=p_use_type,used_at=now() where id=v_pass;
 insert into audit_logs(actor_id,action,entity_type,entity_id,after_state) values(auth.uid(),'grace_pass_used','commitment',p_commitment_id,jsonb_build_object('use_type',p_use_type));
end $$;
grant execute on function public.use_grace_pass(uuid,text,integer) to authenticated;

create or replace function public.process_commitment_deadlines() returns jsonb language plpgsql security definer set search_path=public as $$
declare v_opened int:=0;v_missed int:=0;v_expired int:=0;v_granted int:=0;begin
 perform pg_advisory_xact_lock(hashtext('calledout_deadline_job'));
 v_granted:=grant_monthly_grace_passes();
 with opened as (
  update commitments set status='proof_window_open' where status='upcoming' and proof_window_starts_at<=now() and deadline_at>now() returning *
 )
 insert into notification_outbox(user_id,category,title,body,data)
 select user_id,'proof_window_opened','Proof window open','Your proof window is open. Excuses expire at '||to_char(deadline_at at time zone timezone,'HH12:MI AM')||'.',jsonb_build_object('commitment_id',id) from opened;
 get diagnostics v_opened=row_count;

 with changed as (
  update commitments set status='missed',missed_at=now() where status in ('upcoming','proof_window_open') and deadline_at+make_interval(mins=>grace_period_minutes)<now() returning *
 ), inserted as (
  insert into missed_commitments(commitment_id,user_id,circle_id,missed_at) select id,user_id,circle_id,coalesce(missed_at,now()) from changed on conflict(commitment_id) do nothing returning *
 )
 insert into notification_outbox(user_id,category,title,body,data)
 select user_id,'commitment_missed','You missed it.','The Wall has been updated.',jsonb_build_object('commitment_id',commitment_id) from inserted;
 get diagnostics v_missed=row_count;

 insert into redemptions(missed_commitment_id,user_id,status,rules,opens_at,deadline_at)
 select m.id,m.user_id,'available',c.redemption_rules,now(),now()+make_interval(hours=>coalesce((c.redemption_rules->>'window_hours')::int,24)) from missed_commitments m join commitments c on c.id=m.commitment_id left join redemptions r on r.missed_commitment_id=m.id where r.id is null and m.missed_at>now()-interval '2 minutes';
 insert into activity_events(actor_id,circle_id,commitment_id,event_type,payload)
 select c.user_id,c.circle_id,c.id,'commitment_missed',jsonb_build_object('title',c.title) from commitments c left join activity_events a on a.commitment_id=c.id and a.event_type='commitment_missed' where c.status='missed' and c.missed_at>now()-interval '2 minutes' and a.id is null;
 update redemptions set status='expired' where status in ('available','in_progress') and deadline_at<now();get diagnostics v_expired=row_count;
 return jsonb_build_object('opened',v_opened,'missed',v_missed,'redemptions_expired',v_expired,'grace_passes_granted',v_granted,'processed_at',now());
end $$;

commit;
