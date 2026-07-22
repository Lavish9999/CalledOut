begin;

-- Release hardening: moderated accounts cannot keep writing through an
-- already-issued Supabase session. Service-role jobs intentionally have no
-- auth.uid() and are allowed to continue maintenance/deletion work.
create or replace function public.is_active_account(
  p_user uuid default auth.uid()
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((
    select account_status = 'active' and deleted_at is null
    from public.profiles
    where id = p_user
  ), false)
$$;

create or replace function public.require_active_account()
returns void
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'authentication required';
  end if;

  if not public.is_active_account(auth.uid()) then
    raise exception 'This CalledOut account is restricted';
  end if;
end;
$$;

create or replace function public.enforce_active_actor()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is not null and not public.is_active_account(auth.uid()) then
    raise exception 'This CalledOut account is restricted';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;

  return new;
end;
$$;

do $$
declare
  v_table text;
begin
  foreach v_table in array array[
    'profiles',
    'user_settings',
    'devices',
    'circles',
    'circle_members',
    'circle_invites',
    'commitment_schedules',
    'commitments',
    'proof_submissions',
    'verification_votes',
    'reactions',
    'comments',
    'blocks',
    'reports',
    'notification_preferences',
    'push_tokens',
    'health_connections'
  ]
  loop
    execute format(
      'drop trigger if exists enforce_active_actor on public.%I',
      v_table
    );
    execute format(
      'create trigger enforce_active_actor before insert or update or delete on public.%I for each row execute function public.enforce_active_actor()',
      v_table
    );
  end loop;
end;
$$;

-- Preserve moderation/audit history without allowing those rows to block a
-- user's account deletion.
alter table public.moderation_actions
  drop constraint if exists moderation_actions_admin_id_fkey;
alter table public.moderation_actions
  drop constraint if exists moderation_actions_target_user_id_fkey;
alter table public.moderation_actions
  alter column admin_id drop not null;
alter table public.moderation_actions
  add constraint moderation_actions_admin_id_fkey
  foreign key (admin_id) references public.profiles(id) on delete set null;
alter table public.moderation_actions
  add constraint moderation_actions_target_user_id_fkey
  foreign key (target_user_id) references public.profiles(id) on delete set null;

alter table public.account_deletion_requests
  add column if not exists attempts integer not null default 0,
  add column if not exists last_attempt_at timestamptz,
  add column if not exists last_error text;

-- Prepare all relational data before auth.users is hard-deleted. Circles with
-- another active member transfer ownership; single-member circles are deleted.
create or replace function public.prepare_account_deletion(p_user uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_circle record;
  v_new_owner uuid;
  v_transferred integer := 0;
  v_deleted integer := 0;
begin
  if p_user is null then
    raise exception 'user is required';
  end if;

  if auth.uid() is not null and auth.uid() <> p_user then
    raise exception 'not authorized';
  end if;

  perform 1
  from public.profiles
  where id = p_user
  for update;

  if not found then
    return jsonb_build_object(
      'prepared', true,
      'user_missing', true,
      'circles_transferred', 0,
      'circles_deleted', 0
    );
  end if;

  -- A previously soft-deleted circle still retains an owner foreign key.
  delete from public.circles
  where owner_id = p_user
    and deleted_at is not null;

  for v_circle in
    select id
    from public.circles
    where owner_id = p_user
      and deleted_at is null
    for update
  loop
    v_new_owner := null;

    select member.user_id
    into v_new_owner
    from public.circle_members member
    join public.profiles profile on profile.id = member.user_id
    where member.circle_id = v_circle.id
      and member.user_id <> p_user
      and member.status = 'active'
      and member.deleted_at is null
      and profile.account_status = 'active'
      and profile.deleted_at is null
    order by
      case member.role when 'moderator' then 0 else 1 end,
      member.joined_at,
      member.user_id
    limit 1
    for update of member;

    if v_new_owner is null then
      delete from public.circles where id = v_circle.id;
      v_deleted := v_deleted + 1;
    else
      update public.circle_members
      set role = case when user_id = v_new_owner then 'owner' else role end,
          updated_at = now()
      where circle_id = v_circle.id
        and user_id = v_new_owner;

      update public.circles
      set owner_id = v_new_owner,
          updated_at = now()
      where id = v_circle.id;

      update public.circle_invites
      set created_by = v_new_owner,
          updated_at = now()
      where circle_id = v_circle.id
        and created_by = p_user;

      v_transferred := v_transferred + 1;
    end if;
  end loop;

  -- Reassign invites the user created as a moderator in circles they did not
  -- own. The current owner becomes the durable creator reference.
  update public.circle_invites invite
  set created_by = circle.owner_id,
      updated_at = now()
  from public.circles circle
  where invite.circle_id = circle.id
    and invite.created_by = p_user;

  delete from public.push_tokens where user_id = p_user;
  delete from public.devices where user_id = p_user;

  update public.profiles
  set account_status = 'deletion_pending',
      public_profile_opt_in = false,
      public_wall_opt_in = false,
      updated_at = now()
  where id = p_user;

  return jsonb_build_object(
    'prepared', true,
    'user_missing', false,
    'circles_transferred', v_transferred,
    'circles_deleted', v_deleted
  );
end;
$$;

-- Weekly schedules are rolling promises, not a one-time 30-day batch.
create or replace function public.maintain_commitment_horizon(
  p_days_ahead integer default 45
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_schedule record;
  v_day date;
  v_local_today date;
  v_deadline timestamptz;
  v_inserted integer := 0;
  v_rows integer := 0;
  v_days integer := least(greatest(coalesce(p_days_ahead, 45), 30), 90);
begin
  for v_schedule in
    select schedule.*
    from public.commitment_schedules schedule
    join public.profiles profile on profile.id = schedule.user_id
    where schedule.is_active
      and schedule.deleted_at is null
      and profile.account_status = 'active'
      and profile.deleted_at is null
  loop
    v_local_today := (now() at time zone v_schedule.timezone)::date;

    for v_day in
      select generate_series(
        greatest(v_local_today, v_schedule.active_from),
        least(
          v_local_today + v_days,
          coalesce(v_schedule.active_until, v_local_today + v_days)
        ),
        interval '1 day'
      )::date
    loop
      if extract(dow from v_day)::integer = any(v_schedule.days_of_week::integer[]) then
        v_deadline := (
          (v_day + v_schedule.deadline_local) at time zone v_schedule.timezone
        );

        if v_deadline > now() then
          insert into public.commitments(
            user_id,
            circle_id,
            schedule_id,
            title,
            workout_type,
            commitment_date,
            proof_window_starts_at,
            deadline_at,
            timezone,
            minimum_duration_minutes,
            proof_method,
            requires_location,
            location_geofence,
            visibility,
            grace_period_minutes,
            status
          )
          values(
            v_schedule.user_id,
            v_schedule.circle_id,
            v_schedule.id,
            v_schedule.title,
            v_schedule.workout_type,
            v_day,
            v_deadline - make_interval(mins => v_schedule.proof_window_minutes),
            v_deadline,
            v_schedule.timezone,
            v_schedule.minimum_duration_minutes,
            v_schedule.proof_method,
            v_schedule.requires_location,
            v_schedule.location_geofence,
            case when v_schedule.circle_id is null
              then 'only_me'::public.visibility_scope
              else 'circle'::public.visibility_scope
            end,
            v_schedule.grace_period_minutes,
            case
              when now() >= v_deadline - make_interval(mins => v_schedule.proof_window_minutes)
                then 'proof_window_open'::public.commitment_status
              else 'upcoming'::public.commitment_status
            end
          )
          on conflict(schedule_id, commitment_date) do nothing;

          get diagnostics v_rows = row_count;
          v_inserted := v_inserted + v_rows;
        end if;
      end if;
    end loop;
  end loop;

  return v_inserted;
end;
$$;

create or replace function public.process_commitment_deadlines()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_opened integer := 0;
  v_missed integer := 0;
  v_expired integer := 0;
  v_granted integer := 0;
  v_generated integer := 0;
begin
  perform pg_advisory_xact_lock(hashtext('calledout_deadline_job'));

  v_generated := public.maintain_commitment_horizon(45);
  v_granted := public.grant_monthly_grace_passes();

  with opened as (
    update public.commitments
    set status = 'proof_window_open',
        updated_at = now()
    where status = 'upcoming'
      and proof_window_starts_at <= now()
      and deadline_at > now()
      and deleted_at is null
    returning *
  )
  insert into public.notification_outbox(user_id, category, title, body, data)
  select
    user_id,
    'proof_window_opened',
    'Proof window open',
    'Your proof window is open. Proof is due by ' ||
      to_char(deadline_at at time zone timezone, 'HH12:MI AM') || '.',
    jsonb_build_object('commitment_id', id)
  from opened;
  get diagnostics v_opened = row_count;

  with changed as (
    update public.commitments
    set status = 'missed',
        missed_at = coalesce(missed_at, now()),
        updated_at = now()
    where status in ('upcoming', 'proof_window_open')
      and deadline_at + make_interval(mins => grace_period_minutes) < now()
      and deleted_at is null
    returning *
  ), inserted as (
    insert into public.missed_commitments(
      commitment_id,
      user_id,
      circle_id,
      missed_at
    )
    select id, user_id, circle_id, coalesce(missed_at, now())
    from changed
    on conflict(commitment_id) do nothing
    returning *
  )
  insert into public.notification_outbox(user_id, category, title, body, data)
  select
    user_id,
    'commitment_missed',
    'You missed it.',
    'The Wall and your record have been updated.',
    jsonb_build_object('commitment_id', commitment_id)
  from inserted;
  get diagnostics v_missed = row_count;

  insert into public.redemptions(
    missed_commitment_id,
    user_id,
    status,
    rules,
    opens_at,
    deadline_at
  )
  select
    missed.id,
    missed.user_id,
    'available',
    commitment.redemption_rules,
    now(),
    now() + make_interval(
      hours => coalesce((commitment.redemption_rules ->> 'window_hours')::integer, 24)
    )
  from public.missed_commitments missed
  join public.commitments commitment on commitment.id = missed.commitment_id
  left join public.redemptions redemption
    on redemption.missed_commitment_id = missed.id
  where redemption.id is null
    and missed.deleted_at is null
    and missed.missed_at > now() - interval '5 minutes';

  insert into public.activity_events(
    actor_id,
    circle_id,
    commitment_id,
    event_type,
    payload
  )
  select
    commitment.user_id,
    commitment.circle_id,
    commitment.id,
    'commitment_missed',
    jsonb_build_object('title', commitment.title)
  from public.commitments commitment
  left join public.activity_events activity
    on activity.commitment_id = commitment.id
    and activity.event_type = 'commitment_missed'
  where commitment.status = 'missed'
    and commitment.missed_at > now() - interval '5 minutes'
    and activity.id is null;

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

-- Storage writes are also denied for restricted accounts.
drop policy if exists proof_upload_own_path on storage.objects;
create policy proof_upload_own_path
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'proof-media'
  and public.is_active_account(auth.uid())
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists profile_media_own on storage.objects;
create policy profile_media_own
on storage.objects
for all
to authenticated
using (
  bucket_id = 'profile-media'
  and public.is_active_account(auth.uid())
  and (storage.foldername(name))[1] = auth.uid()::text
)
with check (
  bucket_id = 'profile-media'
  and public.is_active_account(auth.uid())
  and (storage.foldername(name))[1] = auth.uid()::text
);

revoke all on function public.prepare_account_deletion(uuid) from public;
revoke all on function public.maintain_commitment_horizon(integer) from public;
revoke all on function public.require_active_account() from public;
revoke all on function public.enforce_active_actor() from public;

grant execute on function public.prepare_account_deletion(uuid) to service_role;
grant execute on function public.maintain_commitment_horizon(integer) to service_role;
grant execute on function public.process_commitment_deadlines() to service_role;
grant execute on function public.is_active_account(uuid) to authenticated;

commit;
