begin;

-- Private commitments do not have another person to review them. A complete,
-- fresh in-app capture is therefore finalized automatically. Circle-attached
-- commitments continue through the existing member-vote workflow.
create or replace function public.finalize_automatic_private_proof(
  p_submission uuid,
  p_user uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_proof public.proof_submissions%rowtype;
  v_commitment public.commitments%rowtype;
begin
  select *
  into v_proof
  from public.proof_submissions
  where id = p_submission
    and user_id = p_user
    and deleted_at is null
  for update;

  if not found then
    raise exception 'Proof was not found';
  end if;

  if v_proof.status = 'verified' then
    return;
  end if;

  if v_proof.status not in ('processing', 'circle_review') then
    raise exception 'Proof is not eligible for automatic private verification';
  end if;

  select *
  into v_commitment
  from public.commitments
  where id = v_proof.commitment_id
    and user_id = p_user
    and deleted_at is null
  for update;

  if not found then
    raise exception 'Commitment was not found';
  end if;

  if v_commitment.circle_id is not null then
    raise exception 'Circle proof must be decided by eligible circle members';
  end if;

  -- Reuse the audited finalization path, including redemption completion,
  -- activity events, and the user's proof-result notification.
  if v_proof.status = 'processing' then
    update public.proof_submissions
    set status = 'circle_review',
        decided_at = null,
        updated_at = now()
    where id = p_submission;

    update public.commitments
    set status = 'under_review',
        verified_at = null,
        updated_at = now()
    where id = v_commitment.id;
  end if;

  perform public.finalize_proof_review(
    p_submission,
    true,
    p_user,
    'automatic_private',
    'Complete fresh private proof verified automatically.'
  );
end;
$$;

revoke all on function public.finalize_automatic_private_proof(uuid, uuid)
from public, anon, authenticated;
grant execute on function public.finalize_automatic_private_proof(uuid, uuid)
to service_role;

-- Close private proofs that were already stranded in the old admin-review path.
do $$
declare
  v_row record;
begin
  for v_row in
    select proof.id as proof_id, proof.user_id
    from public.proof_submissions proof
    join public.commitments commitment on commitment.id = proof.commitment_id
    where proof.deleted_at is null
      and commitment.deleted_at is null
      and proof.status = 'circle_review'
      and commitment.status = 'under_review'
      and commitment.circle_id is null
  loop
    perform public.finalize_automatic_private_proof(
      v_row.proof_id,
      v_row.user_id
    );
  end loop;
end;
$$;

-- A disputed circle proof goes back to the circle. A disputed private proof asks
-- the user for a fresh capture instead of creating an admin work queue.
update public.proof_submissions proof
set status = 'circle_review',
    decided_at = null,
    updated_at = now()
from public.commitments commitment
where commitment.id = proof.commitment_id
  and proof.deleted_at is null
  and commitment.deleted_at is null
  and proof.status = 'disputed'
  and commitment.circle_id is not null;

update public.commitments commitment
set status = 'under_review',
    updated_at = now()
where commitment.deleted_at is null
  and commitment.circle_id is not null
  and exists (
    select 1
    from public.proof_submissions proof
    where proof.commitment_id = commitment.id
      and proof.deleted_at is null
      and proof.status = 'circle_review'
  );

update public.proof_submissions proof
set status = 'rejected',
    decided_at = now(),
    dispute_reason = coalesce(
      nullif(trim(proof.dispute_reason), ''),
      'Retake fresh private proof before the deadline.'
    ),
    updated_at = now()
from public.commitments commitment
where commitment.id = proof.commitment_id
  and proof.deleted_at is null
  and commitment.deleted_at is null
  and proof.status = 'disputed'
  and commitment.circle_id is null;

update public.commitments commitment
set status = 'rejected',
    verified_at = null,
    updated_at = now()
where commitment.deleted_at is null
  and commitment.circle_id is null
  and commitment.status = 'under_review'
  and exists (
    select 1
    from public.proof_submissions proof
    where proof.commitment_id = commitment.id
      and proof.deleted_at is null
      and proof.status = 'rejected'
  );

-- Workout proof is no longer an admin decision surface.
drop function if exists public.admin_decide_proof(uuid, boolean, text);

drop policy if exists proof_admin_review_read on storage.objects;
drop policy if exists proof_owner_member_admin_read on storage.objects;
drop policy if exists proof_owner_circle_read on storage.objects;
create policy proof_owner_circle_read
on storage.objects
for select
to authenticated
using (
  bucket_id = 'proof-media'
  and (
    (storage.foldername(name))[1] = auth.uid()::text
    or exists (
      select 1
      from public.proof_submissions proof
      join public.commitments commitment on commitment.id = proof.commitment_id
      where proof.asset_path = name
        and proof.deleted_at is null
        and commitment.deleted_at is null
        and commitment.circle_id is not null
        and public.is_circle_member(commitment.circle_id)
        and not public.users_blocked(auth.uid(), proof.user_id)
    )
  )
);

-- Remove the administrator bypass from proof data. Owners and eligible circle
-- members retain the same access required by the in-app review experience.
drop policy if exists proofs_read on public.proof_submissions;
create policy proofs_read
on public.proof_submissions
for select
to authenticated
using (
  user_id = auth.uid()
  or exists (
    select 1
    from public.commitments commitment
    where commitment.id = proof_submissions.commitment_id
      and commitment.circle_id is not null
      and public.is_circle_member(commitment.circle_id)
      and not public.users_blocked(auth.uid(), proof_submissions.user_id)
  )
);

drop policy if exists proof_assets_read on public.proof_assets;
create policy proof_assets_read
on public.proof_assets
for select
to authenticated
using (
  exists (
    select 1
    from public.proof_submissions proof
    join public.commitments commitment on commitment.id = proof.commitment_id
    where proof.id = proof_assets.proof_submission_id
      and (
        proof.user_id = auth.uid()
        or (
          commitment.circle_id is not null
          and public.is_circle_member(commitment.circle_id)
          and not public.users_blocked(auth.uid(), proof.user_id)
        )
      )
  )
);

drop policy if exists checks_read on public.verification_checks;
create policy checks_read
on public.verification_checks
for select
to authenticated
using (
  exists (
    select 1
    from public.proof_submissions proof
    join public.commitments commitment on commitment.id = proof.commitment_id
    where proof.id = verification_checks.proof_submission_id
      and (
        proof.user_id = auth.uid()
        or (
          commitment.circle_id is not null
          and public.is_circle_member(commitment.circle_id)
          and not public.users_blocked(auth.uid(), proof.user_id)
        )
      )
  )
);

drop policy if exists votes_read on public.verification_votes;
create policy votes_read
on public.verification_votes
for select
to authenticated
using (
  exists (
    select 1
    from public.proof_submissions proof
    join public.commitments commitment on commitment.id = proof.commitment_id
    where proof.id = verification_votes.proof_submission_id
      and commitment.circle_id is not null
      and public.is_circle_member(commitment.circle_id)
      and not public.users_blocked(auth.uid(), proof.user_id)
  )
);

commit;
