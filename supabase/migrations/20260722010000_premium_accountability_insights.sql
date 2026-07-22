begin;

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
  v_missed integer := 0;
  v_last30_total integer := 0;
  v_last30_completed integer := 0;
  v_last30_missed integer := 0;
  v_prior30_total integer := 0;
  v_prior30_completed integer := 0;
  v_best_weekday jsonb;
  v_weakest_weekday jsonb;
  v_strongest_workout jsonb;
  v_best_deadline_window jsonb;
  v_weekly_trend jsonb := '[]'::jsonb;
  v_average_proof_lead numeric;
  v_proof_sample_count integer := 0;
  v_redemption_resolved integer := 0;
  v_redemption_completed integer := 0;
  v_redemption_open integer := 0;
  v_profile_record jsonb := '{}'::jsonb;
  v_last30_rate numeric := 0;
  v_prior30_rate numeric;
begin
  if v_user is null then
    raise exception 'authentication required';
  end if;

  with original_resolved as (
    select
      c.id,
      c.commitment_date,
      c.deadline_at,
      c.timezone,
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
  )
  select
    count(*)::integer,
    count(*) filter (where successful)::integer,
    count(*) filter (where not successful)::integer,
    count(*) filter (
      where deadline_at >= now() - interval '30 days'
    )::integer,
    count(*) filter (
      where deadline_at >= now() - interval '30 days'
        and successful
    )::integer,
    count(*) filter (
      where deadline_at >= now() - interval '30 days'
        and not successful
    )::integer,
    count(*) filter (
      where deadline_at >= now() - interval '60 days'
        and deadline_at < now() - interval '30 days'
    )::integer,
    count(*) filter (
      where deadline_at >= now() - interval '60 days'
        and deadline_at < now() - interval '30 days'
        and successful
    )::integer
  into
    v_resolved,
    v_completed,
    v_missed,
    v_last30_total,
    v_last30_completed,
    v_last30_missed,
    v_prior30_total,
    v_prior30_completed
  from original_resolved;

  v_last30_rate := case
    when v_last30_total = 0 then 0
    else round((v_last30_completed::numeric / v_last30_total::numeric) * 100, 1)
  end;

  v_prior30_rate := case
    when v_prior30_total = 0 then null
    else round((v_prior30_completed::numeric / v_prior30_total::numeric) * 100, 1)
  end;

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
      and c.deadline_at >= now() - interval '90 days'
  ), grouped as (
    select
      weekday,
      count(*)::integer as total,
      count(*) filter (where successful)::integer as completed,
      round(
        (count(*) filter (where successful)::numeric / count(*)::numeric) * 100,
        1
      ) as rate
    from original_resolved
    group by weekday
  ), named as (
    select
      case weekday
        when 0 then 'Sunday'
        when 1 then 'Monday'
        when 2 then 'Tuesday'
        when 3 then 'Wednesday'
        when 4 then 'Thursday'
        when 5 then 'Friday'
        when 6 then 'Saturday'
      end as name,
      total,
      completed,
      rate,
      weekday
    from grouped
  )
  select jsonb_build_object(
    'name', name,
    'total', total,
    'completed', completed,
    'rate', rate
  )
  into v_best_weekday
  from named
  order by rate desc, total desc, weekday asc
  limit 1;

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
      and c.deadline_at >= now() - interval '90 days'
  ), grouped as (
    select
      weekday,
      count(*)::integer as total,
      count(*) filter (where successful)::integer as completed,
      round(
        (count(*) filter (where successful)::numeric / count(*)::numeric) * 100,
        1
      ) as rate
    from original_resolved
    group by weekday
    having count(*) >= 2
  ), named as (
    select
      case weekday
        when 0 then 'Sunday'
        when 1 then 'Monday'
        when 2 then 'Tuesday'
        when 3 then 'Wednesday'
        when 4 then 'Thursday'
        when 5 then 'Friday'
        when 6 then 'Saturday'
      end as name,
      total,
      completed,
      rate,
      weekday
    from grouped
  )
  select jsonb_build_object(
    'name', name,
    'total', total,
    'completed', completed,
    'rate', rate
  )
  into v_weakest_weekday
  from named
  order by rate asc, total desc, weekday asc
  limit 1;

  with original_resolved as (
    select
      replace(c.workout_type::text, '_', ' ') as workout_type,
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
      and c.deadline_at >= now() - interval '90 days'
  ), grouped as (
    select
      workout_type,
      count(*)::integer as total,
      count(*) filter (where successful)::integer as completed,
      round(
        (count(*) filter (where successful)::numeric / count(*)::numeric) * 100,
        1
      ) as rate
    from original_resolved
    group by workout_type
  )
  select jsonb_build_object(
    'name', workout_type,
    'total', total,
    'completed', completed,
    'rate', rate
  )
  into v_strongest_workout
  from grouped
  order by rate desc, total desc, workout_type asc
  limit 1;

  with original_resolved as (
    select
      case
        when extract(hour from (c.deadline_at at time zone c.timezone)) < 12 then 'Morning'
        when extract(hour from (c.deadline_at at time zone c.timezone)) < 17 then 'Afternoon'
        else 'Evening'
      end as deadline_window,
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
      and c.deadline_at >= now() - interval '90 days'
  ), grouped as (
    select
      deadline_window,
      count(*)::integer as total,
      count(*) filter (where successful)::integer as completed,
      round(
        (count(*) filter (where successful)::numeric / count(*)::numeric) * 100,
        1
      ) as rate
    from original_resolved
    group by deadline_window
  )
  select jsonb_build_object(
    'name', deadline_window,
    'total', total,
    'completed', completed,
    'rate', rate
  )
  into v_best_deadline_window
  from grouped
  order by rate desc, total desc, deadline_window asc
  limit 1;

  with weeks as (
    select
      position,
      date_trunc('week', now()) - ((5 - position) * interval '1 week') as week_start
    from generate_series(0, 5) as generated(position)
  ), original_resolved as (
    select
      c.deadline_at,
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
  ), grouped as (
    select
      w.position,
      w.week_start,
      count(o.deadline_at)::integer as total,
      count(o.deadline_at) filter (where o.successful)::integer as completed,
      count(o.deadline_at) filter (where not o.successful)::integer as missed
    from weeks w
    left join original_resolved o
      on o.deadline_at >= w.week_start
      and o.deadline_at < w.week_start + interval '1 week'
    group by w.position, w.week_start
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'week_start', to_char(week_start, 'YYYY-MM-DD'),
        'label', to_char(week_start, 'Mon DD'),
        'total', total,
        'completed', completed,
        'missed', missed,
        'rate', case
          when total = 0 then 0
          else round((completed::numeric / total::numeric) * 100, 1)
        end
      )
      order by position
    ),
    '[]'::jsonb
  )
  into v_weekly_trend
  from grouped;

  with verified_proofs as (
    select distinct on (c.id)
      c.id,
      greatest(
        0,
        extract(epoch from (c.deadline_at - p.captured_at)) / 60
      ) as lead_minutes
    from public.commitments c
    join public.proof_submissions p
      on p.commitment_id = c.id
      and p.user_id = v_user
      and p.status = 'verified'
      and p.deleted_at is null
    left join public.missed_commitments m
      on m.commitment_id = c.id
      and m.deleted_at is null
    where c.user_id = v_user
      and c.status = 'verified'
      and c.deleted_at is null
      and m.id is null
      and not exists (
        select 1
        from public.redemptions r
        where r.redemption_commitment_id = c.id
          and r.deleted_at is null
      )
      and c.deadline_at >= now() - interval '90 days'
    order by c.id, p.captured_at desc
  )
  select
    round(avg(lead_minutes), 0),
    count(*)::integer
  into v_average_proof_lead, v_proof_sample_count
  from verified_proofs;

  select
    count(*) filter (where status in ('completed', 'expired'))::integer,
    count(*) filter (where status = 'completed')::integer,
    count(*) filter (where status in ('available', 'in_progress'))::integer
  into
    v_redemption_resolved,
    v_redemption_completed,
    v_redemption_open
  from public.redemptions
  where user_id = v_user
    and deleted_at is null;

  v_profile_record := public.get_profile_record();

  return jsonb_build_object(
    'resolved_count', v_resolved,
    'completed_count', v_completed,
    'missed_count', v_missed,
    'completion_rate', case
      when v_resolved = 0 then 0
      else round((v_completed::numeric / v_resolved::numeric) * 100, 1)
    end,
    'last30_total', v_last30_total,
    'last30_completed', v_last30_completed,
    'last30_missed', v_last30_missed,
    'last30_completion_rate', v_last30_rate,
    'prior30_total', v_prior30_total,
    'prior30_completion_rate', v_prior30_rate,
    'trend_delta', case
      when v_prior30_rate is null then null
      else round(v_last30_rate - v_prior30_rate, 1)
    end,
    'current_streak', coalesce((v_profile_record ->> 'current_streak')::integer, 0),
    'longest_streak', coalesce((v_profile_record ->> 'longest_streak')::integer, 0),
    'best_weekday', v_best_weekday,
    'weakest_weekday', v_weakest_weekday,
    'strongest_workout', v_strongest_workout,
    'best_deadline_window', v_best_deadline_window,
    'weekly_trend', v_weekly_trend,
    'average_proof_lead_minutes', v_average_proof_lead,
    'proof_sample_count', v_proof_sample_count,
    'redemption_resolved_count', v_redemption_resolved,
    'redemption_completed_count', v_redemption_completed,
    'redemption_open_count', v_redemption_open,
    'redemption_rate', case
      when v_redemption_resolved = 0 then null
      else round(
        (v_redemption_completed::numeric / v_redemption_resolved::numeric) * 100,
        1
      )
    end
  );
end;
$$;

grant execute on function public.get_accountability_insights() to authenticated;

commit;
