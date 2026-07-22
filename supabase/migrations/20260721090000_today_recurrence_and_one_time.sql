begin;

create or replace function public.create_recurring_commitment_v3(
  p_title text,
  p_workout_type public.workout_type,
  p_days_of_week integer[],
  p_deadline_hour integer,
  p_minimum_duration integer,
  p_proof_method public.proof_method,
  p_proof_window_minutes integer default 240,
  p_requires_location boolean default false,
  p_circle_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'authentication required';
  end if;

  if char_length(trim(coalesce(p_title, ''))) not between 1 and 80 then
    raise exception 'title must be between 1 and 80 characters';
  end if;

  if coalesce(array_length(p_days_of_week, 1), 0) = 0 then
    raise exception 'choose at least one weekday';
  end if;

  if exists (
    select 1
    from unnest(p_days_of_week) as selected_day
    where selected_day not between 0 and 6
  ) then
    raise exception 'invalid weekday selection';
  end if;

  return public.create_schedule_with_commitments_v2(
    trim(p_title),
    p_workout_type,
    array(select distinct day from unnest(p_days_of_week) as day order by day),
    p_deadline_hour,
    p_minimum_duration,
    p_proof_method,
    p_proof_window_minutes,
    p_requires_location,
    p_circle_id
  );
end;
$$;

revoke all on function public.create_recurring_commitment_v3(
  text,
  public.workout_type,
  integer[],
  integer,
  integer,
  public.proof_method,
  integer,
  boolean,
  uuid
) from public;

grant execute on function public.create_recurring_commitment_v3(
  text,
  public.workout_type,
  integer[],
  integer,
  integer,
  public.proof_method,
  integer,
  boolean,
  uuid
) to authenticated;

create or replace function public.create_one_time_commitment_v1(
  p_title text,
  p_workout_type public.workout_type,
  p_commitment_date date,
  p_deadline_hour integer,
  p_minimum_duration integer,
  p_proof_method public.proof_method,
  p_proof_window_minutes integer default 240,
  p_requires_location boolean default false,
  p_circle_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_commitment_id uuid := gen_random_uuid();
  v_timezone text;
  v_today date;
  v_deadline timestamptz;
  v_status public.commitment_status;
begin
  if auth.uid() is null then
    raise exception 'authentication required';
  end if;

  if char_length(trim(coalesce(p_title, ''))) not between 1 and 80 then
    raise exception 'title must be between 1 and 80 characters';
  end if;

  if p_deadline_hour not between 0 and 23 then
    raise exception 'invalid deadline hour';
  end if;

  if p_minimum_duration not between 1 and 1440 then
    raise exception 'invalid duration';
  end if;

  if p_proof_window_minutes not between 60 and 480 then
    raise exception 'proof window must be between 1 and 8 hours';
  end if;

  if not public.has_active_pro() and p_proof_window_minutes <> 240 then
    raise exception 'CalledOut Pro is required for a custom proof window';
  end if;

  if p_circle_id is not null and not public.is_circle_member(p_circle_id) then
    raise exception 'not a circle member';
  end if;

  select coalesce(timezone, 'UTC')
  into v_timezone
  from public.profiles
  where id = auth.uid();

  if v_timezone is null then
    v_timezone := 'UTC';
  end if;

  v_today := (now() at time zone v_timezone)::date;

  if p_commitment_date < v_today or p_commitment_date > v_today + 30 then
    raise exception 'one-time promise must be within the next 30 days';
  end if;

  v_deadline := (
    (
      p_commitment_date::text || ' ' ||
      lpad(p_deadline_hour::text, 2, '0') || ':00:00'
    )::timestamp at time zone v_timezone
  );

  if v_deadline <= now() then
    raise exception 'deadline must be in the future';
  end if;

  v_status := case
    when now() >= v_deadline - make_interval(mins => p_proof_window_minutes)
      then 'proof_window_open'::public.commitment_status
    else 'upcoming'::public.commitment_status
  end;

  insert into public.commitments(
    id,
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
    status
  )
  values(
    v_commitment_id,
    auth.uid(),
    p_circle_id,
    null,
    trim(p_title),
    p_workout_type,
    p_commitment_date,
    v_deadline - make_interval(mins => p_proof_window_minutes),
    v_deadline,
    v_timezone,
    p_minimum_duration,
    p_proof_method,
    p_requires_location,
    v_status
  );

  return v_commitment_id;
end;
$$;

revoke all on function public.create_one_time_commitment_v1(
  text,
  public.workout_type,
  date,
  integer,
  integer,
  public.proof_method,
  integer,
  boolean,
  uuid
) from public;

grant execute on function public.create_one_time_commitment_v1(
  text,
  public.workout_type,
  date,
  integer,
  integer,
  public.proof_method,
  integer,
  boolean,
  uuid
) to authenticated;

commit;
