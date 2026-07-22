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
  v_redemption public.redemptions%rowtype;
  v_missed public.missed_commitments%rowtype;
  v_is_redemption boolean := false;
  v_decided_at timestamptz := now();
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

  select *
  into v_redemption
  from public.redemptions
  where redemption_commitment_id = v_commitment.id
    and deleted_at is null
  for update;

  v_is_redemption := found;

  update public.proof_submissions
  set status = case
        when p_accept then 'verified'::public.proof_status
        else 'rejected'::public.proof_status
      end,
      decided_at = v_decided_at,
      dispute_reason = case
        when p_accept then dispute_reason
        else nullif(trim(coalesce(p_reason, '')), '')
      end,
      updated_at = v_decided_at
  where id = p_submission;

  update public.commitments
  set status = case
        when p_accept then 'verified'::public.commitment_status
        else 'rejected'::public.commitment_status
      end,
      verified_at = case when p_accept then v_decided_at else null end,
      updated_at = v_decided_at
  where id = v_commitment.id;

  if p_accept and v_is_redemption then
    update public.redemptions
    set status = 'completed',
        completed_at = v_decided_at,
        updated_at = v_decided_at
    where id = v_redemption.id;

    select *
    into v_missed
    from public.missed_commitments
    where id = v_redemption.missed_commitment_id
      and deleted_at is null
    for update;

    if not found then
      raise exception 'Original missed commitment was not found';
    end if;

    update public.missed_commitments
    set redeemed_at = v_decided_at,
        updated_at = v_decided_at
    where id = v_missed.id;

    update public.commitments
    set status = 'redeemed',
        updated_at = v_decided_at
    where id = v_missed.commitment_id
      and deleted_at is null;

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
      v_missed.commitment_id,
      p_submission,
      'redemption_completed',
      jsonb_build_object(
        'title', v_commitment.title,
        'review_source', p_source
      )
    )
    on conflict(commitment_id, event_type) do nothing;
  elsif p_accept then
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
      jsonb_build_object(
        'title', v_commitment.title,
        'review_source', p_source
      )
    )
    on conflict(commitment_id, event_type) do nothing;
  end if;

  perform public.queue_user_notification(
    v_commitment.user_id,
    'proof_results',
    case when p_accept then 'Proof approved' else 'Proof needs a retake' end,
    case
      when p_accept and v_is_redemption then 'Redemption complete. The original miss remains in your record.'
      when p_accept then 'Your promise has been marked complete.'
      else 'Retake fresh proof before the deadline if the proof window is still open.'
    end,
    jsonb_build_object(
      'commitment_id', v_commitment.id,
      'proof_submission_id', p_submission,
      'approved', p_accept,
      'redemption', v_is_redemption
    ),
    'proof-result:' || p_submission::text,
    now()
  );

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
      'commitment_id', v_commitment.id,
      'redemption', v_is_redemption
    )
  );
end;
$$;

revoke all on function public.finalize_proof_review(uuid, boolean, uuid, text, text) from public;

commit;
