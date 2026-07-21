# Deployment

## Supabase

```bash
supabase login
supabase link --project-ref YOUR_PROJECT_REF
supabase db push
supabase functions deploy verify-proof
supabase functions deploy process-deadlines
supabase functions deploy dispatch-notifications
supabase functions deploy revenuecat-webhook --no-verify-jwt
supabase functions deploy request-account-deletion
supabase functions deploy process-account-deletions
supabase secrets set SUPABASE_SERVICE_ROLE_KEY=... REVENUECAT_WEBHOOK_AUTH=... DEADLINE_JOB_SECRET=... NOTIFICATION_JOB_SECRET=... ACCOUNT_DELETION_JOB_SECRET=...
```

Schedule `process-deadlines` every minute, `dispatch-notifications` at least every minute, and `process-account-deletions` daily. The functions use persisted state, status predicates, and idempotency controls so retries are safe.

## Expo/EAS

```bash
cd apps/mobile
npm install
npx eas-cli login
npx eas-cli build:configure
npx eas-cli build --profile preview --platform ios
npx eas-cli build --profile preview --platform android
```

Set production public environment values as EAS environment variables. Do not put secret server keys in EAS public variables.

## Release gates

- `npm run verify`
- Supabase migration reset succeeds from an empty database.
- RLS test suite passes for anonymous, member, moderator, owner, blocked, and admin roles.
- Physical-device proof capture and offline retry pass.
- Store sandbox purchase, renewal, cancellation, restore, and account-transfer behavior pass.


## Admin dashboard

```bash
cp apps/admin/.env.example apps/admin/.env
npm run build:admin
```

Deploy `apps/admin/dist` to a static host. The client verifies the signed-in profile, while every privileged mutation is independently authorized by server-side PostgreSQL RPC checks.
