begin;

alter table public.notification_outbox
  drop constraint if exists notification_outbox_status_check;
alter table public.notification_outbox
  add constraint notification_outbox_status_check
  check(status in ('pending','processing','sent','failed','cancelled'));

alter table public.notification_outbox
  add column if not exists claimed_at timestamptz,
  add column if not exists dedupe_key text,
  add column if not exists expo_tickets jsonb,
  add column if not exists receipts_checked_at timestamptz;

create unique index if not exists notification_outbox_dedupe_idx
on public.notification_outbox(user_id, dedupe_key)
where dedupe_key is not null;

create index if not exists notification_outbox_receipts_idx
on public.notification_outbox(status, sent_at)
where status = 'sent' and expo_tickets is not null and receipts_checked_at is null;

create or replace function public.notification_category_enabled(
  p_user uuid,
  p_category text
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((
    select case p_category
      when 'morning_reminder' then preference.morning_reminder
      when 'two_hour_warning' then preference.two_hour_warning
      when 'thirty_minute_warning' then preference.thirty_minute_warning
      when 'proof_window_opened' then preference.proof_window_opened
      when 'proof_results' then preference.proof_results
      when 'commitment_missed' then preference.commitment_missed
      when 'redemption_warning' then preference.redemption_warning
      when 'social_activity' then preference.social_activity
      when 'review_required' then preference.review_required
      else false
    end
    from public.notification_preferences preference
    where preference.user_id = p_user
  ), false)
$$;

create or replace function public.notification_quiet_until(
  p_user uuid,
  p_desired timestamptz
)
returns timestamptz
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_start time;
  v_end time;
  v_timezone text;
  v_local timestamp;
  v_local_time time;
  v_quiet_end timestamp;
begin
  select
    coalesce(preference.quiet_hours_start, settings.quiet_hours_start),
    coalesce(preference.quiet_hours_end, settings.quiet_hours_end),
    coalesce(nullif(preference.timezone, ''), profile.timezone, 'UTC')
  into v_start, v_end, v_timezone
  from public.profiles profile
  left join public.notification_preferences preference
    on preference.user_id = profile.id
  left join public.user_settings settings
    on settings.user_id = profile.id
  where profile.id = p_user;

  if v_start is null or v_end is null or v_start = v_end then
    return p_desired;
  end if;

  v_local := p_desired at time zone v_timezone;
  v_local_time := v_local::time;

  if v_start < v_end then
    if v_local_time >= v_start and v_local_time < v_end then
      v_quiet_end := v_local::date + v_end;
      return v_quiet_end at time zone v_timezone;
    end if;
  else
    if v_local_time >= v_start then
      v_quiet_end := (v_local::date + 1) + v_end;
      return v_quiet_end at time zone v_timezone;
    elsif v_local_time < v_end then
      v_quiet_end := v_local::date + v_end;
      return v_quiet_end at time zone v_timezone;
    end if;
  end if;

  return p_desired;
end;
$$;

create or replace function public.queue_user_notification(
  p_user uuid,
  p_category text,
  p_title text,
  p_body text,
  p_data jsonb default '{}'::jsonb,
  p_dedupe_key text default null,
  p_deliver_after timestamptz default now()
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_deliver_after timestamptz;
begin
  if not public.notification_category_enabled(p_user, p_category) then
    return null;
  end if;

  v_deliver_after := public.notification_quiet_until(
    p_user,
    greatest(coalesce(p_deliver_after, now()), now())
  );

  insert into public.notification_outbox(
    user_id,
    category,
    title,
    body,
    data,
    dedupe_key,
    deliver_after
  )
  values(
    p_user,
    p_category,
    p_title,
    p_body,
    coalesce(p_data, '{}'::jsonb),
    nullif(trim(coalesce(p_dedupe_key, '')), ''),
    v_deliver_after
  )
  on conflict(user_id, dedupe_key)
    where dedupe_key is not null
  do nothing
  returning id into v_id;

  return v_id;
end;
$$;

create or replace function public.claim_notification_jobs(p_limit integer default 100)
returns setof public.notification_outbox
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.notification_outbox
  set status = 'pending',
      claimed_at = null,
      last_error = coalesce(last_error, 'Delivery claim expired'),
      updated_at = now()
  where status = 'processing'
    and claimed_at < now() - interval '10 minutes';

  return query
  with candidates as (
    select id
    from public.notification_outbox
    where status = 'pending'
      and deliver_after <= now()
      and attempts < 5
    order by deliver_after, created_at
    for update skip locked
    limit least(greatest(coalesce(p_limit, 100), 1), 500)
  )
  update public.notification_outbox job
  set status = 'processing',
      claimed_at = now(),
      attempts = job.attempts + 1,
      updated_at = now()
  from candidates
  where job.id = candidates.id
  returning job.*;
end;
$$;

create or replace function public.process_commitment_deadlines()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_commitment public.commitments%rowtype;
  v_missed_record public.missed_commitments%rowtype;
  v_opened integer := 0;
  v_missed integer := 0;
  v_expired integer := 0;
  v_granted integer := 0;
  v_generated integer := 0;
begin
  perform pg_advisory_xact_lock(hashtext('calledout_deadline_job'));

  v_generated := public.maintain_commitment_horizon(45);
  v_granted := public.grant_monthly_grace_passes();

  for v_commitment in
    update public.commitments
    set status = 'proof_window_open',
        updated_at = now()
    where status = 'upcoming'
      and proof_window_starts_at <= now()
      and deadline_at > now()
      and deleted_at is null
    returning *
  loop
    v_opened := v_opened + 1;
    perform public.queue_user_notification(
      v_commitment.user_id,
      'proof_window_opened',
      'Proof window open',
      'Your proof window is open. Proof is due by ' ||
        to_char(v_commitment.deadline_at at time zone v_commitment.timezone, 'HH12:MI AM') || '.',
      jsonb_build_object('commitment_id', v_commitment.id),
      'proof-window:' || v_commitment.id::text,
      now()
    );
  end loop;

  for v_commitment in
    update public.commitments
    set status = 'missed',
        missed_at = coalesce(missed_at, now()),
        updated_at = now()
    where status in ('upcoming', 'proof_window_open')
      and deadline_at + make_interval(mins => grace_period_minutes) < now()
      and deleted_at is null
    returning *
  loop
    insert into public.missed_commitments(
      commitment_id,
      user_id,
      circle_id,
      missed_at
    )
    values(
      v_commitment.id,
      v_commitment.user_id,
      v_commitment.circle_id,
      coalesce(v_commitment.missed_at, now())
    )
    on conflict(commitment_id) do update
      set missed_at = excluded.missed_at
    returning * into v_missed_record;

    v_missed := v_missed + 1;

    perform public.queue_user_notification(
      v_commitment.user_id,
      'commitment_missed',
      'You missed it.',
      'The Wall and your record have been updated.',
      jsonb_build_object('commitment_id', v_commitment.id),
      'commitment-missed:' || v_commitment.id::text,
      now()
    );

    insert into public.redemptions(
      missed_commitment_id,
      user_id,
      status,
      rules,
      opens_at,
      deadline_at
    )
    values(
      v_missed_record.id,
      v_commitment.user_id,
      'available',
      v_commitment.redemption_rules,
      now(),
      now() + make_interval(
        hours => coalesce((v_commitment.redemption_rules ->> 'window_hours')::integer, 24)
      )
    )
    on conflict(missed_commitment_id) do nothing;

    insert into public.activity_events(
      actor_id,
      circle_id,
      commitment_id,
      event_type,
      payload
    )
    values(
      v_commitment.user_id,
      v_commitment.circle_id,
      v_commitment.id,
      'commitment_missed',
      jsonb_build_object('title', v_commitment.title)
    )
    on conflict(commitment_id, event_type) do nothing;
  end loop;

  update public.redemptions
  set status = 'expired',
      updated_at = now()
  where status in ('available', 'in_progress')
    and deadline_at < now()
    and deleted_at is null;
  get diagnostics v_expired = row_count;

  return jsonb_build_object(
    'generated', v_generated,
    'opened', v_opened,
    'missed', v_missed,
    'redemptions_expired', v_expired,
    'grace_passes_granted', v_granted,
    'processed_at', now()
  );
end;
$$;

revoke all on function public.notification_category_enabled(uuid, text) from public;
revoke all on function public.notification_quiet_until(uuid, timestamptz) from public;
revoke all on function public.queue_user_notification(uuid, text, text, text, jsonb, text, timestamptz) from public;
revoke all on function public.claim_notification_jobs(integer) from public;

grant execute on function public.claim_notification_jobs(integer) to service_role;
grant execute on function public.process_commitment_deadlines() to service_role;

commit;
