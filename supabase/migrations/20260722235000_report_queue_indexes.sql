begin;

create index if not exists reports_reporter_created_idx
on public.reports(reporter_id, created_at desc);

create index if not exists reports_open_target_idx
on public.reports(reporter_id, reported_user_id, reason, created_at desc)
where status = 'open';

commit;
