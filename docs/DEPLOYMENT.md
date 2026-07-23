# Deployment

## 1. Install and verify

```bash
npm install
npm run verify
```

Do not continue to production until mobile/admin type checking, lint, unit tests, and the admin production build pass with the locked dependencies.

## 2. Supabase database

Use a staging project first.

```bash
supabase login
supabase link --project-ref YOUR_STAGING_PROJECT_REF
supabase db push
supabase test db
```

Confirm that the complete migration chain succeeds from an empty database and that `202607230008_complete_v1.sql` backfills future occurrences/statistics without duplicate records.

## 3. Edge Functions and secrets

```bash
supabase functions deploy verify-proof
supabase functions deploy process-deadlines
supabase functions deploy dispatch-notifications
supabase functions deploy revenuecat-webhook --no-verify-jwt
supabase functions deploy request-account-deletion
supabase functions deploy process-account-deletions

supabase secrets set \
  SUPABASE_SERVICE_ROLE_KEY=... \
  REVENUECAT_WEBHOOK_AUTH=... \
  EXPO_ACCESS_TOKEN=... \
  MEDIA_MODERATION_API_KEY=... \
  DEADLINE_JOB_SECRET=... \
  NOTIFICATION_JOB_SECRET=... \
  ACCOUNT_DELETION_JOB_SECRET=...
```

Use different, long random values for each scheduler secret.

## 4. Scheduler configuration

Invoke the deployed functions with an `x-job-secret` header matching the corresponding function secret:

- `process-deadlines`: every minute, `x-job-secret: <DEADLINE_JOB_SECRET>`.
- `dispatch-notifications`: every minute, `x-job-secret: <NOTIFICATION_JOB_SECRET>`.
- `process-account-deletions`: daily, `x-job-secret: <ACCOUNT_DELETION_JOB_SECRET>`.

The database functions are designed to be idempotent, but staging must still test retries, overlapping invocations, proof submitted near the deadline, expired redemptions, and future-occurrence replenishment.

## 5. Authentication and deep links

Configure Supabase Auth providers and redirects for:

- `calledout://auth/callback`
- EAS development/preview callback URLs
- Production associated-domain/universal-link URLs once the domain is owned

The in-app circle invitation currently uses the `calledout://circle/join?code=...` deep link. Configure universal/app links before public acquisition campaigns so users without the app receive a proper install/landing flow.

## 6. RevenueCat

- Entitlement: `pro`
- Offering: `default`
- Products: `calledout_monthly`, `calledout_annual`
- Webhook authorization: `Bearer <REVENUECAT_WEBHOOK_AUTH>`

Test purchase, restore, cancellation while access remains paid through expiration, billing issue, grace period, expiry, resubscribe, app-user identity changes, and account switching on a shared test device.

## 7. Expo/EAS

```bash
cd apps/mobile
npx eas-cli login
npx eas-cli build:configure
npx eas-cli build --profile preview --platform ios
npx eas-cli build --profile preview --platform android
```

Set public client values in the correct EAS environment. Never place service-role keys, scheduler secrets, or webhook secrets in `EXPO_PUBLIC_*` variables.

## 8. Admin dashboard

```bash
cp apps/admin/.env.example apps/admin/.env
npm run build:admin
```

Deploy `apps/admin/dist` behind an authenticated host. The UI is not the authorization boundary; privileged RPCs independently verify `profiles.is_admin`.

## Release gates

- Clean database migration and rollback/backup plan.
- RLS scenarios pass for anonymous, self, active member, removed member, moderator, owner, blocked user, and admin.
- Physical iOS/Android proof capture, coarse location, offline retry, recapture window, circle review, appeal, and signed result pass.
- Recurring schedules continue beyond 30 days and pause/resume/delete correctly.
- Miss, Wall ranking, reaction toggle, redemption, and statistics reconcile correctly.
- Store sandbox purchase lifecycle and account-switching behavior pass.
- Push preferences, quiet hours, urgent deadlines, and duplicate suppression pass.
- Account deletion, reporting, blocking, leaving a circle, and admin moderation pass.
