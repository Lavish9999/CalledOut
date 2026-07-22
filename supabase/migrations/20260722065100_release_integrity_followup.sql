begin;

-- Make verification readiness checks safe to retry.
delete from public.verification_checks older
using public.verification_checks newer
where older.proof_submission_id = newer.proof_submission_id
  and older.check_type = newer.check_type
  and (
    older.updated_at < newer.updated_at
    or (older.updated_at = newer.updated_at and older.id < newer.id)
  );

create unique index if not exists verification_checks_type_unique
on public.verification_checks(proof_submission_id, check_type);

-- Moderation history must not prevent removal of the underlying user content.
alter table public.moderation_actions
  drop constraint if exists moderation_actions_proof_submission_id_fkey;
alter table public.moderation_actions
  drop constraint if exists moderation_actions_comment_id_fkey;
alter table public.moderation_actions
  add constraint moderation_actions_proof_submission_id_fkey
  foreign key (proof_submission_id)
  references public.proof_submissions(id)
  on delete set null;
alter table public.moderation_actions
  add constraint moderation_actions_comment_id_fkey
  foreign key (comment_id)
  references public.comments(id)
  on delete set null;

-- Existing RLS policies are permissive. Add a restrictive account-status gate
-- so a suspended, banned, or deletion-pending session cannot continue reading
-- product data directly through the API. The profile row stays readable so the
-- mobile client can show the restricted-account screen.
do $$
declare
  v_table text;
begin
  foreach v_table in array array[
    'user_settings',
    'devices',
    'circles',
    'circle_members',
    'circle_invites',
    'commitment_schedules',
    'commitments',
    'proof_submissions',
    'proof_assets',
    'verification_checks',
    'verification_votes',
    'missed_commitments',
    'redemptions',
    'grace_passes',
    'activity_events',
    'reactions',
    'comments',
    'blocks',
    'reports',
    'notification_preferences',
    'push_tokens',
    'subscriptions',
    'entitlements',
    'health_connections',
    'notification_outbox',
    'circle_join_attempts'
  ]
  loop
    execute format(
      'drop policy if exists active_account_select_gate on public.%I',
      v_table
    );
    execute format(
      'create policy active_account_select_gate on public.%I as restrictive for select to authenticated using (public.is_active_account(auth.uid()) or public.is_admin())',
      v_table
    );
  end loop;
end;
$$;

-- Account deletion requests remain readable only by service role. The user is
-- shown the scheduled date from the authenticated Edge Function response.
revoke all on table public.circle_join_attempts from anon, authenticated;
grant all on table public.circle_join_attempts to service_role;

commit;
