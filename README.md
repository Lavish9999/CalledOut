# CalledOut

**Miss a day. Get called out.**

CalledOut is a consequence-first fitness accountability application built with Expo/React Native and Supabase. The repository contains a functioning mobile foundation, normalized PostgreSQL schema, Row Level Security policies, storage policies, scheduled-deadline functions, proof verification function, seed data, and production launch documentation.

## What is implemented

- Email/password authentication, Apple sign-in, Google OAuth, password reset, secure session persistence, and account deletion request.
- Guarded onboarding with profile, workout preferences, a first recurring schedule, and the first generated commitment.
- Five-tab app navigation: Today, The Wall, Post, Circles, and Profile.
- Real Supabase queries and mutations for profiles, commitments, circles, invitations, proof submissions, Wall records, reactions, and account settings.
- In-app camera proof capture, randomized liveness prompt, optional coarse location result, Storage upload, and server verification invocation.
- RevenueCat configuration, entitlement lookup, purchase, and restore-purchases service.
- PostgreSQL migrations covering the requested domain tables, indexes, constraints, helper functions, RLS, storage policies, audit triggers, and idempotent deadline processing.
- Edge Functions for proof verification, deadline processing, push-notification dispatch, RevenueCat webhooks, account-deletion requests, and retention-aware deletion processing.
- Separate responsive admin dashboard with server-checked admin RPCs for user search, reports, proof disputes, moderation actions, and operating metrics.
- Persisted offline proof-upload queue, duplicate-submission protections, and original capture timestamps for deadline-safe retries.

## Local setup

1. Install Node.js 22+, the Supabase CLI, Xcode/Android Studio, and EAS CLI.
2. Copy `.env.example` to `apps/mobile/.env` and add the public values.
3. Run `supabase start`, then `supabase db reset` from the repository root.
4. Start the app with `npm run mobile`.
5. Use an Expo development build for camera, Apple sign-in, notifications, and RevenueCat. Expo Go is not sufficient for all native modules.

## Production setup

1. Create a Supabase project and link it with `supabase link --project-ref <ref>`.
2. Apply migrations with `supabase db push`.
3. Create the private `proof-media` bucket if the storage migration did not create it in your environment.
4. Deploy the functions individually: `verify-proof`, `process-deadlines`, `dispatch-notifications`, `revenuecat-webhook`, `request-account-deletion`, and `process-account-deletions`.
5. Set function secrets from `.env.example` using `supabase secrets set`.
6. Configure Supabase Auth redirect URLs: `calledout://auth/callback` and the EAS development URLs.
7. Configure Apple and Google providers in Supabase Auth.
8. Configure the RevenueCat entitlement identifier as `pro`, offerings as `default`, and products as `calledout_monthly` and `calledout_annual`.
9. Configure schedulers for `process-deadlines`, `dispatch-notifications`, and `process-account-deletions` with authorization secrets and idempotent retry behavior.
10. Copy `apps/admin/.env.example` to `apps/admin/.env`, set the public Supabase values, and deploy the built admin site behind your chosen host.
11. Create EAS credentials and run `eas build --profile preview --platform ios` or Android.

See `docs/ARCHITECTURE.md`, `docs/SECURITY.md`, `docs/DEPLOYMENT.md`, and `docs/STORE_CHECKLISTS.md`.
