# CalledOut

**Miss a day. Get called out.**

CalledOut is a consequence-first fitness accountability application built with Expo/React Native, TypeScript, Supabase, and RevenueCat. Users make time-bound workout promises, submit fresh proof, face a private-circle Wall after a miss, and complete visible redemption work without erasing the original record.

## V1 release-candidate scope

### Core accountability

- Email/password, Apple, and Google authentication adapters; password reset; secure native session persistence; in-app account deletion request.
- Guarded onboarding that creates a profile and first recurring commitment without duplicating schedules on retry.
- Five-step promise builder for one-time or weekly commitments, exact AM/PM deadlines, proof windows, circle visibility, proof method, consequence, and redemption window.
- Rolling 60-day occurrence generation, pause/resume/delete controls, server-authoritative deadlines, idempotent deadline processing, and accurate profile statistics.
- Today screen centered on the most urgent promise, Post flow, fresh in-app proof, randomized prompt, optional coarse location result, durable offline retry, signed proof result, appeals, and circle review.
- Redemption pipeline that resolves the original miss, updates The Wall, preserves the historical miss, and prevents recursive misses from redemption children.

### Social accountability

- Private circles, invite codes, shareable deep links, member lists, activity, circle-specific Wall access, leaderboards, leave/report/block controls, and moderator proof review.
- The Wall with week/month/all-time periods, circle filters, rank movement context, reactions, redemption state, member records, and direct redemption entry.
- Member accountability profiles and visible report/block actions.

### Pro and operations

- RevenueCat identity login/logout, purchase, restore, cancellation-through-paid-expiry handling, and server-mirrored entitlement checks.
- Free-versus-Pro schedule, circle, history, proof, consequence, and analytics boundaries; Pro accountability insights screen.
- Notification preferences and quiet hours, urgent deadline behavior, deduplicated dispatch, PostHog/Sentry adapters, UGC safety routes, and an admin moderation dashboard.
- PostgreSQL migrations, RLS, private proof storage, audit logs, Edge Functions, pgTAP definitions, Vitest unit tests, and Maestro critical-flow definitions.

## Local setup

1. Install Node.js 22+, npm, Supabase CLI, Xcode/Android Studio, and EAS CLI.
2. Run `npm install` from the repository root.
3. Copy `.env.example` to `apps/mobile/.env` and enter the public client values.
4. Run `supabase start`, then `supabase db reset`.
5. Run `npm run mobile`.
6. Use an Expo development build for camera, Apple sign-in, notifications, SecureStore, and RevenueCat. Expo Go is not sufficient for every native module.

## Verification commands

```bash
npm run verify
supabase db reset
supabase test db
```

The archive was structurally checked and all TypeScript/TSX files were syntax-parsed before packaging. A complete dependency install, native build, database reset, and credentialed end-to-end run still need to occur in your configured staging environment; see `IMPLEMENTATION_REPORT.md` and `HANDOFF.md`.

## Production setup

Follow `docs/DEPLOYMENT.md`, then complete `docs/STORE_CHECKLISTS.md`. The remaining gates are infrastructure and acceptance work: apply the migration to staging, deploy functions, set credentials, configure stores/providers, run sandbox billing, run RLS tests, and test physical iOS/Android builds.
