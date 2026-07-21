begin;

create or replace function public.refresh_profile_metrics(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_scheduled integer := 0;
  v_completed integer := 0;
  v_completion numeric(5,2) := 0;
  v_run integer := 0;
  v_current integer := 0;
  v_longest integer := 0;
  v_day record;
begin
  select
    count(*)::integer,
    count(*) filter (where c.status = 'verified')::integer
  into v_scheduled, v_completed
  from public.commitments c
  where c.user_id = p_user_id
    and c.deleted_at is null
    and c.status in ('verified', 'missed', 'redeemed', 'rejected')
    and not exists (
      select 1
      from public.redemptions r
      where r.redemption_commitment_id = c.id
        and r.deleted_at is null
    );

  v_completion := case
    when v_scheduled = 0 then 0
    else round((v_completed::numeric / v_scheduled::numeric) * 100, 2)
  end;

  for v_day in
    select
      c.commitment_date,
      bool_and(c.status = 'verified') as successful
    from public.commitments c
    where c.user_id = p_user_id
      and c.deleted_at is null
      and c.status in ('verified', 'missed', 'redeemed', 'rejected')
      and not exists (
        select 1
        from public.redemptions r
        where r.redemption_commitment_id = c.id
          and r.deleted_at is null
      )
    group by c.commitment_date
    order by c.commitment_date
  loop
    if v_day.successful then
      v_run := v_run + 1;
      v_longest := greatest(v_longest, v_run);
    else
      v_run := 0;
    end if;
  end loop;

  v_current := v_run;

  update public.profiles
  set
    current_streak = v_current,
    longest_streak = v_longest,
    completion_rate = v_completion,
    updated_at = now()
  where id = p_user_id;
end;
$$;

create or replace function public.sync_profile_metrics_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
begin
  if tg_table_name = 'commitments' then
    v_user_id := case when tg_op = 'DELETE' then old.user_id else new.user_id end;
  else
    v_user_id := case when tg_op = 'DELETE' then old.user_id else new.user_id end;
  end if;

  perform public.refresh_profile_metrics(v_user_id);

  if tg_op = 'DELETE' then
    return old;
  end if;

  return new;
end;
$$;

drop trigger if exists sync_profile_metrics_from_commitments
on public.commitments;

create trigger sync_profile_metrics_from_commitments
after insert or update or delete
on public.commitments
for each row
execute function public.sync_profile_metrics_trigger();

drop trigger if exists sync_profile_metrics_from_redemptions
on public.redemptions;

create trigger sync_profile_metrics_from_redemptions
after insert or update or delete
on public.redemptions
for each row
execute function public.sync_profile_metrics_trigger();

-- Refresh existing records immediately so zero-history users show 0%,
-- verified commitments count once, and redemption workouts never inflate stats.
do $$
declare
  v_profile record;
begin
  for v_profile in select id from public.profiles loop
    perform public.refresh_profile_metrics(v_profile.id);
  end loop;
end;
$$;

drop view if exists public.wall_rankings;

create view public.wall_rankings
with (security_invoker = true)
as
with miss_rollup as (
  select
    m.circle_id,
    m.user_id,
    min(m.id::text)::uuid as id,
    count(*)::integer as missed_count,
    count(*) filter (where m.redeemed_at is not null)::integer as redeemed_count,
    max(m.missed_at) as most_recent_missed_at
  from public.missed_commitments m
  where m.wall_visible
    and m.deleted_at is null
    and m.circle_id is not null
  group by m.circle_id, m.user_id
),
latest_redemption as (
  select distinct on (m.circle_id, m.user_id)
    m.circle_id,
    m.user_id,
    r.status as latest_redemption_status
  from public.missed_commitments m
  left join public.redemptions r
    on r.missed_commitment_id = m.id
   and r.deleted_at is null
  where m.wall_visible
    and m.deleted_at is null
    and m.circle_id is not null
  order by m.circle_id, m.user_id, m.missed_at desc, r.created_at desc nulls last
)
select
  rollup.circle_id,
  rollup.user_id,
  rollup.id,
  rollup.missed_count,
  rollup.redeemed_count,
  rollup.most_recent_missed_at,
  p.completion_rate,
  p.display_name,
  p.username,
  p.avatar_path,
  latest.latest_redemption_status
from miss_rollup rollup
join public.profiles p
  on p.id = rollup.user_id
left join latest_redemption latest
  on latest.circle_id = rollup.circle_id
 and latest.user_id = rollup.user_id;

grant select on public.wall_rankings to authenticated;

revoke all on function public.refresh_profile_metrics(uuid) from public;

commit;
