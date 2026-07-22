# CalledOut release readiness audit — July 22, 2026

## Audit scope

Static review of the current `main` branch covering:

- iOS/Expo/EAS release configuration
- authentication and session restoration
- Supabase schema, RLS, storage policies, RPCs, migrations, and Edge Functions
- commitment scheduling and deadline processing
- proof capture, upload, retry, and verification
- The Wall, circles, blocking, reporting, moderation, and admin tooling
- RevenueCat purchase, restore, webhook, and entitlement reconciliation
- notifications and account deletion
- public legal/support surfaces
- automated tests and GitHub Actions

This audit does not directly inspect hosted Supabase secrets, cron schedules, App Store Connect metadata, RevenueCat dashboard configuration, production logs, or a physical TestFlight runtime. Those require dashboard evidence or device testing.

## Release verdict

**Do not submit build 11 for App Review yet.**

The binary has passed manual smoke testing, but the repository still contains release-blocking integrity, account-deletion, recurrence, and enforcement issues.

## P0 — release blockers

### 1. Account deletion is not reliably executable

Files:

- `supabase/functions/request-account-deletion/index.ts`
- `supabase/functions/process-account-deletions/index.ts`
- `supabase/migrations/202607200002_schema.sql`

The deletion worker calls `auth.admin.deleteUser(user_id, false)`, which hard-deletes the Auth user and cascades into `profiles`. Several profile foreign keys are restrictive rather than nullable/cascading, including circle ownership and invite creation. A typical user who owns a circle can therefore block deletion. Proof/profile media is also not removed before the Auth deletion attempt.

Required fix:

- Add a transactional deletion-preparation RPC.
- Remove user-owned Storage objects.
- Resolve owned circles by deleting them, transferring ownership, or anonymizing ownership according to a documented policy.
- Null, anonymize, retain, or delete every restrictive profile reference deliberately.
- Revoke Sign in with Apple credentials or provide the required manual-revocation path.
- Add an end-to-end deletion test for a user with a circle, proof photo, subscription history, report, comment, and push token.

### 2. Proof verification does not verify the workout or prompt

Files:

- `apps/mobile/src/app/proof/capture.tsx`
- `apps/mobile/src/features/proofs/api.ts`
- `supabase/functions/verify-proof/index.ts`

The client always submits `promptCompleted: true`. The verification function awards liveness points from that client boolean, awards integrity points from a hardcoded `true`, and never inspects the image contents. A fresh in-window camera photo normally scores 85 and auto-verifies even when it does not show a workout or the requested gesture.

Required fix:

Choose one honest verification model before release:

1. Implement server-side image validation that checks the requested prompt and workout environment, with conservative fallbacks and appeal paths; or
2. Stop claiming automated proof verification and route proof to a real human/circle review model that also works for solo users.

Policy, onboarding, paywall, and App Store copy must describe the behavior that actually exists.

### 3. Weekly schedules stop generating commitments after roughly 30 days

Files:

- `supabase/migrations/20260721050000_premium_v1.sql`
- `supabase/migrations/202607200007_plan_limits_notifications.sql`
- `supabase/functions/process-deadlines/index.ts`

Schedule creation generates commitments from the current local date through 30 days ahead. The deadline processor opens and closes existing commitments but does not extend the schedule horizon. The UI states that weekly schedules continue until the user ends them.

Required fix:

- Add an idempotent rolling-horizon function that continuously maintains at least 30 future days for every active schedule.
- Invoke it from the scheduled deadline job.
- Test month boundaries, daylight-saving transitions, timezone changes, ended schedules, and duplicate prevention.

## P1 — high-priority release risks

### 4. Suspended, banned, and deletion-pending users are not globally denied access

Files:

- `apps/mobile/src/app/_layout.tsx`
- `apps/mobile/src/providers/session.tsx`
- `supabase/migrations/202607200006_admin_rpcs.sql`
- multiple public `SECURITY DEFINER` RPCs

The mobile route guard checks authentication and onboarding, but not `profile.account_status`. Admin moderation changes the status, while most write RPCs only check `auth.uid()` and circle membership. A moderated user can retain an active Supabase session and may continue using core features.

Required fix:

- Add a central active-account guard used by every user-facing write RPC and sensitive read RPC.
- Route suspended/banned/deletion-pending accounts to a dedicated restricted screen.
- Revoke active sessions when moderation action is applied where appropriate.
- Add database tests proving suspended and banned users cannot create commitments, join circles, upload proof, comment, react, report, or purchase-gate around restrictions.

### 5. Offline proof photos can persist indefinitely and cross account boundaries on one device

Files:

- `apps/mobile/src/lib/upload-queue.ts`
- `apps/mobile/src/providers/connectivity.tsx`
- `apps/mobile/src/providers/session.tsx`

The retry queue is device-global, stores proof photos in the app document directory, retries every reconnect, has no terminal expiry or maximum retention, and is not cleared or partitioned on logout. A failed after-deadline proof may remain forever, and a later account on the same phone inherits the prior account's local queue metadata/photo.

Required fix:

