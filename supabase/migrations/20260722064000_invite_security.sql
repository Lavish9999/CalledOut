begin;

create table if not exists public.circle_join_attempts (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  code_hash text not null,
  succeeded boolean not null default false,
  attempted_at timestamptz not null default now()
);

create index if not exists circle_join_attempts_user_time_idx
on public.circle_join_attempts(user_id, attempted_at desc);

alter table public.circle_join_attempts enable row level security;

create or replace function public.strengthen_circle_invite_code()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if new.code is null or char_length(new.code::text) < 12 then
    loop
      new.code := upper(substr(encode(gen_random_bytes(12), 'hex'), 1, 16));
      exit when not exists(
        select 1
        from public.circle_invites
        where code = new.code
      );
    end loop;
  end if;

  return new;
end;
$$;

drop trigger if exists strengthen_circle_invite_code on public.circle_invites;
create trigger strengthen_circle_invite_code
before insert on public.circle_invites
for each row
execute function public.strengthen_circle_invite_code();

create or replace function public.join_circle_by_code(p_code text)
returns uuid
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_inv public.circle_invites%rowtype;
  v_count integer;
  v_memberships integer;
  v_is_pro boolean;
  v_limit integer;
  v_attempt_id bigint;
  v_normalized text := upper(trim(coalesce(p_code, '')));
begin
  perform public.require_active_account();

  if v_normalized !~ '^[A-Z0-9]{8,16}$' then
    raise exception 'Invite code is invalid or expired';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(auth.uid()::text || ':circle-join', 0)
  );

  if (
    select count(*)
    from public.circle_join_attempts
    where user_id = auth.uid()
      and attempted_at > now() - interval '15 minutes'
      and not succeeded
  ) >= 10 then
    raise exception 'Too many invite attempts. Try again in 15 minutes.';
  end if;

  insert into public.circle_join_attempts(user_id, code_hash)
  values(
    auth.uid(),
    encode(digest(v_normalized, 'sha256'), 'hex')
  )
  returning id into v_attempt_id;

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
  where code = v_normalized
    and revoked_at is null
    and (expires_at is null or expires_at > now())
  for update;

  if not found then
    raise exception 'Invite code is invalid or expired';
  end if;

  if public.users_blocked(auth.uid(), (
    select owner_id from public.circles where id = v_inv.circle_id
  )) then
    raise exception 'This circle is unavailable';
  end if;

  select count(*)::integer
  into v_count
  from public.circle_members
  where circle_id = v_inv.circle_id
    and status = 'active'
    and deleted_at is null;

  if v_count >= (
    select member_limit
    from public.circles
    where id = v_inv.circle_id
      and deleted_at is null
  ) then
    raise exception 'Circle is full';
  end if;

  if v_inv.max_uses is not null and v_inv.uses >= v_inv.max_uses then
    raise exception 'Invite has reached its use limit';
  end if;

  insert into public.circle_members(circle_id, user_id, role, status)
  values(v_inv.circle_id, auth.uid(), 'member', 'active')
  on conflict(circle_id, user_id)
  do update set
    status = 'active',
    deleted_at = null,
    joined_at = now(),
    updated_at = now();

  update public.circle_invites
  set uses = uses + 1,
      updated_at = now()
  where id = v_inv.id;

  update public.circle_join_attempts
  set succeeded = true
  where id = v_attempt_id;

  insert into public.activity_events(actor_id, circle_id, event_type)
  values(auth.uid(), v_inv.circle_id, 'member_joined');

  return v_inv.circle_id;
end;
$$;

create or replace function public.rotate_circle_invite(p_circle uuid)
returns text
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_code text;
begin
  perform public.require_active_account();

  if not public.is_circle_moderator(p_circle) then
    raise exception 'Only circle owners and moderators can refresh invites';
  end if;

  update public.circle_invites
  set revoked_at = now(),
      updated_at = now()
  where circle_id = p_circle
    and revoked_at is null;

  loop
    v_code := upper(substr(encode(gen_random_bytes(12), 'hex'), 1, 16));
    exit when not exists(
      select 1 from public.circle_invites where code = v_code
    );
  end loop;

  insert into public.circle_invites(
    circle_id,
    code,
    created_by,
    expires_at
  )
  values(
    p_circle,
    v_code,
    auth.uid(),
    now() + interval '30 days'
  );

  return v_code;
end;
$$;

revoke all on function public.strengthen_circle_invite_code() from public;
revoke all on function public.join_circle_by_code(text) from public;
revoke all on function public.rotate_circle_invite(uuid) from public;

grant execute on function public.join_circle_by_code(text) to authenticated;
grant execute on function public.rotate_circle_invite(uuid) to authenticated;

commit;
