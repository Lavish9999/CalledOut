begin;

create or replace function public.get_circle_open_callouts(p_circle uuid)
returns integer
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  if auth.uid() is null then
    raise exception 'authentication required';
  end if;

  if not public.is_circle_member(p_circle) then
    raise exception 'You are not a member of this circle';
  end if;

  select count(*)::integer
  into v_count
  from public.missed_commitments m
  join public.redemptions r
    on r.missed_commitment_id = m.id
  where m.circle_id = p_circle
    and m.deleted_at is null
    and r.deleted_at is null
    and r.status in ('available', 'in_progress')
    and not public.users_blocked(auth.uid(), m.user_id);

  return coalesce(v_count, 0);
end;
$$;

revoke all on function public.get_circle_open_callouts(uuid) from public;
grant execute on function public.get_circle_open_callouts(uuid) to authenticated;

commit;
