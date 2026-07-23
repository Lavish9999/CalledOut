begin;

alter table public.commitment_schedules
  add column if not exists consequence_text text not null default 'Complete a verified 30-minute redemption workout',
  add column if not exists redemption_window_hours integer not null default 24 check (redemption_window_hours between 1 and 168);

create or replace function public.refresh_profile_stats(p_user uuid)
returns void
language plpgsql
security definer
set search_path=public
as $$
declare
  r record;
  v_total integer := 0;
  v_success integer := 0;
  v_run integer := 0;
  v_longest integer := 0;
begin
  for r in
    select status
    from public.commitments
    where user_id=p_user
      and deleted_at is null
      and status in ('verified','redeemed','missed','rejected')
      and not exists(select 1 from public.redemptions r where r.redemption_commitment_id=commitments.id)
    order by commitment_date, deadline_at, created_at
  loop
    v_total := v_total + 1;
    if r.status='verified' then
      v_success := v_success + 1;
      v_run := v_run + 1;
      v_longest := greatest(v_longest,v_run);
    else
      v_run := 0;
    end if;
  end loop;

  update public.profiles
  set current_streak=v_run,
      longest_streak=v_longest,
      completion_rate=case when v_total=0 then 100 else round((v_success::numeric/v_total::numeric)*100,2) end
  where id=p_user;
end $$;

create or replace function public.commitment_stats_trigger()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
begin
  if tg_op='INSERT' then
    if new.status in ('verified','redeemed','missed','rejected') and new.deleted_at is null then
      perform public.refresh_profile_stats(new.user_id);
    end if;
  elsif old.status is distinct from new.status or old.deleted_at is distinct from new.deleted_at then
    perform public.refresh_profile_stats(new.user_id);
  end if;
  return new;
end $$;

drop trigger if exists refresh_stats_after_commitment on public.commitments;
create trigger refresh_stats_after_commitment
after insert or update of status,deleted_at on public.commitments
for each row execute function public.commitment_stats_trigger();

create or replace function public.generate_commitments_for_schedule(p_schedule_id uuid,p_through date default current_date+60)
returns integer
language plpgsql
security definer
set search_path=public
as $$
declare
  s public.commitment_schedules%rowtype;
  d date;
  v_deadline timestamptz;
  v_inserted integer := 0;
  v_rows integer := 0;
begin
  select * into s
  from public.commitment_schedules
  where id=p_schedule_id and is_active and deleted_at is null;
  if not found then return 0; end if;

  for d in
    select generate_series(
      greatest(s.active_from,current_date),
      least(coalesce(s.active_until,p_through),p_through),
      interval '1 day'
    )::date
  loop
    if extract(dow from d)::integer=any(s.days_of_week::integer[]) then
      v_deadline := ((d::text||' '||s.deadline_local::text)::timestamp at time zone s.timezone);
      if v_deadline>now() then
        insert into public.commitments(
          user_id,circle_id,schedule_id,title,workout_type,commitment_date,
          proof_window_starts_at,deadline_at,timezone,minimum_duration_minutes,
          proof_method,requires_location,location_geofence,grace_period_minutes,
          redemption_rules,status
        ) values (
          s.user_id,s.circle_id,s.id,s.title,s.workout_type,d,
          v_deadline-make_interval(mins=>s.proof_window_minutes),v_deadline,s.timezone,
          s.minimum_duration_minutes,s.proof_method,s.requires_location,s.location_geofence,
          s.grace_period_minutes,
          jsonb_build_object(
            'type','verified_workout',
            'minutes',greatest(30,s.minimum_duration_minutes),
            'window_hours',s.redemption_window_hours,
            'consequence',s.consequence_text
          ),
          case when now()>=v_deadline-make_interval(mins=>s.proof_window_minutes)
               then 'proof_window_open'::public.commitment_status
               else 'upcoming'::public.commitment_status end
        ) on conflict(schedule_id,commitment_date) do nothing;
        get diagnostics v_rows=row_count;
        v_inserted := v_inserted + v_rows;
      end if;
    end if;
  end loop;
  return v_inserted;
end $$;

revoke all on function public.generate_commitments_for_schedule(uuid,date) from public,anon,authenticated;
grant execute on function public.generate_commitments_for_schedule(uuid,date) to service_role;

create or replace function public.generate_active_commitments(p_through date default current_date+60)
returns integer
language plpgsql
security definer
set search_path=public
as $$
declare
  r record;
  v_total integer := 0;
begin
  for r in select id from public.commitment_schedules where is_active and deleted_at is null loop
    v_total := v_total + public.generate_commitments_for_schedule(r.id,p_through);
  end loop;
  return v_total;
end $$;

revoke all on function public.generate_active_commitments(date) from public,anon,authenticated;
grant execute on function public.generate_active_commitments(date) to service_role;

create or replace function public.create_commitment_plan(
  p_title text,
  p_workout_type public.workout_type,
  p_recurrence text,
  p_days_of_week integer[],
  p_commitment_date date,
  p_deadline_hour integer,
  p_deadline_minute integer,
  p_minimum_duration integer,
  p_proof_method public.proof_method,
  p_requires_location boolean,
  p_circle_id uuid,
  p_proof_window_minutes integer,
  p_consequence text,
  p_redemption_window_hours integer
) returns uuid
language plpgsql
security definer
set search_path=public
as $$
declare
  v_id uuid := gen_random_uuid();
  v_tz text;
  v_deadline timestamptz;
