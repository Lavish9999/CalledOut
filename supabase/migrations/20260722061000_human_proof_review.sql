begin;

create or replace function public.finalize_proof_review(
  p_submission uuid,
  p_accept boolean,
  p_actor uuid,
  p_source text,
  p_reason text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_proof public.proof_submissions%rowtype;
  v_commitment public.commitments%rowtype;
  v_is_redemption boolean := false;
begin
  select *
  into v_proof
  from public.proof_submissions
  where id = p_submission
    and deleted_at is null
  for update;

  if not found then
    raise exception 'Proof was not found';
  end if;

  if v_proof.status not in ('circle_review', 'disputed') then
    if p_accept and v_proof.status = 'verified' then return; end if;
    if not p_accept and v_proof.status = 'rejected' then return; end if;
    raise exception 'Proof is not awaiting review';
  end if;

  select *
  into v_commitment
  from public.commitments
  where id = v_proof.commitment_id
    and deleted_at is null
  for update;

  if not found then
    raise exception 'Commitment was not found';
  end if;

  select exists(
    select 1
    from public.redemptions
    where redemption_commitment_id = v_commitment.id
      and deleted_at is null
  ) into v_is_redemption;

  update public.proof_submissions
  set status = case
        when p_accept then 'verified'::public.proof_status
        else 'rejected'::public.proof_status
      end,
      decided_at = now(),
      dispute_reason = case
        when p_accept then dispute_reason
        else nullif(trim(coalesce(p_reason, '')), '')
      end,
      updated_at = now()
  where id = p_submission;

  update public.commitments
  set status = case
        when p_accept then 'verified'::public.commitment_status
        else 'rejected'::public.commitment_status
      end,
      verified_at = case when p_accept then now() else null end,
      updated_at = now()
  where id = v_commitment.id;

  if p_accept and not v_is_redemption then
    insert into public.activity_events(
      actor_id,
      circle_id,
      commitment_id,
      proof_submission_id,
      event_type,
      payload
    )
    values(
      v_commitment.user_id,
      v_commitment.circle_id,
      v_commitment.id,
      p_submission,
      'proof_verified',
      jsonb_build_object('title', v_commitment.title, 'review_source', p_source)
    )
    on conflict(proof_submission_id, event_type) do nothing;
  end if;

  insert into public.audit_logs(
    actor_id,
    action,
    entity_type,
    entity_id,
    after_state
  )
  values(
    p_actor,
    case when p_accept then 'proof_review_approved' else 'proof_review_rejected' end,
    'proof_submission',
    p_submission,
    jsonb_build_object(
      'source', p_source,
      'reason', nullif(trim(coalesce(p_reason, '')), ''),
      'commitment_id', v_commitment.id
    )
  );
end;
$$;

create or replace function public.cast_verification_vote(
  p_submission uuid,
  p_vote text,
  p_reason text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_commitment public.commitments%rowtype;
  v_accept integer := 0;
  v_reject integer := 0;
  v_eligible integer := 0;
  v_threshold integer := 2;
begin
  perform public.require_active_account();

  if p_vote not in ('accept', 'reject') then
    raise exception 'Choose accept or reject';
  end if;

  if char_length(coalesce(p_reason, '')) > 500 then
    raise exception 'Review reason must be 500 characters or fewer';
  end if;

  select commitment.*
  into v_commitment
  from public.proof_submissions proof
  join public.commitments commitment on commitment.id = proof.commitment_id
  where proof.id = p_submission
    and proof.status = 'circle_review'
    and proof.deleted_at is null
    and commitment.deleted_at is null;

  if not found
    or v_commitment.circle_id is null
    or not public.is_circle_member(v_commitment.circle_id)
    or v_commitment.user_id = auth.uid()
    or public.users_blocked(auth.uid(), v_commitment.user_id)
  then
    raise exception 'not authorized to review';
  end if;

  insert into public.verification_votes(
    proof_submission_id,
    voter_id,
    vote,
    reason
  )
  values(
    p_submission,
    auth.uid(),
    p_vote,
    nullif(trim(coalesce(p_reason, '')), '')
  )
  on conflict(proof_submission_id, voter_id)
  do update set
    vote = excluded.vote,
    reason = excluded.reason,
    updated_at = now();

  select count(*)::integer
  into v_eligible
  from public.circle_members member
  where member.circle_id = v_commitment.circle_id
    and member.user_id <> v_commitment.user_id
    and member.status = 'active'
    and member.deleted_at is null
    and not public.users_blocked(member.user_id, v_commitment.user_id);

  v_threshold := least(2, greatest(1, v_eligible));

  select
    count(*) filter(where vote = 'accept')::integer,
    count(*) filter(where vote = 'reject')::integer
  into v_accept, v_reject
  from public.verification_votes
  where proof_submission_id = p_submission;

  if v_accept >= v_threshold then
    perform public.finalize_proof_review(
      p_submission,
      true,
      auth.uid(),
      'circle',
      p_reason
    );
  elsif v_reject >= v_threshold then
    perform public.finalize_proof_review(
      p_submission,
      false,
      auth.uid(),
      'circle',
      p_reason
    );
  end if;
end;
$$;

create or replace function public.admin_decide_proof(
  p_submission uuid,
  p_accept boolean,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'admin authorization required';
  end if;

  if char_length(trim(coalesce(p_reason, ''))) not between 5 and 1000 then
    raise exception 'A review note between 5 and 1000 characters is required';
  end if;

  perform public.finalize_proof_review(
    p_submission,
    p_accept,
    auth.uid(),
    'admin',
    trim(p_reason)
  );
end;
$$;

revoke all on function public.finalize_proof_review(uuid, boolean, uuid, text, text) from public;
revoke all on function public.cast_verification_vote(uuid, text, text) from public;
revoke all on function public.admin_decide_proof(uuid, boolean, text) from public;

grant execute on function public.cast_verification_vote(uuid, text, text) to authenticated;
grant execute on function public.admin_decide_proof(uuid, boolean, text) to authenticated;

commit;
