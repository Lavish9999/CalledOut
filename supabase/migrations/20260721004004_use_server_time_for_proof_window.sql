begin;

create or replace function public.create_proof_submission(
  p_id uuid,
  p_commitment_id uuid,
  p_captured_at timestamptz,
  p_liveness_prompt text,
  p_liveness_completed boolean,
  p_location_result text,
  p_asset_path text,
  p_client_submission_key uuid
)
returns uuid
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_user_id uuid := auth.uid();
  v_commitment public.commitments%rowtype;
  v_existing_id uuid;
  v_server_captured_at timestamptz := clock_timestamp();
begin
  if v_user_id is null then
    raise exception 'Authentication required'
      using errcode = '28000';
  end if;

  select *
  into v_commitment
  from public.commitments
  where id = p_commitment_id
    and user_id = v_user_id
    and deleted_at is null;

  if not found then
    raise exception 'Commitment not found or not owned by this user'
      using errcode = '42501';
  end if;

  if v_server_captured_at < v_commitment.proof_window_starts_at
     or v_server_captured_at >
       v_commitment.deadline_at
       + make_interval(mins => v_commitment.grace_period_minutes)
  then
    raise exception 'Proof submission is outside the allowed proof window'
      using errcode = '22023';
  end if;

  if p_location_result not in (
    'within_approved_location',
    'outside_approved_location',
    'unavailable',
    'not_required'
  ) then
    raise exception 'Invalid location result'
      using errcode = '22023';
  end if;

  if p_asset_path is null
     or split_part(p_asset_path, '/', 1) <> v_user_id::text
  then
    raise exception 'Invalid proof storage path'
      using errcode = '42501';
  end if;

  select id
  into v_existing_id
  from public.proof_submissions
  where id = p_id
    and user_id = v_user_id;

  if v_existing_id is not null then
    return v_existing_id;
  end if;

  select id
  into v_existing_id
  from public.proof_submissions
  where commitment_id = p_commitment_id
    and user_id = v_user_id
    and status <> 'rejected'
    and deleted_at is null
  order by created_at desc
  limit 1;

  if v_existing_id is not null then
    return v_existing_id;
  end if;

  insert into public.proof_submissions (
    id,
    commitment_id,
    user_id,
    captured_at,
    capture_source,
    liveness_prompt,
    liveness_completed,
    location_result,
    status,
    asset_path,
    client_submission_key
  )
  values (
    p_id,
    p_commitment_id,
    v_user_id,
    v_server_captured_at,
    'in_app_camera',
    p_liveness_prompt,
    p_liveness_completed,
    p_location_result::public.location_result,
    'processing',
    p_asset_path,
    p_client_submission_key
  );

  return p_id;
end;
$$;

revoke all on function public.create_proof_submission(
  uuid,
  uuid,
  timestamptz,
  text,
  boolean,
  text,
  text,
  uuid
) from public;

grant execute on function public.create_proof_submission(
  uuid,
  uuid,
  timestamptz,
  text,
  boolean,
  text,
  text,
  uuid
) to authenticated;

commit;