begin
  if auth.uid() is null then raise exception 'authentication required'; end if;
  if trim(coalesce(p_title,''))='' then raise exception 'title is required'; end if;
  if p_recurrence not in ('one_time','weekly') then raise exception 'unsupported recurrence'; end if;
  if p_deadline_hour not between 0 and 23 or p_deadline_minute not between 0 and 59 then raise exception 'invalid deadline time'; end if;
  if p_minimum_duration not between 1 and 1440 then raise exception 'invalid duration'; end if;
  if p_proof_window_minutes not between 5 and 1440 then raise exception 'invalid proof window'; end if;
  if p_redemption_window_hours not between 1 and 168 then raise exception 'invalid redemption window'; end if;
  if p_circle_id is not null and not public.is_circle_member(p_circle_id) then raise exception 'not a circle member'; end if;
  if p_recurrence='weekly' and coalesce(array_length(p_days_of_week,1),0)=0 then raise exception 'choose at least one day'; end if;
  if not public.has_active_pro() then
    if p_proof_method<>'live_photo' or p_requires_location then raise exception 'CalledOut Pro is required for combined proof'; end if;
    if trim(p_consequence)<>'Complete a verified 30-minute redemption workout' or p_redemption_window_hours<>24 then raise exception 'CalledOut Pro is required for custom consequences'; end if;
  end if;

  select timezone into v_tz from public.profiles where id=auth.uid();

  if p_recurrence='one_time' then
    v_deadline := ((p_commitment_date::text||' '||make_time(p_deadline_hour,p_deadline_minute,0)::text)::timestamp at time zone v_tz);
    if v_deadline<=now() then raise exception 'deadline must be in the future'; end if;
    insert into public.commitments(
      id,user_id,circle_id,title,workout_type,commitment_date,proof_window_starts_at,
      deadline_at,timezone,minimum_duration_minutes,proof_method,requires_location,
      redemption_rules,status
    ) values (
      v_id,auth.uid(),p_circle_id,trim(p_title),p_workout_type,p_commitment_date,
      v_deadline-make_interval(mins=>p_proof_window_minutes),v_deadline,v_tz,
      p_minimum_duration,p_proof_method,p_requires_location,
      jsonb_build_object('type','verified_workout','minutes',greatest(30,p_minimum_duration),'window_hours',p_redemption_window_hours,'consequence',trim(p_consequence)),
      case when now()>=v_deadline-make_interval(mins=>p_proof_window_minutes)
           then 'proof_window_open'::public.commitment_status else 'upcoming'::public.commitment_status end
    );
  else
    if not public.has_active_pro() and exists(
      select 1 from public.commitment_schedules
      where user_id=auth.uid() and is_active and deleted_at is null
    ) then raise exception 'CalledOut Pro is required for additional recurring schedules'; end if;

    insert into public.commitment_schedules(
      id,user_id,circle_id,title,workout_type,timezone,days_of_week,deadline_local,
      proof_window_minutes,minimum_duration_minutes,proof_method,requires_location,
      active_from,consequence_text,redemption_window_hours
    ) values (
      v_id,auth.uid(),p_circle_id,trim(p_title),p_workout_type,v_tz,p_days_of_week::smallint[],
      make_time(p_deadline_hour,p_deadline_minute,0),p_proof_window_minutes,
      p_minimum_duration,p_proof_method,p_requires_location,greatest(p_commitment_date,current_date),
      trim(p_consequence),p_redemption_window_hours
    );
    perform public.generate_commitments_for_schedule(v_id,current_date+60);
  end if;

  insert into public.audit_logs(actor_id,action,entity_type,entity_id,after_state)
  values(auth.uid(),'commitment_plan_created',case when p_recurrence='weekly' then 'commitment_schedule' else 'commitment' end,v_id,
    jsonb_build_object('recurrence',p_recurrence,'days',p_days_of_week,'deadline_hour',p_deadline_hour,'deadline_minute',p_deadline_minute));
  return v_id;
end $$;

grant execute on function public.create_commitment_plan(text,public.workout_type,text,integer[],date,integer,integer,integer,public.proof_method,boolean,uuid,integer,text,integer) to authenticated;

create or replace function public.create_schedule_with_commitments(
  p_title text,p_workout_type public.workout_type,p_days_of_week integer[],p_deadline_hour integer,
  p_minimum_duration integer,p_proof_method public.proof_method,p_requires_location boolean,p_circle_id uuid default null
) returns uuid
language sql
security definer
set search_path=public
as $$
  select public.create_commitment_plan(
    p_title,p_workout_type,'weekly',p_days_of_week,current_date,p_deadline_hour,0,
    p_minimum_duration,p_proof_method,p_requires_location,p_circle_id,240,
    'Complete a verified 30-minute redemption workout',24
  )
$$;

create or replace function public.cast_verification_vote(p_submission uuid,p_vote text,p_reason text default null)
returns void
language plpgsql
security definer
set search_path=public
as $$
declare
  v_proof public.proof_submissions%rowtype;
  v_commit public.commitments%rowtype;
  v_accept int;
  v_reject int;
  v_threshold int;
  v_missed_id uuid;
  v_is_redemption boolean;
