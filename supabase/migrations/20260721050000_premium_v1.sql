begin;

create or replace function public.get_plan_overview()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_is_pro boolean;
  v_circle_count integer;
  v_schedule_count integer;
  v_grace_remaining integer;
  v_subscription public.subscriptions%rowtype;
begin
  if v_user is null then
    raise exception 'authentication required';
  end if;

  v_is_pro := public.has_active_pro(v_user);

  select count(*)::integer
  into v_circle_count
  from public.circle_members
  where user_id = v_user
    and status = 'active'
    and deleted_at is null;

  select count(*)::integer
  into v_schedule_count
  from public.commitment_schedules
  where user_id = v_user
    and is_active
    and deleted_at is null;

  select count(*)::integer
  into v_grace_remaining
  from public.grace_passes
  where user_id = v_user
    and used_at is null
    and expires_at > now();

  select *
  into v_subscription
  from public.subscriptions
  where user_id = v_user
    and deleted_at is null
  order by current_period_ends_at desc nulls last, created_at desc
  limit 1;

  return jsonb_build_object(
    'is_pro', v_is_pro,
    'active_circle_count', v_circle_count,
    'active_schedule_count', v_schedule_count,
    'grace_passes_remaining', v_grace_remaining,
    'circle_limit', case when v_is_pro then 5 else 1 end,
    'schedule_limit', case when v_is_pro then 5 else 1 end,
    'member_limit', case when v_is_pro then 20 else 8 end,
    'subscription_status', case when v_subscription.id is null then null else v_subscription.status::text end,
    'current_period_ends_at', v_subscription.current_period_ends_at,
    'will_renew', v_subscription.will_renew
  );
end;
$$;

grant execute on function public.get_plan_overview() to authenticated;

create or replace function public.create_circle(
  p_name text,
  p_description text default null
)
returns uuid
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_id uuid := gen_random_uuid();
  v_code text;
  v_count integer;
  v_is_pro boolean;
  v_limit integer;
  v_member_limit integer;
begin
  if auth.uid() is null then
    raise exception 'authentication required';
  end if;

  v_is_pro := public.has_active_pro();
  v_limit := case when v_is_pro then 5 else 1 end;
  v_member_limit := case when v_is_pro then 20 else 8 end;

  select count(*)::integer
  into v_count
  from public.circle_members
  where user_id = auth.uid()
    and status = 'active'
    and deleted_at is null;

  if v_count >= v_limit then
    if v_is_pro then
      raise exception 'CalledOut Pro supports up to 5 active circles';
    end if;
    raise exception 'CalledOut Pro is required to create another circle';
  end if;

  insert into public.circles(
    id,
    name,
    description,
    owner_id,
    member_limit
  )
  values(
    v_id,
    trim(p_name),
    nullif(trim(p_description), ''),
    auth.uid(),
    v_member_limit
  );

  insert into public.circle_members(circle_id, user_id, role, status)
  values(v_id, auth.uid(), 'owner', 'active');

  v_code := upper(substr(encode(gen_random_bytes(8), 'hex'), 1, 8));

  insert into public.circle_invites(circle_id, code, created_by, expires_at)
  values(v_id, v_code, auth.uid(), now() + interval '30 days');

  insert into public.activity_events(actor_id, circle_id, event_type, payload)
  values(auth.uid(), v_id, 'member_joined', jsonb_build_object('role', 'owner'));

  return v_id;
end;
$$;

