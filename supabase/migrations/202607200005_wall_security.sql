begin;
drop view if exists public.wall_rankings;
create view public.wall_rankings with (security_invoker=true) as
select m.circle_id,m.user_id,min(m.id) as id,count(*)::int as missed_count,max(m.missed_at) as most_recent_missed_at,p.completion_rate,p.display_name,p.username,p.avatar_path,
 exists(select 1 from public.redemptions r join public.missed_commitments mm on mm.id=r.missed_commitment_id where mm.user_id=m.user_id and mm.circle_id=m.circle_id and r.status='in_progress') as redemption_in_progress
from public.missed_commitments m join public.profiles p on p.id=m.user_id
where m.wall_visible and m.deleted_at is null and m.circle_id is not null and public.is_circle_member(m.circle_id) and not public.users_blocked(auth.uid(),m.user_id)
group by m.circle_id,m.user_id,p.completion_rate,p.display_name,p.username,p.avatar_path;
grant select on public.wall_rankings to authenticated;
commit;