begin
  if p_vote not in ('accept','reject') then raise exception 'invalid vote'; end if;
  select * into v_proof
  from public.proof_submissions
  where id=p_submission and status='circle_review'
  for update;
  if not found then raise exception 'proof is not available for review'; end if;
  select * into v_commit from public.commitments where id=v_proof.commitment_id for update;
  if not found or v_commit.circle_id is null or not public.is_circle_member(v_commit.circle_id) or v_commit.user_id=auth.uid() then
    raise exception 'not authorized to review';
  end if;

  insert into public.verification_votes(proof_submission_id,voter_id,vote,reason)
  values(p_submission,auth.uid(),p_vote,p_reason)
  on conflict(proof_submission_id,voter_id) do update set vote=excluded.vote,reason=excluded.reason;

  select count(*) filter(where vote='accept'),count(*) filter(where vote='reject')
  into v_accept,v_reject from public.verification_votes where proof_submission_id=p_submission;
  select greatest(1,least(2,count(*)::int-1)) into v_threshold
  from public.circle_members where circle_id=v_commit.circle_id and status='active' and deleted_at is null;
  select exists(select 1 from public.redemptions where redemption_commitment_id=v_commit.id) into v_is_redemption;

  if v_accept>=v_threshold then
    update public.proof_submissions set status='verified',decided_at=now() where id=p_submission;
    update public.commitments set status='verified',verified_at=now(),missed_at=null where id=v_commit.id;
    if not exists(select 1 from public.activity_events where proof_submission_id=p_submission and event_type='proof_verified' and deleted_at is null) then
      insert into public.activity_events(actor_id,circle_id,commitment_id,proof_submission_id,event_type,payload)
      values(v_commit.user_id,v_commit.circle_id,v_commit.id,p_submission,'proof_verified',jsonb_build_object('title',v_commit.title,'circle_review',true));
    end if;
    insert into public.notification_outbox(user_id,category,title,body,data)
    values(v_commit.user_id,'proof_results','Receipt verified',v_commit.title||' was accepted by the circle.',jsonb_build_object('commitment_id',v_commit.id,'submission_id',p_submission));
  elsif v_reject>=v_threshold then
    update public.proof_submissions set status='rejected',decided_at=now() where id=p_submission;
    update public.commitments set status='rejected',missed_at=now() where id=v_commit.id;
    if v_is_redemption then
      update public.redemptions set status='expired',deadline_at=least(deadline_at,now())
      where redemption_commitment_id=v_commit.id and status in ('available','in_progress');
      update public.commitments original set status='missed'
      from public.missed_commitments m join public.redemptions r on r.missed_commitment_id=m.id
      where r.redemption_commitment_id=v_commit.id and original.id=m.commitment_id and original.status='redemption_available';
    else
      update public.commitments set status='missed' where id=v_commit.id;
      insert into public.missed_commitments(commitment_id,user_id,circle_id,missed_at)
      values(v_commit.id,v_commit.user_id,v_commit.circle_id,now())
      on conflict(commitment_id) do update set missed_at=excluded.missed_at
      returning id into v_missed_id;
      insert into public.redemptions(missed_commitment_id,user_id,status,rules,opens_at,deadline_at)
      values(v_missed_id,v_commit.user_id,'available',v_commit.redemption_rules,now(),now()+make_interval(hours=>coalesce((v_commit.redemption_rules->>'window_hours')::int,24)))
      on conflict(missed_commitment_id) do nothing;
      if not exists(select 1 from public.activity_events where commitment_id=v_commit.id and event_type='commitment_missed' and deleted_at is null) then
        insert into public.activity_events(actor_id,circle_id,commitment_id,event_type,payload)
        values(v_commit.user_id,v_commit.circle_id,v_commit.id,'commitment_missed',jsonb_build_object('title',v_commit.title,'reason','circle_review_rejected'));
      end if;
    end if;
    insert into public.notification_outbox(user_id,category,title,body,data)
    values(v_commit.user_id,'proof_results','Receipt rejected',v_commit.title||' was rejected by the circle.',jsonb_build_object('commitment_id',v_commit.id,'submission_id',p_submission));
  end if;
end $$;

grant execute on function public.cast_verification_vote(uuid,text,text) to authenticated;

create or replace function public.start_redemption(p_commitment_id uuid)
returns uuid
language plpgsql
security definer
set search_path=public
as $$
declare
  v_missed public.missed_commitments%rowtype;
  v_original public.commitments%rowtype;
  v_redemption public.redemptions%rowtype;
  v_commit uuid;
  v_minutes integer;
  v_window integer;
  v_remaining integer;
begin
  select * into v_missed
  from public.missed_commitments
  where commitment_id=p_commitment_id and user_id=auth.uid() and deleted_at is null
  for update;
  if not found then raise exception 'missed commitment not found'; end if;

  select * into v_original
  from public.commitments
  where id=v_missed.commitment_id and user_id=auth.uid()
  for update;
  if not found then raise exception 'original commitment not found'; end if;

  select * into v_redemption from public.redemptions where missed_commitment_id=v_missed.id for update;
  if found and v_redemption.status='completed' then return v_redemption.id; end if;
  if found and (v_redemption.status='expired' or v_redemption.deadline_at<=now()) then
    update public.redemptions set status='expired' where id=v_redemption.id;
    raise exception 'redemption window has expired';
  end if;
  if found and v_redemption.status='in_progress' and v_redemption.redemption_commitment_id is not null then return v_redemption.id; end if;

  v_minutes := coalesce((v_original.redemption_rules->>'minutes')::integer,30);
  v_window := coalesce((v_original.redemption_rules->>'window_hours')::integer,24);
  v_commit := gen_random_uuid();

  if found then
    update public.redemptions
    set status='in_progress'
    where id=v_redemption.id
    returning * into v_redemption;
  else
    insert into public.redemptions(missed_commitment_id,user_id,status,rules,opens_at,deadline_at)
    values(v_missed.id,auth.uid(),'in_progress',v_original.redemption_rules,now(),now()+make_interval(hours=>v_window))
    returning * into v_redemption;
  end if;

  insert into public.commitments(
    id,user_id,circle_id,title,workout_type,commitment_date,proof_window_starts_at,
    deadline_at,timezone,minimum_duration_minutes,proof_method,requires_location,status,
    redemption_rules
  ) values (
    v_commit,v_original.user_id,v_original.circle_id,'Redemption: '||v_original.title,
    v_original.workout_type,(now() at time zone v_original.timezone)::date,now(),
    v_redemption.deadline_at,v_original.timezone,v_minutes,'live_photo',false,
    'proof_window_open','{}'::jsonb
  );

  update public.redemptions set redemption_commitment_id=v_commit where id=v_redemption.id;
  update public.commitments set status='redemption_available' where id=p_commitment_id;
  v_remaining:=greatest(1,ceil(extract(epoch from (v_redemption.deadline_at-now()))/3600.0)::integer);
  insert into public.notification_outbox(user_id,category,title,body,data)
  values(auth.uid(),'redemption_started','Redemption started','About '||v_remaining||' hours remain to answer the miss.',jsonb_build_object('commitment_id',v_commit,'original_commitment_id',p_commitment_id));
  return v_redemption.id;
