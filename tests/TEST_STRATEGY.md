# CalledOut test strategy

## Repository gates

- Mobile TypeScript strict compilation, Expo ESLint, and Vitest unit tests.
- Admin TypeScript compilation and production Vite build.
- pgTAP definitions under `supabase/tests` for schema, policy, deadline, and RPC checks.
- Maestro critical flows under `e2e/maestro` for onboarding, commitment creation, schedule management, circle/Wall/redemption, subscription restore, and account deletion.

## Required CI matrix

1. `npm run verify` on every pull request.
2. `supabase db reset` and `supabase test db` on every migration change.
3. Seeded iOS and Android development builds for Maestro.
4. RevenueCat sandbox tests for purchase, restore, cancellation, paid-through-expiry, billing issue, grace period, expiry, resubscribe, app-user identity change, and offline entitlement cache.
5. Physical-device camera/location/push/offline tests before each store release.
6. Security regression identities: anonymous, self, another user, active circle member, removed member, moderator, owner, blocked user, and admin.

## Release-blocking scenarios

- Authentication persistence and account switching.
- Onboarding retry without duplicate first schedules.
- One-time and weekly promise creation at exact minutes across time zones and DST transitions.
- Rolling occurrence generation beyond 30 days; pause, resume, and delete behavior.
- Proof captured before the deadline but uploaded after a temporary disconnection.
- Partial storage success followed by retry, duplicate invocation, and durable local-file cleanup.
- Automatic verification, protected recapture, circle review, admin decision, dispute, and signed result.
- Submitted proof at the deadline cannot be silently converted into a miss while under review.
- Miss status, Wall ranking/filtering/reactions, redemption completion, and statistics remain consistent.
- Redemption child commitments cannot create recursive Wall misses.
- Free/Pro schedule and circle limits; entitlement expiration never blocks proof submission.
- Notification preferences, quiet hours, urgent reminders, duplicate suppression, and token cleanup.
- Blocking, reporting, leaving a circle, moderator access, account deletion, and audit history.
- Scheduler and webhook retries are idempotent.
