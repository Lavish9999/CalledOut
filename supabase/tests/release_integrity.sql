begin;

create extension if not exists pgtap;
select plan(18);

insert into auth.users(
  id,
  instance_id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at
)
values
  ('00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'owner@calledout.test', crypt('Password123!', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000102', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'member@calledout.test', crypt('Password123!', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000103', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'suspended@calledout.test', crypt('Password123!', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000104', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'solo@calledout.test', crypt('Password123!', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}', now(), now());

update public.profiles
set timezone = 'America/New_York', onboarding_completed_at = now()
where id in (
  '00000000-0000-0000-0000-000000000101',
  '00000000-0000-0000-0000-000000000102',
  '00000000-0000-0000-0000-000000000103',
  '00000000-0000-0000-0000-000000000104'
);

update public.profiles
set is_admin = true
where id = '00000000-0000-0000-0000-000000000102';

select ok(
  public.is_active_account('00000000-0000-0000-0000-000000000101'),
  'active account guard recognizes an active user'
);

update public.profiles
set account_status = 'suspended'
where id = '00000000-0000-0000-0000-000000000103';

select ok(
  not public.is_active_account('00000000-0000-0000-0000-000000000103'),
  'active account guard rejects a suspended user'
);

insert into public.commitments(
  user_id,
  title,
  workout_type,
  commitment_date,
  proof_window_starts_at,
  deadline_at,
  timezone,
  minimum_duration_minutes,
  proof_method,
  visibility,
  status
)
values(
  '00000000-0000-0000-0000-000000000103',
  'Hidden suspended promise',
  'gym',
  current_date + 1,
  now() + interval '1 hour',
  now() + interval '2 hours',
  'America/New_York',
  30,
  'live_photo',
  'only_me',
  'upcoming'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000103', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select is(
  (select count(*)::integer from public.commitments),
  0,
  'restrictive RLS hides product data from suspended sessions'
);

select throws_ok(
  $$
    insert into public.commitments(
      user_id,
      title,
      workout_type,
      commitment_date,
      proof_window_starts_at,
      deadline_at,
      timezone,
      minimum_duration_minutes,
      proof_method,
      visibility,
      status
    )
    values(
      '00000000-0000-0000-0000-000000000103',
      'Blocked write',
      'gym',
      current_date + 1,
      now() + interval '1 hour',
      now() + interval '2 hours',
      'America/New_York',
      30,
      'live_photo',
      'only_me',
      'upcoming'
    )
  $$,
  'This CalledOut account is restricted',
  'suspended sessions cannot create commitments'
);

reset role;
select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claim.role', '', true);

insert into public.commitment_schedules(
  id,
  user_id,
  title,
  workout_type,
  timezone,
  days_of_week,
  deadline_local,
  proof_window_minutes,
  minimum_duration_minutes,
  proof_method,
  active_from,
  is_active
)
values(
  '10000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000101',
  'Daily rolling schedule',
  'gym',
  'America/New_York',
  array[0,1,2,3,4,5,6]::smallint[],
  '23:00',
  240,
  30,
  'live_photo',
  current_date + 1,
  true
);

select lives_ok(
  $$ select public.maintain_commitment_horizon(45) $$,
  'rolling schedule horizon can be generated'
);

select cmp_ok(
  (select count(*) from public.commitments where schedule_id = '10000000-0000-0000-0000-000000000001'),
  '>=',
  30::bigint,
  'rolling schedule has at least 30 future commitments'
);

select is(
  public.maintain_commitment_horizon(45),
  0,
  'rolling schedule generation is idempotent'
);

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000104', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

do $$
begin
  for counter in 1..10 loop
    perform public.join_circle_by_code_v2('BAD' || lpad(counter::text, 5, '0'));
  end loop;
end;
$$;

select is(
  (select count(*)::integer from public.circle_join_attempts where user_id = '00000000-0000-0000-0000-000000000104' and not succeeded),
  10,
  'failed invite attempts persist for rate limiting'
);

select is(
  public.join_circle_by_code_v2('BAD99999')->>'error',
  'Too many invite attempts. Try again in 15 minutes.',
  'eleventh failed invite attempt is throttled'
);

select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claim.role', '', true);

insert into public.commitments(
  id,
  user_id,
  title,
  workout_type,
  commitment_date,
  proof_window_starts_at,
  deadline_at,
  timezone,
  minimum_duration_minutes,
  proof_method,
  visibility,
  status
)
values
  (
    '20000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000104',
    'Approved proof',
    'gym',
    current_date,
    now() - interval '1 hour',
    now() + interval '1 hour',
    'America/New_York',
    30,
    'live_photo',
    'only_me',
    'under_review'
  ),
  (
    '20000000-0000-0000-0000-000000000002',
    '00000000-0000-0000-0000-000000000104',
    'Late rejected proof',
    'gym',
    current_date,
    now() - interval '3 hours',
    now() - interval '2 hours',
    'America/New_York',
    30,
    'live_photo',
    'only_me',
    'under_review'
  );

insert into public.proof_submissions(
  id,
  commitment_id,
  user_id,
  captured_at,
  capture_source,
  liveness_prompt,
  liveness_completed,
  location_result,
  status,
  asset_path
)
values
  (
    '30000000-0000-0000-0000-000000000001',
    '20000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000104',
    now(),
    'in_app_camera',
    'Hold up two fingers',
    true,
    'not_required',
    'circle_review',
    '00000000-0000-0000-0000-000000000104/approved.jpg'
  ),
  (
    '30000000-0000-0000-0000-000000000002',
    '20000000-0000-0000-0000-000000000002',
    '00000000-0000-0000-0000-000000000104',
    now() - interval '2 hours',
    'in_app_camera',
    'Give a thumbs-up',
    true,
    'not_required',
    'circle_review',
    '00000000-0000-0000-0000-000000000104/rejected.jpg'
  );

select lives_ok(
  $$ select public.finalize_proof_review('30000000-0000-0000-0000-000000000001', true, '00000000-0000-0000-0000-000000000102', 'admin', 'Prompt and workout environment visible') $$,
  'human proof approval succeeds'
);

select is(
  (select status::text from public.commitments where id = '20000000-0000-0000-0000-000000000001'),
  'verified',
  'approved proof verifies the commitment'
);

select is(
  (select count(*)::integer from public.activity_events where commitment_id = '20000000-0000-0000-0000-000000000001' and event_type = 'proof_verified'),
  1,
  'proof approval creates one idempotent activity event'
);

select lives_ok(
  $$ select public.finalize_proof_review('30000000-0000-0000-0000-000000000002', false, '00000000-0000-0000-0000-000000000102', 'admin', 'Prompt was not visible') $$,
  'late human proof rejection succeeds'
);

select is(
  (select status::text from public.commitments where id = '20000000-0000-0000-0000-000000000002'),
  'missed',
  'late rejected proof becomes a miss'
);

select is(
  (select count(*)::integer from public.missed_commitments where commitment_id = '20000000-0000-0000-0000-000000000002'),
  1,
  'late rejected proof creates one Wall miss record'
);

insert into public.circles(
  id,
  name,
  owner_id,
  member_limit
)
values(
  '40000000-0000-0000-0000-000000000001',
  'Deletion transfer test',
  '00000000-0000-0000-0000-000000000101',
  8
);

insert into public.circle_members(circle_id, user_id, role, status)
values
  ('40000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000101', 'owner', 'active'),
  ('40000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000102', 'moderator', 'active');

insert into public.circle_invites(circle_id, code, created_by)
values(
  '40000000-0000-0000-0000-000000000001',
  'DELETEOWNER1234',
  '00000000-0000-0000-0000-000000000101'
);

insert into public.activity_events(
  id,
  actor_id,
  circle_id,
  event_type,
  payload
)
values(
  '50000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000101',
  '40000000-0000-0000-0000-000000000001',
  'member_joined',
  '{}'
);

insert into public.comments(
  id,
  user_id,
  activity_event_id,
  body
)
values(
  '60000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000101',
  '50000000-0000-0000-0000-000000000001',
  'Deletion reference test'
);

insert into public.reports(
  id,
  reporter_id,
  reported_user_id,
  proof_submission_id,
  comment_id,
  reason,
  status
)
values(
  '70000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000102',
  '00000000-0000-0000-0000-000000000101',
  '30000000-0000-0000-0000-000000000001',
  '60000000-0000-0000-0000-000000000001',
  'other',
  'actioned'
);

insert into public.moderation_actions(
  id,
  report_id,
  admin_id,
  target_user_id,
  proof_submission_id,
  comment_id,
  action_type,
  reason
)
values(
  '80000000-0000-0000-0000-000000000001',
  '70000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000102',
  '00000000-0000-0000-0000-000000000101',
  '30000000-0000-0000-0000-000000000001',
  '60000000-0000-0000-0000-000000000001',
  'warning',
  'Deletion foreign-key test'
);

select lives_ok(
  $$ select public.prepare_account_deletion('00000000-0000-0000-0000-000000000101') $$,
  'account deletion preparation handles an owned circle'
);

select lives_ok(
  $$ delete from auth.users where id = '00000000-0000-0000-0000-000000000101' $$,
  'prepared account can be hard-deleted without foreign-key failure'
);

select is(
  (select owner_id::text from public.circles where id = '40000000-0000-0000-0000-000000000001'),
  '00000000-0000-0000-0000-000000000102',
  'owned circle transfers to an active moderator'
);

select is(
  (select count(*)::integer from public.profiles where id = '00000000-0000-0000-0000-000000000101'),
  0,
  'deleted profile is removed'
);

select * from finish();
rollback;
