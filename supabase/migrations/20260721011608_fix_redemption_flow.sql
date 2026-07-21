begin;

create or replace function public.start_redemption(
  p_commitment_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_missed public.missed_commitments%rowtype;
  v_source public.commitments%rowtype;
  v_redemption public.redemptions%rowtype;
  v_redemption_commitment_id uuid;
  v_window_hours integer;
  v_minutes integer;
begin
  select *
  into v_missed
  from public.missed_commitments
  where commitment_id = p_commitment_id
    and user_id = auth.uid()
    and deleted_at is null;

  if not found then
    raise exception 'Missed commitment not found';
  end if;

  select *
  into v_source
  from public.commitments
  where id = p_commitment_id
    and user_id = auth.uid()
    and deleted_at is null;

  if not found then
    raise exception 'Original commitment not found';
  end if;

  select *
  into v_redemption
  from public.redemptions
  where missed_commitment_id = v_missed.id
    and deleted_at is null
  for update;

  if found then
    if v_redemption.status = 'expired' then
      raise exception 'The redemption window has expired';
    end if;

    if v_redemption.redemption_commitment_id is not null then
      update public.redemptions
      set
        status = 'in_progress',
        updated_at = now()
      where id = v_redemption.id;

      update public.commitments
      set
        status = 'redemption_available',
        updated_at = now()
      where id = p_commitment_id;

      return v_redemption.redemption_commitment_id;
    end if;
  else
    v_window_hours := coalesce(
      (v_source.redemption_rules ->> 'window_hours')::integer,
      24
    );

    insert into public.redemptions (
      missed_commitment_id,
      user_id,
      status,
      rules,
      opens_at,
      deadline_at
    )
    values (
      v_missed.id,
      auth.uid(),
      'in_progress',
      v_source.redemption_rules,
      now(),
      now() + make_interval(hours => v_window_hours)
    )
    returning *
    into v_redemption;
  end if;

  v_minutes := coalesce(
    (v_redemption.rules ->> 'minutes')::integer,
    30
  );

  v_redemption_commitment_id := gen_random_uuid();

  insert into public.commitments (
    id,
    user_id,
    circle_id,
    title,
    workout_type,
    commitment_date,
    proof_window_starts_at,
    deadline_at,
    timezone,
    minimum_duration_minutes,
    proof_method,
    requires_location,
    visibility,
    status,
    redemption_rules
  )
  values (
    v_redemption_commitment_id,
    v_source.user_id,
    v_source.circle_id,
    'Redemption workout',
    v_source.workout_type,
    (now() at time zone v_source.timezone)::date,
    now(),
    v_redemption.deadline_at,
    v_source.timezone,
    v_minutes,
    'live_photo',
    false,
    v_source.visibility,
    'proof_window_open',
    '{}'::jsonb
  );

  update public.redemptions
  set
    status = 'in_progress',
    redemption_commitment_id =
      v_redemption_commitment_id,
    updated_at = now()
  where id = v_redemption.id;

  update public.commitments
  set
    status = 'redemption_available',
    updated_at = now()
  where id = p_commitment_id;

  return v_redemption_commitment_id;
end;
$$;

create or replace function
public.complete_redemption_after_verification()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_redemption public.redemptions%rowtype;
  v_missed public.missed_commitments%rowtype;
begin
  if new.status <> 'verified'
     or old.status = 'verified'
  then
    return new;
  end if;

  select *
  into v_redemption
  from public.redemptions
  where redemption_commitment_id = new.id
    and status = 'in_progress'
    and deleted_at is null
  for update;

  if not found then
    return new;
  end if;

  select *
  into v_missed
  from public.missed_commitments
  where id = v_redemption.missed_commitment_id
    and deleted_at is null;

  update public.redemptions
  set
    status = 'completed',
    completed_at = now(),
    updated_at = now()
  where id = v_redemption.id;

  update public.missed_commitments
  set
    redeemed_at = now(),
    updated_at = now()
  where id = v_missed.id;

  update public.commitments
  set
    status = 'redeemed',
    updated_at = now()
  where id = v_missed.commitment_id
    and status in (
      'missed',
      'redemption_available'
    );

  insert into public.activity_events (
    actor_id,
    circle_id,
    commitment_id,
    event_type,
    payload
  )
  values (
    new.user_id,
    v_missed.circle_id,
    v_missed.commitment_id,
    'redemption_completed',
    jsonb_build_object(
      'redemption_commitment_id',
      new.id,
      'missed_commitment_id',
      v_missed.id
    )
  );

  return new;
end;
$$;

drop trigger if exists
complete_redemption_after_verification
on public.commitments;

create trigger complete_redemption_after_verification
after update of status
on public.commitments
for each row
execute function
public.complete_redemption_after_verification();

grant execute on function
public.start_redemption(uuid)
to authenticated;

commit;