begin;

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

  update public.profiles
  set account_status = 'active',
      public_profile_opt_in = false,
      public_wall_opt_in = false,
      updated_at = now()
  where id = v_user
    and account_status = 'deletion_pending';

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

revoke all on function public.cancel_account_deletion() from public, anon;
grant execute on function public.cancel_account_deletion() to authenticated;

commit;