end $$;

create or replace function public.complete_redemption_trigger()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
declare
  v_red public.redemptions%rowtype;
  v_missed public.missed_commitments%rowtype;
begin
  if new.status='verified' and old.status is distinct from new.status then
    select * into v_red
    from public.redemptions
    where redemption_commitment_id=new.id and status in ('in_progress','expired')
    for update;
    if found then
      update public.redemptions set status='completed',completed_at=now() where id=v_red.id;
      update public.missed_commitments set redeemed_at=now() where id=v_red.missed_commitment_id returning * into v_missed;
      update public.commitments set status='redeemed' where id=v_missed.commitment_id;
      insert into public.activity_events(actor_id,circle_id,commitment_id,event_type,payload)
      values(new.user_id,new.circle_id,v_missed.commitment_id,'redemption_completed',jsonb_build_object('redemption_commitment_id',new.id,'title',new.title));
      insert into public.notification_outbox(user_id,category,title,body,data)
      values(new.user_id,'redemption_completed','Redemption complete','The miss stays in your record. The response does too.',jsonb_build_object('commitment_id',v_missed.commitment_id));
    end if;
  end if;
  return new;
end $$;

drop trigger if exists complete_redemption_after_verification on public.commitments;
create trigger complete_redemption_after_verification
after update of status on public.commitments
for each row execute function public.complete_redemption_trigger();


alter table public.notification_outbox add column if not exists dedupe_key text;
create unique index if not exists notification_outbox_dedupe_idx on public.notification_outbox(dedupe_key) where dedupe_key is not null;

create or replace function public.queue_commitment_reminders(p_through timestamptz default now()+interval '7 days')
returns integer
language plpgsql
security definer
set search_path=public
as $$
declare v_total integer:=0;v_rows integer:=0;
begin
  insert into public.notification_outbox(user_id,category,title,body,data,deliver_after,dedupe_key)
  select c.user_id,'morning_reminder','Promise on the clock',c.title||' is due today at '||to_char(c.deadline_at at time zone c.timezone,'HH12:MI AM')||'.',jsonb_build_object('commitment_id',c.id),
    ((c.commitment_date::text||' 08:00:00')::timestamp at time zone c.timezone),'commitment:'||c.id||':morning'
  from public.commitments c join public.notification_preferences n on n.user_id=c.user_id
  where n.morning_reminder and c.status='upcoming' and c.deleted_at is null
    and ((c.commitment_date::text||' 08:00:00')::timestamp at time zone c.timezone)>now()
    and ((c.commitment_date::text||' 08:00:00')::timestamp at time zone c.timezone)<=p_through
    and ((c.commitment_date::text||' 08:00:00')::timestamp at time zone c.timezone)<c.deadline_at
  on conflict(dedupe_key) where dedupe_key is not null do nothing;
  get diagnostics v_rows=row_count;v_total:=v_total+v_rows;

  insert into public.notification_outbox(user_id,category,title,body,data,deliver_after,dedupe_key)
  select c.user_id,'two_hour_warning','Two hours left',c.title||' is still waiting for a receipt.',jsonb_build_object('commitment_id',c.id),c.deadline_at-interval '2 hours','commitment:'||c.id||':2h'
  from public.commitments c join public.notification_preferences n on n.user_id=c.user_id
  where n.two_hour_warning and c.status in ('upcoming','proof_window_open') and c.deleted_at is null
    and c.deadline_at-interval '2 hours'>now() and c.deadline_at-interval '2 hours'<=p_through
  on conflict(dedupe_key) where dedupe_key is not null do nothing;
  get diagnostics v_rows=row_count;v_total:=v_total+v_rows;

  insert into public.notification_outbox(user_id,category,title,body,data,deliver_after,dedupe_key)
  select c.user_id,'thirty_minute_warning','Thirty minutes.','Submit a fresh receipt for '||c.title||' before the promise expires.',jsonb_build_object('commitment_id',c.id),c.deadline_at-interval '30 minutes','commitment:'||c.id||':30m'
  from public.commitments c join public.notification_preferences n on n.user_id=c.user_id
  where n.thirty_minute_warning and c.status in ('upcoming','proof_window_open') and c.deleted_at is null
    and c.deadline_at-interval '30 minutes'>now() and c.deadline_at-interval '30 minutes'<=p_through
  on conflict(dedupe_key) where dedupe_key is not null do nothing;
  get diagnostics v_rows=row_count;v_total:=v_total+v_rows;

  insert into public.notification_outbox(user_id,category,title,body,data,deliver_after,dedupe_key)
  select r.user_id,'redemption_warning','Redemption closing','Two hours remain to answer the miss.',jsonb_build_object('redemption_id',r.id,'commitment_id',r.redemption_commitment_id),r.deadline_at-interval '2 hours','redemption:'||r.id||':2h'
  from public.redemptions r join public.notification_preferences n on n.user_id=r.user_id
  where n.redemption_warning and r.status='in_progress' and r.deadline_at-interval '2 hours'>now() and r.deadline_at-interval '2 hours'<=p_through
  on conflict(dedupe_key) where dedupe_key is not null do nothing;
  get diagnostics v_rows=row_count;v_total:=v_total+v_rows;
  return v_total;
end $$;

