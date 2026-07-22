begin;

drop view if exists public.wall_rankings;

create view public.wall_rankings
with (security_invoker = true)
as
with eligible_misses as (
  select
    missed.id,
    missed.circle_id,
    missed.user_id,
    missed.missed_at,
    missed.redeemed_at,
    redemption.status as redemption_status
  from public.missed_commitments missed
  left join public.redemptions redemption
    on redemption.missed_commitment_id = missed.id
    and redemption.deleted_at is null
  join public.profiles profile
    on profile.id = missed.user_id
    and profile.account_status = 'active'
    and profile.deleted_at is null
  where missed.wall_visible
    and missed.deleted_at is null
    and missed.circle_id is not null
    and public.is_circle_member(missed.circle_id)
    and not public.users_blocked(auth.uid(), missed.user_id)
), authoritative_results as (
  select
    commitment.circle_id,
    commitment.user_id,
    count(*) filter(
      where commitment.status = 'verified'
        and missed.id is null
    )::integer as completed_count,
    count(*) filter(where missed.id is not null)::integer as missed_count
  from public.commitments commitment
  left join public.missed_commitments missed
    on missed.commitment_id = commitment.id
    and missed.deleted_at is null
  where commitment.circle_id is not null
    and commitment.deleted_at is null
    and not exists (
      select 1
      from public.redemptions redemption
      where redemption.redemption_commitment_id = commitment.id
        and redemption.deleted_at is null
    )
    and (
      commitment.status = 'verified'
      or missed.id is not null
    )
  group by commitment.circle_id, commitment.user_id
), grouped_misses as (
  select
    miss.circle_id,
    miss.user_id,
    min(miss.id::text)::uuid as id,
    count(*)::integer as missed_count,
    count(*) filter(
      where miss.redeemed_at is not null
        or miss.redemption_status = 'completed'
    )::integer as redeemed_count,
    max(miss.missed_at) as most_recent_missed_at
  from eligible_misses miss
  group by miss.circle_id, miss.user_id
)
select
  grouped.id,
  grouped.circle_id,
  grouped.user_id,
  grouped.missed_count,
  grouped.redeemed_count,
  grouped.most_recent_missed_at,
  case
    when coalesce(result.completed_count, 0) + coalesce(result.missed_count, 0) = 0
      then 0::numeric
    else round(
      coalesce(result.completed_count, 0)::numeric * 100 /
      (coalesce(result.completed_count, 0) + coalesce(result.missed_count, 0))::numeric,
      2
    )
  end as completion_rate,
  latest.redemption_status as latest_redemption_status,
  profile.display_name,
  profile.username,
  profile.avatar_path
from grouped_misses grouped
join public.profiles profile
  on profile.id = grouped.user_id
left join authoritative_results result
  on result.circle_id = grouped.circle_id
  and result.user_id = grouped.user_id
left join lateral (
  select miss.redemption_status
  from eligible_misses miss
  where miss.circle_id = grouped.circle_id
    and miss.user_id = grouped.user_id
  order by miss.missed_at desc, miss.id desc
  limit 1
) latest on true;

grant select on public.wall_rankings to authenticated;

commit;
