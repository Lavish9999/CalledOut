begin;

grant usage on schema public to authenticated;

-- Supabase projects often inherit these grants from platform defaults, but a
-- production schema must remain correct when rebuilt from migrations alone.
-- RLS remains the authorization layer; these privileges only allow PostgREST
-- to reach the policies instead of failing first with table permission errors.
do $$
declare
  v_table record;
begin
  for v_table in
    select cls.relname
    from pg_class cls
    join pg_namespace ns on ns.oid = cls.relnamespace
    where ns.nspname = 'public'
      and cls.relkind in ('r', 'p')
      and cls.relrowsecurity
  loop
    execute format(
      'grant select, insert, update, delete on table public.%I to authenticated',
      v_table.relname
    );
  end loop;
end;
$$;

do $$
declare
  v_sequence record;
begin
  for v_sequence in
    select sequence_name
    from information_schema.sequences
    where sequence_schema = 'public'
  loop
    execute format(
      'grant usage, select on sequence public.%I to authenticated',
      v_sequence.sequence_name
    );
  end loop;
end;
$$;

-- Invite-attempt rows contain only the signed-in user's hashed attempts. This
-- policy lets the client and behavior tests inspect only their own throttle
-- state while writes continue exclusively through the hardened join RPC.
drop policy if exists circle_join_attempts_own_read
on public.circle_join_attempts;

create policy circle_join_attempts_own_read
on public.circle_join_attempts
for select
to authenticated
using (
  user_id = auth.uid()
  or public.is_admin()
);

commit;
