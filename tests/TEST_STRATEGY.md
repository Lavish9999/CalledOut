# CalledOut test strategy

## Automated gates in this repository

- Mobile TypeScript strict compilation, Expo ESLint, and Vitest unit tests.
- Admin TypeScript compilation and production Vite build.
- pgTAP policy and deadline tests under `supabase/tests` for local Supabase CI.
- Maestro critical-flow definitions under `e2e/maestro` for physical/simulator builds.

## Required CI matrix

1. Mobile static checks on every pull request.
2. `supabase db reset` followed by `supabase test db` on every migration change.
3. iOS and Android development builds for Maestro critical flows.
4. RevenueCat sandbox tests for purchase, annual trial, cancellation, expiry, restore, account transfer, and offline entitlement cache.
5. Physical-device camera/location/push tests before each store release.
6. Security regression tests for anonymous, self, circle member, moderator, owner, blocked user, removed member, and admin identities.

## Release-blocking scenarios

Authentication/session persistence; onboarding and first schedule; proof captured before deadline but uploaded after temporary disconnection; automatic verification and circle review; missed status and Wall ranking; redemption; grace pass; circle member limit; subscription entitlement and restore; blocking/reporting; admin moderation; export/deletion request; daylight-saving transitions; duplicate jobs; and idempotent webhook processing.
