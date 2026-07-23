begin;

-- Repair proof reviews that were stranded when their circle was deleted before
-- this guard existed. Intentionally private commitments have circle_id = null
-- and must remain available to the CalledOut admin review queue.
create temporary table orphaned_circle_reviews on commit drop as
select
  commitment.id as commitment_id,
  proof.id as proof_id
from public.commitments commitment
join public.proof_submissions proof
  on proof.commitment_id = commitment.id
  and proof.deleted_at is null
  and proof.status = 'circle_review'
left join public.circles circle
  on circle.id = commitment.circle_id
  and circle.deleted_at is null
where commitment.deleted_at is null
  and commitment.status = 'under_review'
  and commitment.circle_id is not null
  and circle.id is null;

update public.proof_submissions proof
set status = 'rejected',
    decided_at = now(),
    dispute_reason = coalesce(
      nullif(trim(proof.dispute_reason), ''),
      'Review closed because the accountability circle was deleted.'
    ),
    updated_at = now()
from orphaned_circle_reviews orphaned
where proof.id = orphaned.proof_id;

update public.commitments commitment
set status = 'excused',
    circle_id = null,
    updated_at = now()
from orphaned_circle_reviews orphaned
where commitment.id = orphaned.commitment_id;

create or replace function public.prevent_circle_deletion_with_active_proofs()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (
    select 1
    from public.commitments commitment
    where commitment.circle_id = old.id
      and commitment.deleted_at is null
      and commitment.status in (
        'proof_window_open',
        'proof_submitted',
        'under_review'
      )
  ) then
    raise exception using
      errcode = 'check_violation',
      message = 'This circle has an active proof window or review. Resolve it before deleting the circle.';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;

  return new;
end;
$$;

revoke all on function public.prevent_circle_deletion_with_active_proofs()
from public, anon, authenticated;

drop trigger if exists prevent_circle_delete_with_active_proofs
on public.circles;
create trigger prevent_circle_delete_with_active_proofs
before delete on public.circles
for each row
execute function public.prevent_circle_deletion_with_active_proofs();

drop trigger if exists prevent_circle_soft_delete_with_active_proofs
on public.circles;
create trigger prevent_circle_soft_delete_with_active_proofs
before update of deleted_at on public.circles
for each row
when (old.deleted_at is null and new.deleted_at is not null)
execute function public.prevent_circle_deletion_with_active_proofs();

commit;
