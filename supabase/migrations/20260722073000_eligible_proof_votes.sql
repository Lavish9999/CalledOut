begin;

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

  if p_vote = 'reject'
    and char_length(trim(coalesce(p_reason, ''))) < 5
  then
    raise exception 'Add a brief reason when rejecting proof';
  end if;

  select commitment.*
  into v_commitment
  from public.proof_submissions proof
  join public.commitments commitment on commitment.id = proof.commitment_id
  where proof.id = p_submission
    and proof.status = 'circle_review'
    and proof.deleted_at is null
    and commitment.deleted_at is null
  for update of proof, commitment;

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
  join public.profiles profile on profile.id = member.user_id
  where member.circle_id = v_commitment.circle_id
    and member.user_id <> v_commitment.user_id
    and member.status = 'active'
    and member.deleted_at is null
    and profile.account_status = 'active'
    and profile.deleted_at is null
    and not public.users_blocked(member.user_id, v_commitment.user_id);

  v_threshold := least(2, greatest(1, v_eligible));

  select
    count(*) filter(where vote.vote = 'accept')::integer,
    count(*) filter(where vote.vote = 'reject')::integer
  into v_accept, v_reject
  from public.verification_votes vote
  join public.circle_members member
    on member.user_id = vote.voter_id
    and member.circle_id = v_commitment.circle_id
    and member.status = 'active'
    and member.deleted_at is null
  join public.profiles profile
    on profile.id = vote.voter_id
    and profile.account_status = 'active'
    and profile.deleted_at is null
  where vote.proof_submission_id = p_submission
    and vote.voter_id <> v_commitment.user_id
    and not public.users_blocked(vote.voter_id, v_commitment.user_id);

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

revoke all on function public.cast_verification_vote(uuid, text, text)
from public, anon;
grant execute on function public.cast_verification_vote(uuid, text, text)
to authenticated;

commit;
