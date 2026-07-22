begin;

create or replace function public.upsert_scheduled_notification(
  p_user uuid,
  p_category text,
  p_title text,
  p_body text,
  p_data jsonb,
  p_dedupe_key text,
  p_deliver_after timestamptz
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
  if p_deliver_after is null then
    return null;
  end if;

  if not public.notification_category_enabled(p_user, p_category) then
    update public.notification_outbox
    set status = 'cancelled',
        claimed_at = null,
        last_error = 'Notification category disabled',
        updated_at = now()
    where user_id = p_user
      and dedupe_key = p_dedupe_key
      and status in ('pending', 'processing');
    return null;
  end if;

  v_deliver_after := public.notification_quiet_until(
    p_user,
    greatest(p_deliver_after, now())
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
    p_dedupe_key,
    v_deliver_after
  )
  on conflict(user_id, dedupe_key)
    where dedupe_key is not null
  do update set
    category = excluded.category,
    title = excluded.title,
    body = excluded.body,
    data = excluded.data,
    deliver_after = case
      when public.notification_outbox.status in ('sent', 'cancelled')
        then public.notification_outbox.deliver_after
      else excluded.deliver_after
    end,
    status = case
      when public.notification_outbox.status in ('sent', 'cancelled')
        then public.notification_outbox.status
      else 'pending'
    end,
    claimed_at = case
      when public.notification_outbox.status in ('sent', 'cancelled')
        then public.notification_outbox.claimed_at
      else null
    end,
    updated_at = now()
  returning id into v_id;

  return v_id;
end;
$$;

create or replace function public.schedule_commitment_notifications()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_morning timestamptz;
  v_active boolean;
  v_route text;
begin
  v_active :=
    new.deleted_at is null
    and new.status in ('upcoming', 'proof_window_open')
    and new.deadline_at > now();

  if not v_active then
    update public.notification_outbox
    set status = 'cancelled',
        claimed_at = null,
        last_error = 'Commitment no longer eligible',
        updated_at = now()
    where user_id = new.user_id
      and dedupe_key in (
        'morning:' || new.id::text,
        'two-hour:' || new.id::text,
        'thirty-minute:' || new.id::text,
        'proof-window:' || new.id::text
      )
      and status in ('pending', 'processing');
    return new;
  end if;

  v_route := '/commitment/' || new.id::text;
  v_morning := (
    (new.commitment_date::text || ' 08:00:00')::timestamp
      at time zone new.timezone
  );

  if v_morning < new.deadline_at then
    perform public.upsert_scheduled_notification(
      new.user_id,
      'morning_reminder',
      'You made a promise today',
      new.title || ' is due by ' ||
        to_char(new.deadline_at at time zone new.timezone, 'HH12:MI AM') || '.',
      jsonb_build_object(
        'route', v_route,
        'commitment_id', new.id
      ),
      'morning:' || new.id::text,
      v_morning
    );
  end if;

  perform public.upsert_scheduled_notification(
    new.user_id,
    'two_hour_warning',
    'Two hours left',
    new.title || ' is still waiting for fresh proof.',
    jsonb_build_object(
      'route', v_route,
      'commitment_id', new.id
    ),
    'two-hour:' || new.id::text,
    new.deadline_at - interval '2 hours'
  );

  perform public.upsert_scheduled_notification(
    new.user_id,
    'thirty_minute_warning',
    'Thirty minutes left',
    'Fresh proof for ' || new.title || ' is due soon.',
    jsonb_build_object(
      'route', v_route,
      'commitment_id', new.id
    ),
    'thirty-minute:' || new.id::text,
    new.deadline_at - interval '30 minutes'
  );

  perform public.upsert_scheduled_notification(
    new.user_id,
    'proof_window_opened',
    'Proof window open',
    new.title || ' can now accept fresh proof.',
    jsonb_build_object(
      'route', v_route,
      'commitment_id', new.id
    ),
    'proof-window:' || new.id::text,
    new.proof_window_starts_at
  );

  return new;
end;
$$;

drop trigger if exists schedule_commitment_notifications on public.commitments;
create trigger schedule_commitment_notifications
after insert or update of deadline_at, proof_window_starts_at, status, deleted_at
on public.commitments
for each row
execute function public.schedule_commitment_notifications();

create or replace function public.schedule_redemption_notifications()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_active boolean;
  v_source_commitment uuid;
  v_route text;
begin
  v_active :=
    new.deleted_at is null
    and new.status in ('available', 'in_progress')
    and new.deadline_at > now();

  if not v_active then
    update public.notification_outbox
    set status = 'cancelled',
        claimed_at = null,
        last_error = 'Redemption no longer eligible',
        updated_at = now()
    where user_id = new.user_id
      and dedupe_key = 'redemption-warning:' || new.id::text
      and status in ('pending', 'processing');
    return new;
  end if;

  select missed.commitment_id
  into v_source_commitment
  from public.missed_commitments missed
  where missed.id = new.missed_commitment_id;

  v_route := '/redemption/' || coalesce(
    new.redemption_commitment_id::text,
    v_source_commitment::text
  );

  perform public.upsert_scheduled_notification(
    new.user_id,
    'redemption_warning',
    'Redemption window closing',
    'Complete fresh proof before this callout expires.',
    jsonb_build_object(
      'route', v_route,
      'redemption_id', new.id,
      'commitment_id', v_source_commitment
    ),
    'redemption-warning:' || new.id::text,
    new.deadline_at - interval '2 hours'
  );

  return new;
end;
$$;

drop trigger if exists schedule_redemption_notifications on public.redemptions;
create trigger schedule_redemption_notifications
after insert or update of deadline_at, status, redemption_commitment_id, deleted_at
on public.redemptions
for each row
execute function public.schedule_redemption_notifications();

-- Backfill active records so the production queue is complete immediately.
update public.commitments
set updated_at = now()
where deleted_at is null
  and status in ('upcoming', 'proof_window_open')
  and deadline_at > now();

update public.redemptions
set updated_at = now()
where deleted_at is null
  and status in ('available', 'in_progress')
  and deadline_at > now();

revoke all on function public.upsert_scheduled_notification(uuid, text, text, text, jsonb, text, timestamptz)
from public, anon, authenticated;
revoke all on function public.schedule_commitment_notifications()
from public, anon, authenticated;
revoke all on function public.schedule_redemption_notifications()
from public, anon, authenticated;

grant execute on function public.upsert_scheduled_notification(uuid, text, text, text, jsonb, text, timestamptz)
to service_role;

commit;
