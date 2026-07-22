begin;

create extension if not exists pgtap;
select plan(10);

select ok(
  not has_function_privilege('anon', 'public.process_commitment_deadlines()', 'EXECUTE'),
  'anonymous users cannot run deadline maintenance'
);
select ok(
  not has_function_privilege('authenticated', 'public.process_commitment_deadlines()', 'EXECUTE'),
  'authenticated users cannot run deadline maintenance'
);
select ok(
  has_function_privilege('service_role', 'public.process_commitment_deadlines()', 'EXECUTE'),
  'service role can run deadline maintenance'
);
select ok(
  not has_function_privilege('anon', 'public.claim_notification_jobs(integer)', 'EXECUTE'),
  'anonymous users cannot claim notification jobs'
);
select ok(
  not has_function_privilege('authenticated', 'public.claim_notification_jobs(integer)', 'EXECUTE'),
  'authenticated users cannot claim notification jobs'
);
select ok(
  has_function_privilege('service_role', 'public.claim_notification_jobs(integer)', 'EXECUTE'),
  'service role can claim notification jobs'
);
select ok(
  not has_table_privilege('authenticated', 'public.notification_outbox', 'SELECT'),
  'users cannot read the notification outbox directly'
);
select ok(
  not has_table_privilege('authenticated', 'public.account_deletion_requests', 'SELECT'),
  'users cannot read deletion queue internals directly'
);
select ok(
  not has_table_privilege('authenticated', 'public.apple_revocation_tokens', 'SELECT'),
  'users cannot read encrypted Apple revocation tokens'
);
select ok(
  has_table_privilege('service_role', 'public.apple_revocation_tokens', 'SELECT'),
  'service role can process encrypted Apple revocation tokens'
);

select * from finish();
rollback;