revoke all on function public.queue_commitment_reminders(timestamptz) from public,anon,authenticated;
grant execute on function public.queue_commitment_reminders(timestamptz) to service_role;

create or replace function public.process_commitment_deadlines()
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_generated int:=0;
  v_opened int:=0;
  v_missed int:=0;
  v_expired int:=0;
  v_granted int:=0;
  v_queued int:=0;
begin
  perform pg_advisory_xact_lock(hashtext('calledout_deadline_job'));
  v_generated:=public.generate_active_commitments(current_date+60);
  v_granted:=public.grant_monthly_grace_passes();
  v_queued:=public.queue_commitment_reminders(now()+interval '7 days');

  with opened as (
    update public.commitments set status='proof_window_open'
    where status='upcoming' and proof_window_starts_at<=now() and deadline_at>now()
    returning *
  )
  insert into public.notification_outbox(user_id,category,title,body,data)
  select user_id,'proof_window_opened','Proof window open',
    'Your proof window is open. Excuses expire at '||to_char(deadline_at at time zone timezone,'HH12:MI AM')||'.',
    jsonb_build_object('commitment_id',id) from opened;
  get diagnostics v_opened=row_count;

  update public.commitments c set status='rejected',missed_at=now()
  from public.redemptions r
  where r.redemption_commitment_id=c.id
    and r.status in ('available','in_progress')
    and r.deadline_at<now()
    and c.status in ('upcoming','proof_window_open','proof_submitted','under_review')
    and not exists(
      select 1 from public.proof_submissions p
      where p.commitment_id=c.id and p.deleted_at is null
        and p.status in ('pending_upload','processing','circle_review','disputed')
        and p.captured_at>=c.proof_window_starts_at
        and p.captured_at<=c.deadline_at+make_interval(mins=>c.grace_period_minutes)
    );

  update public.commitments c set status='under_review'
  where c.status='proof_submitted'
    and c.deadline_at+make_interval(mins=>c.grace_period_minutes)<now()
    and exists(
      select 1 from public.proof_submissions p
      where p.commitment_id=c.id and p.deleted_at is null
        and p.status in ('pending_upload','processing','circle_review','disputed')
        and p.captured_at>=c.proof_window_starts_at
        and p.captured_at<=c.deadline_at+make_interval(mins=>c.grace_period_minutes)
    );

  with changed as (
    update public.commitments c set status='missed',missed_at=now()
    where c.status in ('upcoming','proof_window_open','proof_submitted')
      and c.deadline_at+make_interval(mins=>c.grace_period_minutes)<now()
      and not exists(select 1 from public.redemptions r where r.redemption_commitment_id=c.id)
      and not exists(
        select 1 from public.proof_submissions p
        where p.commitment_id=c.id and p.deleted_at is null
          and p.status in ('pending_upload','processing','circle_review','disputed')
          and p.captured_at>=c.proof_window_starts_at
          and p.captured_at<=c.deadline_at+make_interval(mins=>c.grace_period_minutes)
      )
    returning c.*
  ), inserted as (
    insert into public.missed_commitments(commitment_id,user_id,circle_id,missed_at)
    select id,user_id,circle_id,coalesce(missed_at,now()) from changed
    on conflict(commitment_id) do nothing returning *
  )
  insert into public.notification_outbox(user_id,category,title,body,data)
  select user_id,'commitment_missed','You missed it.','The Wall has been updated.',jsonb_build_object('commitment_id',commitment_id)
  from inserted;
  get diagnostics v_missed=row_count;

  insert into public.redemptions(missed_commitment_id,user_id,status,rules,opens_at,deadline_at)
  select m.id,m.user_id,'available',c.redemption_rules,now(),
    now()+make_interval(hours=>coalesce((c.redemption_rules->>'window_hours')::int,24))
  from public.missed_commitments m
  join public.commitments c on c.id=m.commitment_id
  left join public.redemptions r on r.missed_commitment_id=m.id
  where r.id is null and m.missed_at>now()-interval '5 minutes';

  insert into public.activity_events(actor_id,circle_id,commitment_id,event_type,payload)
  select c.user_id,c.circle_id,c.id,'commitment_missed',jsonb_build_object('title',c.title)
  from public.commitments c
  left join public.activity_events a on a.commitment_id=c.id and a.event_type='commitment_missed'
  where c.status='missed' and c.missed_at>now()-interval '5 minutes' and a.id is null;

  update public.redemptions r set status='expired'
  where r.status in ('available','in_progress') and r.deadline_at<now()
    and not exists(
      select 1 from public.proof_submissions p
      join public.commitments c on c.id=p.commitment_id
      where c.id=r.redemption_commitment_id and p.deleted_at is null
        and p.status in ('pending_upload','processing','circle_review','disputed')
        and p.captured_at>=c.proof_window_starts_at
        and p.captured_at<=c.deadline_at+make_interval(mins=>c.grace_period_minutes)
    );
  get diagnostics v_expired=row_count;

  update public.commitments original set status='missed'
  from public.missed_commitments m join public.redemptions r on r.missed_commitment_id=m.id
  where r.status='expired' and original.id=m.commitment_id and original.status='redemption_available';

  return jsonb_build_object(
    'generated',v_generated,'opened',v_opened,'missed',v_missed,
    'redemptions_expired',v_expired,'grace_passes_granted',v_granted,'reminders_queued',v_queued,'processed_at',now()
  );
end $$;

drop view if exists public.wall_rankings;
drop view if exists public.wall_miss_details;
create view public.wall_miss_details with (security_invoker=true) as
select
  m.id as missed_id,
  m.commitment_id,
  m.circle_id,
  m.user_id,
  m.missed_at,
  m.redeemed_at,
  c.title,
  c.workout_type,
  c.deadline_at,
  p.display_name,
  p.username,
  p.avatar_path,
  p.completion_rate,
  r.status as redemption_status,
  r.deadline_at as redemption_deadline_at,
  (select count(*)::int from public.reactions rx where rx.missed_commitment_id=m.id and rx.deleted_at is null) as reaction_count
