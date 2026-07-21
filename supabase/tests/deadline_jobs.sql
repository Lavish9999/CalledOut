begin;
create extension if not exists pgtap;
select plan(3);
select has_function('public','process_commitment_deadlines',array[]::text[],'deadline processor exists');
select has_function('public','grant_monthly_grace_passes',array[]::text[],'grace issuer exists');
select has_table('public','notification_outbox','notification outbox exists');
select * from finish();
rollback;
