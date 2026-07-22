begin;

create or replace function public.join_circle_by_code_v2(p_code text)
returns jsonb
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
  v_owner uuid;
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'error', 'Sign in to join a circle.');
  end if;

  if not public.is_active_account(auth.uid()) then
    return jsonb_build_object('ok', false, 'error', 'This CalledOut account is restricted.');
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(auth.uid()::text || ':circle-join', 0)
  );

  v_is_pro := public.has_active_pro();
  v_limit := case when v_is_pro then 5 else 1 end;

  select count(*)::integer
  into v_memberships
  from public.circle_members
  where user_id = auth.uid()
    and status = 'active'
    and deleted_at is null;

  if v_memberships >= v_limit then
    return jsonb_build_object(
      'ok', false,
      'error', case
        when v_is_pro then 'CalledOut Pro supports up to 5 active circles.'
        else 'CalledOut Pro is required to join another circle.'
      end
    );
  end if;

  if (
    select count(*)
    from public.circle_join_attempts
    where user_id = auth.uid()
      and attempted_at > now() - interval '15 minutes'
      and not succeeded
  ) >= 10 then
    return jsonb_build_object(
      'ok', false,
      'error', 'Too many invite attempts. Try again in 15 minutes.'
    );
  end if;

  insert into public.circle_join_attempts(user_id, code_hash)
  values(
    auth.uid(),
    encode(digest(v_normalized, 'sha256'), 'hex')
  )
  returning id into v_attempt_id;

  if v_normalized !~ '^[A-Z0-9]{8,16}$' then
    return jsonb_build_object('ok', false, 'error', 'Invite code is invalid or expired.');
  end if;

  select *
  into v_inv
  from public.circle_invites
  where code = v_normalized
    and revoked_at is null
    and (expires_at is null or expires_at > now())
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'Invite code is invalid or expired.');
  end if;

  update public.circle_join_attempts
  set succeeded = true
  where id = v_attempt_id;

  select owner_id
  into v_owner
  from public.circles
  where id = v_inv.circle_id
    and deleted_at is null;

  if v_owner is null then
    return jsonb_build_object('ok', false, 'error', 'This circle is unavailable.');
  end if;

  if public.users_blocked(auth.uid(), v_owner) then
    return jsonb_build_object('ok', false, 'error', 'This circle is unavailable.');
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
    return jsonb_build_object('ok', false, 'error', 'Circle is full.');
  end if;

  if v_inv.max_uses is not null and v_inv.uses >= v_inv.max_uses then
    return jsonb_build_object('ok', false, 'error', 'Invite has reached its use limit.');
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

  insert into public.activity_events(actor_id, circle_id, event_type)
  values(auth.uid(), v_inv.circle_id, 'member_joined');

  return jsonb_build_object(
    'ok', true,
    'circle_id', v_inv.circle_id
  );
end;
$$;

revoke all on function public.join_circle_by_code_v2(text) from public;
grant execute on function public.join_circle_by_code_v2(text) to authenticated;

commit;
