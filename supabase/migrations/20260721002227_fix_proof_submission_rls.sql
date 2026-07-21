begin;

drop policy if exists proofs_insert_self
on public.proof_submissions;

create policy proofs_insert_self
on public.proof_submissions
for insert
to authenticated
with check (
  proof_submissions.user_id = auth.uid()
  and exists (
    select 1
    from public.commitments c
    where c.id = proof_submissions.commitment_id
      and c.user_id = auth.uid()
      and c.deleted_at is null
      and proof_submissions.captured_at >= c.proof_window_starts_at
      and proof_submissions.captured_at <=
        c.deadline_at + make_interval(mins => c.grace_period_minutes)
  )
);

commit;