from public.missed_commitments m
join public.commitments c on c.id=m.commitment_id
join public.profiles p on p.id=m.user_id
left join public.redemptions r on r.missed_commitment_id=m.id
where m.wall_visible and m.deleted_at is null and m.circle_id is not null
  and public.is_circle_member(m.circle_id)
  and not public.users_blocked(auth.uid(),m.user_id);

grant select on public.wall_miss_details to authenticated;

create view public.wall_rankings with (security_invoker=true) as
select
  circle_id,user_id,min(missed_id) as id,count(*)::int as missed_count,max(missed_at) as most_recent_missed_at,
  max(completion_rate) as completion_rate,max(display_name) as display_name,max(username::text) as username,
  max(avatar_path) as avatar_path,
  bool_or(redemption_status='in_progress') as redemption_in_progress
from public.wall_miss_details
group by circle_id,user_id;

grant select on public.wall_rankings to authenticated;

create or replace function public.get_circle_invite(p_circle_id uuid)
returns text
language plpgsql
security definer
set search_path=public
as $$
declare v_code text;
begin
  if not public.is_circle_member(p_circle_id) then raise exception 'not a circle member'; end if;
  select code::text into v_code from public.circle_invites
  where circle_id=p_circle_id and revoked_at is null and (expires_at is null or expires_at>now())
  order by created_at desc limit 1;
  if v_code is null then
    v_code:=upper(substr(encode(gen_random_bytes(8),'hex'),1,8));
    insert into public.circle_invites(circle_id,code,created_by,expires_at)
    values(p_circle_id,v_code,auth.uid(),now()+interval '30 days');
  end if;
  return v_code;
end $$;
grant execute on function public.get_circle_invite(uuid) to authenticated;

create or replace function public.leave_circle(p_circle_id uuid)
returns void
language plpgsql
security definer
set search_path=public
as $$
declare
  v_role public.circle_role;
  v_replacement uuid;
begin
  select role into v_role from public.circle_members
  where circle_id=p_circle_id and user_id=auth.uid() and status='active' and deleted_at is null
  for update;
  if not found then raise exception 'membership not found'; end if;

  if v_role='owner' then
    select user_id into v_replacement
    from public.circle_members
    where circle_id=p_circle_id and user_id<>auth.uid() and status='active' and deleted_at is null
    order by case when role='moderator' then 0 else 1 end,joined_at
    limit 1
    for update;

    if v_replacement is null then
      update public.commitment_schedules set circle_id=null
      where circle_id=p_circle_id and user_id=auth.uid();
      update public.commitments set circle_id=null,visibility='only_me'
      where circle_id=p_circle_id and user_id=auth.uid();
      update public.circle_invites set revoked_at=now() where circle_id=p_circle_id and revoked_at is null;
      update public.circle_members set status='left',deleted_at=now() where circle_id=p_circle_id and user_id=auth.uid();
      update public.circles set deleted_at=now() where id=p_circle_id;
      insert into public.audit_logs(actor_id,action,entity_type,entity_id)
      values(auth.uid(),'solo_circle_deleted','circle',p_circle_id);
      return;
    end if;

    update public.circle_members set role='owner' where circle_id=p_circle_id and user_id=v_replacement;
    update public.circles set owner_id=v_replacement where id=p_circle_id;
  end if;

  update public.circle_members set status='left',deleted_at=now()
  where circle_id=p_circle_id and user_id=auth.uid();
  insert into public.audit_logs(actor_id,action,entity_type,entity_id,after_state)
  values(auth.uid(),'circle_left','circle',p_circle_id,jsonb_build_object('ownership_transferred_to',v_replacement));
end $$;
grant execute on function public.leave_circle(uuid) to authenticated;

