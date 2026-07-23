# CalledOut engineering handoff

## Delivery status

This package is a **V1 release candidate in source**, covering the three requested phases:

1. Core-loop reliability and lifecycle controls.
2. The Wall, circles, invitations, redemption, member records, proof review, and safety surfaces.
3. Pro packaging, insights, notification controls, analytics events, moderation operations, tests, and release documentation.

It is not represented as deployed or store-approved. Production credentials, migration deployment, external provider configuration, native binaries, physical-device acceptance testing, and store review remain outside this source-only environment.

## What was verified while packaging

- Every TypeScript and TSX source file was parsed with the installed TypeScript compiler: no syntax errors.
- The final SQL migration has balanced dollar-quoted bodies and a single transaction boundary.
- The archive was scanned for committed `.env` files and common private-key/signing artifacts.
- Route, migration, Edge Function, Maestro, and documentation files were included in the final package.

## What could not be fully verified here

The dependency installation did not complete in this execution environment because its package registry returned unavailable responses during install. Consequently, the following commands must be treated as staging gates rather than completed claims:

```bash
npm install
npm run verify
supabase db reset
supabase test db
```

No Supabase project, Apple/Google developer account, EAS project, RevenueCat project, push credentials, PostHog project, or Sentry project was available here. No release binary was produced and no migration was applied to a live database.

## Required deployment sequence

1. Create a staging branch/database backup point.
2. Apply `supabase/migrations/202607230008_complete_v1.sql` through the normal migration chain.
3. Run the pgTAP/RLS suite against real anonymous, member, moderator, owner, blocked, and admin identities.
4. Deploy all Edge Functions and set the three distinct scheduler secrets.
5. Configure Apple/Google authentication, RevenueCat products/entitlement/webhook, EAS credentials, push notifications, analytics, and error reporting.
6. Run `npm run verify`, Maestro flows, sandbox purchase lifecycle tests, and physical-device proof/offline/location tests.
7. Publish legally reviewed privacy, terms, community rules, support, and deletion URLs.
8. Complete the store checklists and submit a reviewer account plus seeded private circle.

## Honest scope boundary

The requested three phases are implemented, but several larger original-spec expansion areas remain future integrations rather than launch blockers for this accountability V1:

- Apple HealthKit, Google Health Connect, and wearable ingestion.
- Production computer-vision pose/liveness, device attestation, perceptual duplicate detection, and external media moderation vendors.
- Public-circle discovery and public-feed moderation.
- Advanced workout logging, routes, exercise programming, or Strava/Hevy replacement features.
- Formal accessibility certification, penetration/load testing, and disaster-recovery exercises.

The current proof language intentionally describes fresh in-app proof and randomized prompts rather than claiming infallible AI anti-cheat verification.
