begin;

create extension if not exists pgtap;
select plan(4);

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
values(
  '00000000-0000-0000-0000-000000000201',
  '00000000-0000-0000-0000-000000000000',
  'authenticated',
  'authenticated',
  'restore@calledout.test',
  '',
  now(),
  '{"provider":"email","providers":["email"]}',
  '{}',
  now(),
  now()
);

update public.profiles
set account_status = 'deletion_pending',
    public_profile_opt_in = false,
    public_wall_opt_in = false
where id = '00000000-0000-0000-0000-000000000201';

insert into public.account_deletion_requests(
  user_id,
  requested_at,
  scheduled_for
)
values(
  '00000000-0000-0000-0000-000000000201',
  now(),
  now() + interval '30 days'
);

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '00000000-0000-0000-0000-000000000201',
  true
);
select set_config('request.jwt.claim.role', 'authenticated', true);

select throws_ok(
  $$
    update public.profiles
    set account_status = 'active'
    where id = '00000000-0000-0000-0000-000000000201'
  $$,
  'permission denied for table profiles',
  'a deletion-pending user cannot directly restore profile status'
);

select lives_ok(
  $$ select public.cancel_account_deletion() $$,
  'the audited cancellation RPC restores the account'
);

reset role;
select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claim.role', '', true);

select is(
  (
    select account_status
    from public.profiles
    where id = '00000000-0000-0000-0000-000000000201'
  ),
  'active',
  'the account becomes active again'
);

select ok(
  (
    select cancelled_at is not null
      and public_profile_opt_in = false
      and public_wall_opt_in = false
    from public.account_deletion_requests request
    join public.profiles profile on profile.id = request.user_id
    where request.user_id = '00000000-0000-0000-0000-000000000201'
  ),
  'the request is cancelled while public visibility stays disabled'
);

select * from finish();
rollback;
