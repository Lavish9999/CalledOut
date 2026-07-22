begin;

create or replace function public.enforce_active_actor()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_restore_allowed boolean :=
    coalesce(current_setting('calledout.allow_account_restore', true), '') = 'true';
begin
  if auth.uid() is null then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;

  if tg_table_name = 'profiles' and tg_op = 'UPDATE' then
    if public.is_admin() then
      return new;
    end if;

    if new.id <> auth.uid() then
      raise exception 'You cannot update another profile';
    end if;

    if new.is_admin is distinct from old.is_admin then
      raise exception 'Admin status cannot be changed from the client';
    end if;

    if new.account_status is distinct from old.account_status then
      if not (
        v_restore_allowed
        and old.account_status = 'deletion_pending'
        and new.account_status = 'active'
      ) then
        raise exception 'Account status cannot be changed from the client';
      end if;
    end if;

    if old.account_status <> 'active' and not v_restore_allowed then
      raise exception 'This CalledOut account is restricted';
    end if;

    return new;
  end if;

  if not public.is_active_account(auth.uid()) then
    raise exception 'This CalledOut account is restricted';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;

  return new;
end;
$$;

create or replace function public.cancel_account_deletion()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_request public.account_deletion_requests%rowtype;
begin
  if v_user is null then
    raise exception 'authentication required';
  end if;

  select *
  into v_request
  from public.account_deletion_requests
  where user_id = v_user
    and cancelled_at is null
    and completed_at is null
    and scheduled_for > now()
  for update;

  if not found then
    raise exception 'No cancellable deletion request was found';
  end if;

  update public.account_deletion_requests
  set cancelled_at = now(),
      last_error = null,
      updated_at = now()
  where id = v_request.id;

  perform set_config('calledout.allow_account_restore', 'true', true);

  update public.profiles
  set account_status = 'active',
      public_profile_opt_in = false,
      public_wall_opt_in = false,
      updated_at = now()
  where id = v_user
    and account_status = 'deletion_pending';

  if not found then
    raise exception 'The account is not pending deletion';
  end if;

  insert into public.audit_logs(
    actor_id,
    action,
    entity_type,
    entity_id,
    after_state
  )
  values(
    v_user,
    'account_deletion_cancelled',
    'profile',
    v_user,
    jsonb_build_object('request_id', v_request.id)
  );
end;
$$;

revoke all on function public.enforce_active_actor() from public, anon, authenticated;
revoke all on function public.cancel_account_deletion() from public, anon;
grant execute on function public.cancel_account_deletion() to authenticated;

commit;
