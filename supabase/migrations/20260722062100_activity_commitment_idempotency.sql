begin;

delete from public.activity_events older
using public.activity_events newer
where older.commitment_id is not null
  and older.commitment_id = newer.commitment_id
  and older.event_type = newer.event_type
  and (
    older.created_at < newer.created_at
    or (older.created_at = newer.created_at and older.id < newer.id)
  );

create unique index if not exists activity_commitment_event_unique
on public.activity_events(commitment_id, event_type)
where commitment_id is not null;

commit;