create or replace function public.block_member(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path=public
as $$
begin
  if p_user_id=auth.uid() then raise exception 'cannot block yourself'; end if;
  insert into public.blocks(blocker_id,blocked_id) values(auth.uid(),p_user_id) on conflict do nothing;
end $$;
grant execute on function public.block_member(uuid) to authenticated;

create or replace function public.report_member(p_user_id uuid,p_reason text,p_details text default null)
returns uuid
language plpgsql
security definer
set search_path=public
as $$
declare v_id uuid;
begin
  if trim(coalesce(p_reason,''))='' then raise exception 'reason is required'; end if;
  insert into public.reports(reporter_id,reported_user_id,reason,details)
  values(auth.uid(),p_user_id,trim(p_reason),nullif(trim(coalesce(p_details,'')),''))
  returning id into v_id;
  return v_id;
end $$;
grant execute on function public.report_member(uuid,text,text) to authenticated;


drop index if exists public.proof_one_active_idx;
create unique index proof_one_active_idx on public.proof_submissions(commitment_id)
where status not in ('rejected','more_proof_required') and deleted_at is null;

drop policy if exists proofs_insert_self on public.proof_submissions;
create policy proofs_insert_self on public.proof_submissions for insert
with check(
  user_id=auth.uid()
  and exists(
    select 1 from public.commitments c
    where c.id=commitment_id and c.user_id=auth.uid()
      and c.status in ('upcoming','proof_window_open')
      and captured_at<=c.deadline_at+make_interval(mins=>c.grace_period_minutes)
  )
);


create or replace function public.dispute_proof(p_submission_id uuid,p_reason text)
returns void
language plpgsql
security definer
set search_path=public
as $$
declare v_proof public.proof_submissions%rowtype;
begin
  select p.* into v_proof
  from public.proof_submissions p join public.commitments c on c.id=p.commitment_id
  where p.id=p_submission_id and p.user_id=auth.uid() and c.user_id=auth.uid()
    and p.status in ('rejected','more_proof_required');
  if not found then raise exception 'proof is not eligible for dispute'; end if;
  if trim(coalesce(p_reason,''))='' then raise exception 'dispute reason is required'; end if;
  update public.proof_submissions set status='disputed',dispute_reason=trim(p_reason) where id=p_submission_id;
  update public.commitments set status='under_review' where id=v_proof.commitment_id;
  insert into public.reports(reporter_id,proof_submission_id,reason,details)
  values(auth.uid(),p_submission_id,'verification_dispute',trim(p_reason));
  insert into public.audit_logs(actor_id,action,entity_type,entity_id,after_state)
  values(auth.uid(),'proof_disputed','proof_submission',p_submission_id,jsonb_build_object('reason',trim(p_reason)));
end $$;
grant execute on function public.dispute_proof(uuid,text) to authenticated;

create or replace function public.sync_notification_timezone_trigger()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  update public.notification_preferences set timezone=new.timezone where user_id=new.id;
  return new;
end $$;
drop trigger if exists sync_notification_timezone on public.profiles;
create trigger sync_notification_timezone after update of timezone on public.profiles
for each row when (old.timezone is distinct from new.timezone) execute function public.sync_notification_timezone_trigger();
update public.notification_preferences n set timezone=p.timezone from public.profiles p where p.id=n.user_id;

-- Backfill statistics and future occurrences after migration.
select public.refresh_profile_stats(id) from public.profiles;
select public.generate_active_commitments(current_date+60);

create or replace function public.set_schedule_active(p_schedule_id uuid,p_active boolean)
returns void
language plpgsql
security definer
set search_path=public
as $$
declare
  v_schedule public.commitment_schedules%rowtype;
begin
  select * into v_schedule
  from public.commitment_schedules
  where id=p_schedule_id and user_id=auth.uid() and deleted_at is null
  for update;
  if not found then raise exception 'schedule not found'; end if;

  update public.commitment_schedules
  set is_active=p_active,updated_at=now()
  where id=p_schedule_id;

  if p_active then
    perform public.generate_commitments_for_schedule(p_schedule_id,current_date+60);
  else
    delete from public.commitments c
    where c.schedule_id=p_schedule_id
      and c.status='upcoming'
      and c.proof_window_starts_at>now()
      and not exists(select 1 from public.proof_submissions p where p.commitment_id=c.id and p.deleted_at is null);
  end if;

  insert into public.audit_logs(actor_id,action,entity_type,entity_id,after_state)
  values(auth.uid(),case when p_active then 'schedule_resumed' else 'schedule_paused' end,'commitment_schedule',p_schedule_id,jsonb_build_object('is_active',p_active));
end $$;

grant execute on function public.set_schedule_active(uuid,boolean) to authenticated;

create or replace function public.delete_schedule(p_schedule_id uuid)
returns void
language plpgsql
security definer
set search_path=public
as $$
begin
  if not exists(select 1 from public.commitment_schedules where id=p_schedule_id and user_id=auth.uid() and deleted_at is null) then
    raise exception 'schedule not found';
  end if;
  delete from public.commitments c
  where c.schedule_id=p_schedule_id
    and c.status='upcoming'
    and c.proof_window_starts_at>now()
    and not exists(select 1 from public.proof_submissions p where p.commitment_id=c.id and p.deleted_at is null);
  update public.commitment_schedules set is_active=false,deleted_at=now(),updated_at=now() where id=p_schedule_id;
  insert into public.audit_logs(actor_id,action,entity_type,entity_id)
  values(auth.uid(),'schedule_deleted','commitment_schedule',p_schedule_id);
end $$;

grant execute on function public.delete_schedule(uuid) to authenticated;


create or replace function public.request_circle_review(p_submission_id uuid)
returns void
language plpgsql
security definer
set search_path=public
as $$
declare
  v_proof public.proof_submissions%rowtype;
  v_commit public.commitments%rowtype;
  v_reviewers integer;
begin
  select * into v_proof from public.proof_submissions
  where id=p_submission_id and user_id=auth.uid() and status='more_proof_required'
  for update;
  if not found then raise exception 'proof is not eligible for circle review'; end if;
  select * into v_commit from public.commitments where id=v_proof.commitment_id and user_id=auth.uid() for update;
  if not found or v_commit.circle_id is null then raise exception 'a circle is required'; end if;
  if now()>v_commit.deadline_at+interval '24 hours' then raise exception 'circle review window has closed'; end if;
  select count(*) into v_reviewers from public.circle_members
  where circle_id=v_commit.circle_id and status='active' and deleted_at is null and user_id<>auth.uid();
  if v_reviewers=0 then raise exception 'no eligible circle reviewers'; end if;
  update public.proof_submissions set status='circle_review',decided_at=null where id=p_submission_id;
  update public.commitments set status='under_review' where id=v_commit.id;
  insert into public.notification_outbox(user_id,category,title,body,data)
  select user_id,'review_required','Receipt needs review',v_commit.title||' needs a circle decision.',jsonb_build_object('circle_id',v_commit.circle_id,'submission_id',p_submission_id)
  from public.circle_members
  where circle_id=v_commit.circle_id and status='active' and deleted_at is null and user_id<>auth.uid();
  insert into public.audit_logs(actor_id,action,entity_type,entity_id)
  values(auth.uid(),'circle_review_requested','proof_submission',p_submission_id);
end $$;

grant execute on function public.request_circle_review(uuid) to authenticated;

create or replace function public.admin_resolve_proof(p_submission_id uuid,p_decision text,p_notes text default null)
returns void
language plpgsql
security definer
set search_path=public
as $$
declare
  v_proof public.proof_submissions%rowtype;
  v_commit public.commitments%rowtype;
  v_missed_id uuid;
  v_is_redemption boolean;
begin
  if not public.is_admin() then raise exception 'admin authorization required'; end if;
  if p_decision not in ('accept','reject') then raise exception 'invalid proof decision'; end if;
  select * into v_proof from public.proof_submissions where id=p_submission_id for update;
  if not found then raise exception 'proof not found'; end if;
  select * into v_commit from public.commitments where id=v_proof.commitment_id for update;
  if not found then raise exception 'commitment not found'; end if;
  select exists(select 1 from public.redemptions where redemption_commitment_id=v_commit.id) into v_is_redemption;

  if p_decision='accept' then
    update public.proof_submissions set status='verified',decided_at=now() where id=v_proof.id;
    update public.commitments set status='verified',verified_at=now(),missed_at=null where id=v_commit.id;
    if not v_is_redemption then
      update public.activity_events set deleted_at=now()
      where commitment_id=v_commit.id and event_type='commitment_missed' and deleted_at is null;
      update public.commitments set deleted_at=now(),status='rejected'
      where id in (
        select r.redemption_commitment_id
        from public.redemptions r
        join public.missed_commitments m on m.id=r.missed_commitment_id
        where m.commitment_id=v_commit.id and r.redemption_commitment_id is not null
      );
      delete from public.missed_commitments where commitment_id=v_commit.id;
    end if;
    if not exists(select 1 from public.activity_events where proof_submission_id=v_proof.id and event_type='proof_verified' and deleted_at is null) then
      insert into public.activity_events(actor_id,circle_id,commitment_id,proof_submission_id,event_type,payload)
      values(v_commit.user_id,v_commit.circle_id,v_commit.id,v_proof.id,'proof_verified',jsonb_build_object('title',v_commit.title,'admin_review',true));
    end if;
  else
    update public.proof_submissions set status='rejected',decided_at=now() where id=v_proof.id;
    update public.commitments set status='rejected',missed_at=now() where id=v_commit.id;
    if v_is_redemption then
      update public.redemptions set status='expired',deadline_at=least(deadline_at,now()) where redemption_commitment_id=v_commit.id and status in ('available','in_progress');
      update public.commitments original set status='missed'
      from public.missed_commitments m join public.redemptions r on r.missed_commitment_id=m.id
      where r.redemption_commitment_id=v_commit.id and original.id=m.commitment_id and original.status='redemption_available';
    else
      update public.commitments set status='missed' where id=v_commit.id;
      insert into public.missed_commitments(commitment_id,user_id,circle_id,missed_at)
      values(v_commit.id,v_commit.user_id,v_commit.circle_id,now())
      on conflict(commitment_id) do update set missed_at=excluded.missed_at
      returning id into v_missed_id;
      insert into public.redemptions(missed_commitment_id,user_id,status,rules,opens_at,deadline_at)
      values(v_missed_id,v_commit.user_id,'available',v_commit.redemption_rules,now(),now()+make_interval(hours=>coalesce((v_commit.redemption_rules->>'window_hours')::int,24)))
      on conflict(missed_commitment_id) do nothing;
      if not exists(select 1 from public.activity_events where commitment_id=v_commit.id and event_type='commitment_missed' and deleted_at is null) then
        insert into public.activity_events(actor_id,circle_id,commitment_id,event_type,payload)
        values(v_commit.user_id,v_commit.circle_id,v_commit.id,'commitment_missed',jsonb_build_object('title',v_commit.title,'reason','admin_review_rejected'));
      end if;
    end if;
  end if;

  update public.reports set status='actioned',assigned_admin_id=auth.uid(),resolved_at=now()
  where proof_submission_id=p_submission_id and status in ('open','triaged','appealed');
  insert into public.notification_outbox(user_id,category,title,body,data)
  values(v_commit.user_id,'proof_results',case when p_decision='accept' then 'Appeal accepted' else 'Appeal denied' end,
    case when p_decision='accept' then v_commit.title||' is verified.' else 'The proof decision for '||v_commit.title||' was upheld.' end,
    jsonb_build_object('commitment_id',v_commit.id,'submission_id',v_proof.id));
  insert into public.audit_logs(actor_id,action,entity_type,entity_id,after_state)
  values(auth.uid(),'admin_proof_'||p_decision,'proof_submission',p_submission_id,jsonb_build_object('notes',p_notes));
end $$;

grant execute on function public.admin_resolve_proof(uuid,text,text) to authenticated;


create or replace function public.toggle_miss_reaction(p_missed_id uuid,p_reaction public.reaction_type)
returns boolean
language plpgsql
security definer
set search_path=public
as $$
declare
  v_miss public.missed_commitments%rowtype;
begin
  select * into v_miss from public.missed_commitments
  where id=p_missed_id and deleted_at is null and wall_visible
  for update;
  if not found or v_miss.circle_id is null or not public.is_circle_member(v_miss.circle_id) then raise exception 'miss not available'; end if;
  if v_miss.user_id=auth.uid() then raise exception 'you cannot react to your own miss'; end if;
  if exists(select 1 from public.reactions where user_id=auth.uid() and missed_commitment_id=p_missed_id and reaction_type=p_reaction and deleted_at is null) then
    delete from public.reactions where user_id=auth.uid() and missed_commitment_id=p_missed_id and reaction_type=p_reaction;
    return false;
  end if;
  insert into public.reactions(user_id,missed_commitment_id,reaction_type)
  values(auth.uid(),p_missed_id,p_reaction)
  on conflict(user_id,missed_commitment_id,reaction_type) do update set deleted_at=null,updated_at=now();
  return true;
end $$;

grant execute on function public.toggle_miss_reaction(uuid,public.reaction_type) to authenticated;

commit;
