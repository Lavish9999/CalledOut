begin;

revoke all on function public.process_commitment_deadlines() from public, anon, authenticated;
revoke all on function public.grant_monthly_grace_passes() from public, anon, authenticated;
revoke all on function public.ensure_current_month_grace_passes(uuid) from public, anon, authenticated;
revoke all on function public.maintain_commitment_horizon(integer) from public, anon, authenticated;
revoke all on function public.prepare_account_deletion(uuid) from public, anon, authenticated;
revoke all on function public.mark_commitment_missed(uuid, timestamptz) from public, anon, authenticated;
revoke all on function public.finalize_proof_review(uuid, boolean, uuid, text, text) from public, anon, authenticated;
revoke all on function public.notification_category_enabled(uuid, text) from public, anon, authenticated;
revoke all on function public.notification_quiet_until(uuid, timestamptz) from public, anon, authenticated;
revoke all on function public.queue_user_notification(uuid, text, text, text, jsonb, text, timestamptz) from public, anon, authenticated;
revoke all on function public.claim_notification_jobs(integer) from public, anon, authenticated;
revoke all on function public.enforce_active_actor() from public, anon, authenticated;
revoke all on function public.apply_pro_circle_limits() from public, anon, authenticated;
revoke all on function public.strengthen_circle_invite_code() from public, anon, authenticated;

revoke all on table public.account_deletion_requests from anon, authenticated;
revoke all on table public.notification_outbox from anon, authenticated;
revoke all on table public.circle_join_attempts from anon, authenticated;
revoke all on table public.apple_revocation_tokens from anon, authenticated;

grant execute on function public.process_commitment_deadlines() to service_role;
grant execute on function public.grant_monthly_grace_passes() to service_role;
grant execute on function public.maintain_commitment_horizon(integer) to service_role;
grant execute on function public.prepare_account_deletion(uuid) to service_role;
grant execute on function public.claim_notification_jobs(integer) to service_role;

grant all on table public.account_deletion_requests to service_role;
grant all on table public.notification_outbox to service_role;
grant all on table public.circle_join_attempts to service_role;
grant all on table public.apple_revocation_tokens to service_role;

commit;
