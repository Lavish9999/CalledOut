begin;

create or replace function public.ensure_current_month_grace_passes(
  p_user uuid default auth.uid()
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_month date := date_trunc('month', current_date)::date;
  v_expires timestamptz := date_trunc('month', current_date) + interval '1 month';
  v_inserted integer := 0;
  v_rows integer := 0;
begin
  if p_user is null then
    raise exception 'authentication required';
  end if;

  if not exists (
    select 1
    from public.profiles
    where id = p_user
      and account_status = 'active'
      and deleted_at is null
  ) then
    return 0;
  end if;

  insert into public.grace_passes(
    user_id,
    circle_id,
    granted_for_month,
    source,
    expires_at
  )
  values(
    p_user,
    null,
    v_month,
    'free_monthly',
    v_expires
  )
  on conflict do nothing;

  get diagnostics v_rows = row_count;
  v_inserted := v_inserted + v_rows;

  if public.has_active_pro(p_user) then
    insert into public.grace_passes(
      user_id,
      circle_id,
      granted_for_month,
      source,
      expires_at
    )
    values(
      p_user,
      null,
      v_month,
      'pro_monthly',
      v_expires
    )
    on conflict do nothing;

    get diagnostics v_rows = row_count;
    v_inserted := v_inserted + v_rows;
  end if;

  return v_inserted;
end;
$$;

revoke all on function public.ensure_current_month_grace_passes(uuid) from public;

create or replace function public.use_grace_pass(
  p_commitment_id uuid,
  p_use_type text,
  p_extend_minutes integer default 60
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_commit public.commitments%rowtype;
  v_pass uuid;
begin
  if auth.uid() is null then
    raise exception 'authentication required';
  end if;

  perform public.ensure_current_month_grace_passes(auth.uid());

  select *
  into v_commit
  from public.commitments
  where id = p_commitment_id
    and user_id = auth.uid()
  for update;

  if not found then
    raise exception 'commitment not found';
  end if;
  if now() > v_commit.deadline_at then
    raise exception 'grace pass must be used before the deadline';
  end if;
  if v_commit.status not in ('upcoming', 'proof_window_open') then
    raise exception 'commitment cannot use a grace pass in this state';
  end if;

  select id
  into v_pass
  from public.grace_passes
  where user_id = auth.uid()
    and used_at is null
    and expires_at > now()
    and (circle_id is null or circle_id = v_commit.circle_id)
  order by
    case when source = 'free_monthly' then 0 else 1 end,
    expires_at
  for update skip locked
  limit 1;

  if v_pass is null then
    raise exception 'no grace passes available';
  end if;

  if p_use_type = 'excuse' then
    update public.commitments
    set status = 'excused', excused_at = now()
    where id = p_commitment_id;
  elsif p_use_type = 'extend' then
    update public.commitments
    set deadline_at = deadline_at + make_interval(
      mins => least(greatest(p_extend_minutes, 15), 240)
    )
    where id = p_commitment_id;
  else
    raise exception 'unsupported grace action';
  end if;

  update public.grace_passes
  set
    used_commitment_id = p_commitment_id,
    use_type = p_use_type,
    used_at = now()
  where id = v_pass;

  insert into public.audit_logs(
    actor_id,
    action,
    entity_type,
    entity_id,
    after_state
  )
  values(
    auth.uid(),
    'grace_pass_used',
    'commitment',
    p_commitment_id,
    jsonb_build_object('use_type', p_use_type)
  );
end;
$$;

grant execute on function public.use_grace_pass(uuid, text, integer) to authenticated;

create or replace function public.grant_monthly_grace_passes()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer := 0;
  v_rows integer := 0;
begin
  insert into public.grace_passes(
    user_id,
    circle_id,
    granted_for_month,
    source,
    expires_at
  )
  select
    p.id,
    null,
    date_trunc('month', current_date)::date,
    'free_monthly',
    date_trunc('month', current_date) + interval '1 month'
  from public.profiles p
  where p.account_status = 'active'
    and p.deleted_at is null
  on conflict do nothing;

  get diagnostics v_rows = row_count;
  v_count := v_count + v_rows;

  insert into public.grace_passes(
    user_id,
    circle_id,
    granted_for_month,
    source,
    expires_at
  )
  select
    p.id,
    null,
    date_trunc('month', current_date)::date,
    'pro_monthly',
    date_trunc('month', current_date) + interval '1 month'
  from public.profiles p
  where p.account_status = 'active'
    and p.deleted_at is null
    and public.has_active_pro(p.id)
  on conflict do nothing;

  get diagnostics v_rows = row_count;
  v_count := v_count + v_rows;

  return v_count;
end;
$$;

create or replace function public.get_plan_overview()
returns jsonb
language plpgsql
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

  perform public.ensure_current_month_grace_passes(v_user);
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
  order by
    case when current_period_ends_at > now() then 0 else 1 end,
    current_period_ends_at desc nulls last,
    updated_at desc
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
    'will_renew', v_subscription.will_renew,
    'product_id', v_subscription.product_id,
    'store', v_subscription.store,
    'is_sandbox', v_subscription.is_sandbox,
    'management_url', v_subscription.management_url,
    'last_verified_at', v_subscription.last_verified_at
  );
end;
$$;

grant execute on function public.get_plan_overview() to authenticated;

create or replace function public.get_profile_record()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_scheduled integer := 0;
  v_completed integer := 0;
  v_missed integer := 0;
  v_redemptions integer := 0;
  v_completion_rate numeric := 0;
  v_current_streak integer := 0;
  v_longest_streak integer := 0;
  v_run integer := 0;
  v_day record;
begin
  if v_user is null then
    raise exception 'authentication required';
  end if;

  with original_resolved as (
    select
      c.id,
      c.commitment_date,
      c.status,
      case
        when c.status = 'verified' and m.id is null then true
        else false
      end as successful
    from public.commitments c
    left join public.missed_commitments m
      on m.commitment_id = c.id
      and m.deleted_at is null
    where c.user_id = v_user
      and c.deleted_at is null
      and not exists (
        select 1
        from public.redemptions r
        where r.redemption_commitment_id = c.id
          and r.deleted_at is null
      )
      and (
        c.status = 'verified'
        or m.id is not null
      )
  )
  select
    count(*)::integer,
    count(*) filter (where successful)::integer,
    count(*) filter (where not successful)::integer
  into v_scheduled, v_completed, v_missed
  from original_resolved;

  select count(*)::integer
  into v_redemptions
  from public.redemptions
  where user_id = v_user
    and status = 'completed'
    and deleted_at is null;

  v_completion_rate := case
    when v_scheduled = 0 then 0
    else (v_completed::numeric / v_scheduled::numeric) * 100
  end;

  for v_day in
    with original_resolved as (
      select
        c.commitment_date,
        case
          when c.status = 'verified' and m.id is null then true
          else false
        end as successful
      from public.commitments c
      left join public.missed_commitments m
        on m.commitment_id = c.id
        and m.deleted_at is null
      where c.user_id = v_user
        and c.deleted_at is null
        and not exists (
          select 1
          from public.redemptions r
          where r.redemption_commitment_id = c.id
            and r.deleted_at is null
        )
        and (
          c.status = 'verified'
          or m.id is not null
        )
    )
    select
      commitment_date,
      bool_and(successful) as successful
    from original_resolved
    group by commitment_date
    order by commitment_date
  loop
    if v_day.successful then
      v_run := v_run + 1;
    else
      v_run := 0;
    end if;

    v_longest_streak := greatest(v_longest_streak, v_run);
  end loop;

  v_current_streak := v_run;

  return jsonb_build_object(
    'scheduled', v_scheduled,
    'completed', v_completed,
    'missed', v_missed,
    'redemptions_completed', v_redemptions,
    'completion_rate', v_completion_rate,
    'current_streak', v_current_streak,
    'longest_streak', v_longest_streak
  );
end;
$$;

grant execute on function public.get_profile_record() to authenticated;

create or replace function public.get_accountability_insights()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_resolved integer := 0;
  v_completed integer := 0;
  v_last30_total integer := 0;
  v_last30_completed integer := 0;
  v_redeemed integer := 0;
  v_best_weekday text;
  v_strongest_workout text;
begin
  if v_user is null then
    raise exception 'authentication required';
  end if;

  with original_resolved as (
    select
      c.commitment_date,
      c.deadline_at,
      c.workout_type::text as workout_type,
      case
        when c.status = 'verified' and m.id is null then true
        else false
      end as successful
    from public.commitments c
    left join public.missed_commitments m
      on m.commitment_id = c.id
      and m.deleted_at is null
    where c.user_id = v_user
      and c.deleted_at is null
      and not exists (
        select 1
        from public.redemptions r
        where r.redemption_commitment_id = c.id
          and r.deleted_at is null
      )
      and (
        c.status = 'verified'
        or m.id is not null
      )
  )
  select
    count(*)::integer,
    count(*) filter (where successful)::integer,
    count(*) filter (where deadline_at >= now() - interval '30 days')::integer,
    count(*) filter (
      where deadline_at >= now() - interval '30 days'
        and successful
    )::integer
  into v_resolved, v_completed, v_last30_total, v_last30_completed
  from original_resolved;

  with original_resolved as (
    select
      extract(dow from c.commitment_date)::integer as weekday,
      case
        when c.status = 'verified' and m.id is null then true
        else false
      end as successful
    from public.commitments c
    left join public.missed_commitments m
      on m.commitment_id = c.id
      and m.deleted_at is null
    where c.user_id = v_user
      and c.deleted_at is null
      and not exists (
        select 1
        from public.redemptions r
        where r.redemption_commitment_id = c.id
          and r.deleted_at is null
      )
      and (c.status = 'verified' or m.id is not null)
  ), ranked as (
    select
      weekday,
      count(*) as total,
      count(*) filter (where successful) as completed,
      count(*) filter (where successful)::numeric / count(*)::numeric as rate
    from original_resolved
    group by weekday
    order by rate desc, total desc, weekday asc
    limit 1
  )
  select case weekday
    when 0 then 'Sunday'
    when 1 then 'Monday'
    when 2 then 'Tuesday'
    when 3 then 'Wednesday'
    when 4 then 'Thursday'
    when 5 then 'Friday'
    when 6 then 'Saturday'
  end
  into v_best_weekday
  from ranked;

  with original_resolved as (
    select
      c.workout_type::text as workout_type,
      case
        when c.status = 'verified' and m.id is null then true
        else false
      end as successful
    from public.commitments c
    left join public.missed_commitments m
      on m.commitment_id = c.id
      and m.deleted_at is null
    where c.user_id = v_user
      and c.deleted_at is null
      and not exists (
        select 1
        from public.redemptions r
        where r.redemption_commitment_id = c.id
          and r.deleted_at is null
      )
      and (c.status = 'verified' or m.id is not null)
  ), ranked as (
    select
      workout_type,
      count(*) as total,
      count(*) filter (where successful) as completed,
      count(*) filter (where successful)::numeric / count(*)::numeric as rate
    from original_resolved
    group by workout_type
    order by rate desc, total desc, workout_type asc
    limit 1
  )
  select replace(workout_type, '_', ' ')
  into v_strongest_workout
  from ranked;

  select count(*)::integer
  into v_redeemed
  from public.redemptions
  where user_id = v_user
    and status = 'completed'
    and deleted_at is null;

  return jsonb_build_object(
    'resolved_count', v_resolved,
    'completed_count', v_completed,
    'completion_rate', case
      when v_resolved = 0 then 0
      else (v_completed::numeric / v_resolved::numeric) * 100
    end,
    'best_weekday', v_best_weekday,
    'strongest_workout', v_strongest_workout,
    'last30_completion_rate', case
      when v_last30_total = 0 then 0
      else (v_last30_completed::numeric / v_last30_total::numeric) * 100
    end,
    'redeemed_count', v_redeemed
  );
end;
$$;

grant execute on function public.get_accountability_insights() to authenticated;

commit;