create or replace function public.join_circle_by_code(p_code text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inv public.circle_invites%rowtype;
  v_count integer;
  v_memberships integer;
  v_is_pro boolean;
  v_limit integer;
begin
  if auth.uid() is null then
    raise exception 'authentication required';
  end if;

  v_is_pro := public.has_active_pro();
  v_limit := case when v_is_pro then 5 else 1 end;

  select count(*)::integer
  into v_memberships
  from public.circle_members
  where user_id = auth.uid()
    and status = 'active'
    and deleted_at is null;

  if v_memberships >= v_limit then
    if v_is_pro then
      raise exception 'CalledOut Pro supports up to 5 active circles';
    end if;
    raise exception 'CalledOut Pro is required to join another circle';
  end if;

  select *
  into v_inv
  from public.circle_invites
  where code = upper(trim(p_code))
    and revoked_at is null
    and (expires_at is null or expires_at > now())
  for update;

  if not found then
    raise exception 'Invite code is invalid or expired';
  end if;

  select count(*)::integer
  into v_count
  from public.circle_members
  where circle_id = v_inv.circle_id
    and status = 'active';

  if v_count >= (
    select member_limit from public.circles where id = v_inv.circle_id
  ) then
    raise exception 'Circle is full';
  end if;

  if v_inv.max_uses is not null and v_inv.uses >= v_inv.max_uses then
    raise exception 'Invite has reached its use limit';
  end if;

  insert into public.circle_members(circle_id, user_id, role, status)
  values(v_inv.circle_id, auth.uid(), 'member', 'active')
  on conflict(circle_id, user_id)
  do update set status = 'active', deleted_at = null, joined_at = now();

  update public.circle_invites
  set uses = uses + 1
  where id = v_inv.id;

  insert into public.activity_events(actor_id, circle_id, event_type)
  values(auth.uid(), v_inv.circle_id, 'member_joined');

  return v_inv.circle_id;
end;
$$;

create or replace function public.create_schedule_with_commitments_v2(
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
declare
  v_schedule uuid := gen_random_uuid();
  v_tz text;
  v_day date;
  v_start_date date;
  v_deadline timestamptz;
  v_schedule_count integer;
  v_is_pro boolean;
  v_limit integer;
begin
  if auth.uid() is null then
    raise exception 'authentication required';
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
  if p_circle_id is not null and not public.is_circle_member(p_circle_id) then
    raise exception 'not a circle member';
  end if;

  v_is_pro := public.has_active_pro();
  v_limit := case when v_is_pro then 5 else 1 end;

  if not v_is_pro and p_proof_window_minutes <> 240 then
    raise exception 'CalledOut Pro is required for a custom proof window';
  end if;

  select count(*)::integer
  into v_schedule_count
  from public.commitment_schedules
  where user_id = auth.uid()
    and is_active
    and deleted_at is null;

  if v_schedule_count >= v_limit then
    if v_is_pro then
      raise exception 'CalledOut Pro supports up to 5 active recurring schedules';
    end if;
    raise exception 'CalledOut Pro is required for another recurring schedule';
  end if;

  select timezone
  into v_tz
  from public.profiles
  where id = auth.uid();

  v_start_date := (now() at time zone v_tz)::date;

  insert into public.commitment_schedules(
    id,
    user_id,
    circle_id,
    title,
    workout_type,
    timezone,
    days_of_week,
    deadline_local,
    proof_window_minutes,
    minimum_duration_minutes,
    proof_method,
    requires_location
  )
  values(
    v_schedule,
    auth.uid(),
    p_circle_id,
    trim(p_title),
    p_workout_type,
    v_tz,
    p_days_of_week::smallint[],
    make_time(p_deadline_hour, 0, 0),
    p_proof_window_minutes,
    p_minimum_duration,
    p_proof_method,
    p_requires_location
  );

  for v_day in
    select generate_series(v_start_date, v_start_date + 30, interval '1 day')::date
  loop
    if extract(dow from v_day)::integer = any(p_days_of_week) then
      v_deadline := (
        (
          v_day::text || ' ' || lpad(p_deadline_hour::text, 2, '0') || ':00:00'
        )::timestamp at time zone v_tz
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
          status
        )
        values(
          auth.uid(),
          p_circle_id,
          v_schedule,
          trim(p_title),
          p_workout_type,
          v_day,
          v_deadline - make_interval(mins => p_proof_window_minutes),
          v_deadline,
          v_tz,
          p_minimum_duration,
          p_proof_method,
          p_requires_location,
          case
            when now() >= v_deadline - make_interval(mins => p_proof_window_minutes)
              then 'proof_window_open'::public.commitment_status
            else 'upcoming'::public.commitment_status
          end
        )
        on conflict(schedule_id, commitment_date) do nothing;
      end if;
    end if;
  end loop;

  return v_schedule;
end;
$$;

grant execute on function public.create_schedule_with_commitments_v2(
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

create or replace function public.create_schedule_with_commitments(
  p_title text,
  p_workout_type public.workout_type,
  p_days_of_week integer[],
  p_deadline_hour integer,
  p_minimum_duration integer,
  p_proof_method public.proof_method,
  p_requires_location boolean,
  p_circle_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
begin
  return public.create_schedule_with_commitments_v2(
    p_title,
    p_workout_type,
    p_days_of_week,
    p_deadline_hour,
    p_minimum_duration,
    p_proof_method,
    240,
    p_requires_location,
    p_circle_id
  );
end;
$$;

commit;
