create or replace function public.get_blocked_users()
returns table (
  blocked_user_id uuid,
  display_name text,
  username text,
  blocked_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    b.blocked_id,
    p.display_name,
    p.username,
    b.created_at
  from public.blocks b
  join public.profiles p on p.id = b.blocked_id
  where b.blocker_id = auth.uid()
  order by b.created_at desc;
$$;

create or replace function public.unblock_user(p_blocked_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'authentication required';
  end if;

  delete from public.blocks
  where blocker_id = auth.uid()
    and blocked_id = p_blocked_user_id;
end;
$$;

grant execute on function public.get_blocked_users() to authenticated;
grant execute on function public.unblock_user(uuid) to authenticated;