- Store the owning user ID on every queued item.
- Process only the signed-in user's queue.
- Clear or securely quarantine the queue on logout/account switch.
- Expire terminal items after the proof window/grace period.
- Cap retry attempts and delete local media after success, terminal rejection, account deletion, or a documented retention period.

### 6. Notification preferences and quiet hours are not enforced by the job pipeline

Files:

- `supabase/migrations/202607200002_schema.sql`
- `supabase/migrations/202607200007_plan_limits_notifications.sql`
- `supabase/functions/dispatch-notifications/index.ts`

Preference fields exist for warning/result/social categories and quiet hours, but the deadline processor inserts notifications without consulting them. The dispatcher does not atomically claim jobs, so concurrent invocations can duplicate sends. It treats an HTTP 2xx from Expo as success without processing individual push tickets or invalidating dead tokens.

Required fix:

- Enforce category preferences and timezone-aware quiet hours when creating or dispatching jobs.
- Atomically claim jobs before sending.
- Parse Expo push tickets/receipts and invalidate `DeviceNotRegistered` tokens.
- Add backoff, deduplication keys, and operational metrics.

### 7. Public support page lacks direct published contact information

File:

- `apps/admin/src/public-site.tsx`

The support page tells signed-in users to use the app, but does not publish an email address or external contact method for locked-out users, prospective users, or App Review.

Required fix:

- Publish a monitored support email or support form on the Support URL and inside the app.
- State expected response time and safety-escalation path.

### 8. Automated release verification is too shallow

Files:

- `.github/workflows/verify.yml`
- `supabase/tests/rls.sql`
- `supabase/tests/deadline_jobs.sql`
- `e2e/maestro/*`

The workflow runs TypeScript, mobile lint/unit tests, and the admin build. Database tests only assert that objects exist, not that RLS or business behavior is correct. Maestro is not part of CI and the onboarding flow stops before proof despite its filename.

Required fix:

- Add database reset/migration/lint and pgTAP behavior tests.
- Test cross-user RLS, mutual blocking, banned accounts, proof storage, report limits, entitlement limits, schedule roll-forward, and deletion.
- Typecheck/test Edge Functions.
- Run secret scanning and dependency audit.
- Add simulator E2E for onboarding, commitment creation, proof states, circles, Wall, settings, report/block, and paywall navigation.

## P2 — important hardening

### 9. Existing free circles may keep the free member cap after upgrade

The database stores `circles.member_limit` when the circle is created. Pro UI reports a 20-member limit, but an existing free circle may remain at 8 unless it is explicitly upgraded.

### 10. RevenueCat reconciliation can be called repeatedly on login and every foreground

The authenticated sync is secure, but repeated foreground transitions can generate unnecessary RevenueCat REST lookups. Add server-side freshness caching/rate limiting based on `last_verified_at`, while preserving purchase/restore forced refreshes.

### 11. Circle invite codes have limited entropy and no join-attempt throttle

Invite codes use eight hexadecimal characters. Add higher-entropy codes and rate-limit failed join attempts by user/device/IP hash.

### 12. Admin moderation actions need safer controls

The admin UI performs suspend, ban, and reinstate immediately with generic hardcoded reasons. Add confirmation, required case-specific notes, report linkage, visible errors, and optional MFA/step-up authentication for admins.

### 13. Function execution privileges need an explicit audit

Postgres grants function execution to `PUBLIC` by default. Several migrations explicitly revoke and grant, but not every `SECURITY DEFINER` helper is visibly locked down. Add default-privilege revocation and pgTAP assertions for anon/authenticated execute access.

### 14. Social completion metrics may rely on stored profile fields

The Wall/circle surfaces read profile completion/streak fields, while profile record RPCs compute live metrics. Confirm every social metric is refreshed transactionally or switch all social reads to computed views/RPCs to prevent stale/default percentages.

## Areas that passed static review

- iOS 1.0.0 bundle and production EAS profiles are aligned.
- Apple and Google native/social authentication flows use appropriate nonce/PKCE handling.
- Supabase client session persistence uses the React Native process lock.
- RevenueCat purchase, restore, management, webhook authentication, and authenticated entitlement reconciliation are structured defensively.
- Proof uploads use private Storage paths and retry-safe submission IDs.
- Blocking is enforced across major RLS/storage/social surfaces in the latest hardening migration.
- User reports use guarded RPCs with validation, duplicate prevention, and rate limiting.
- Public privacy, terms, community-guidelines, and support routes exist.
- The Wall preview data is hidden outside local development.
- Typecheck/lint/unit/admin build verification exists and has passed locally during release preparation.

## Required release gate

Before submitting to App Review, all P0 findings must be fixed and tested. P1 items 4, 5, 7, and 8 should also be treated as mandatory because they affect moderation enforcement, privacy, App Review contact requirements, and confidence in the release.

Recommended order:

1. Fix account deletion and Sign in with Apple revocation handling.
2. Decide and implement the honest proof-verification model.
3. Add recurring-schedule horizon maintenance.
4. Enforce account status globally.
5. Partition and expire offline proof queues.
6. Publish direct support contact information.
7. Add behavior-level database and release tests.
8. Rebuild/TestFlight only when native code or configuration changes; use a compatible production OTA update only for JavaScript-only fixes after verification.
