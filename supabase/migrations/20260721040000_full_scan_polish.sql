begin;

-- Remove retry-created duplicates before enforcing idempotency.
delete from public.verification_checks older
using public.verification_checks newer
where older.proof_submission_id = newer.proof_submission_id
  and older.check_type = newer.check_type
  and (
    older.created_at < newer.created_at
    or (older.created_at = newer.created_at and older.id < newer.id)
  );

create unique index if not exists verification_checks_submission_type_unique
on public.verification_checks(proof_submission_id, check_type);

delete from public.activity_events older
using public.activity_events newer
where older.proof_submission_id is not null
  and older.proof_submission_id = newer.proof_submission_id
  and older.event_type = newer.event_type
  and (
    older.created_at < newer.created_at
    or (older.created_at = newer.created_at and older.id < newer.id)
  );

create unique index if not exists activity_proof_event_unique
on public.activity_events(proof_submission_id, event_type);

commit;
