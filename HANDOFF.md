# CalledOut Engineering Handoff

## Delivery status

This repository is a functioning production-oriented foundation, not a visual mockup. It includes the mobile client, admin client, normalized database, Row Level Security, private proof storage, server jobs, Edge Functions, authentication, onboarding, core commitment/circle/Wall/proof/redemption flows, offline proof retry, subscription abstractions, analytics/error adapters, tests, and release documentation.

A real production release still requires project-specific credentials, cloud deployment, App Store/Google Play product configuration, policy URLs, and physical-device acceptance testing.

## Verified in this environment

- Mobile TypeScript: passed
- Admin TypeScript: passed
- Expo lint: passed
- Unit tests: 4 files / 10 tests passed
- Admin production build: passed
- Expo public config: resolved as CalledOut 0.1.0 with `com.calledout.app` on iOS and Android
- Production dependency audit: 0 critical, 0 high, 11 moderate advisories in the Expo dependency chain
- Secret-file scan: no `.env`, signing key, provisioning profile, or platform service credential included

Run the same checks with:

```bash
npm install
npm run verify
```

## Required before store submission

1. Create and link the Supabase production project.
2. Apply migrations to a clean staging database and run the pgTAP/RLS tests against actual authenticated roles.
3. Deploy all Edge Functions and configure their secrets.
4. Configure Apple, Google, RevenueCat, Expo/EAS, push credentials, PostHog, and Sentry endpoints.
5. Create the RevenueCat products and store subscriptions.
6. Replace placeholder legal/support URLs and publish privacy, terms, community guidelines, and account-deletion information.
7. Run the Maestro flows and manual tests on physical iOS and Android devices.
8. Test camera capture, background/offline upload, notifications, OAuth callbacks, purchase/restore, DST boundaries, moderation, and account deletion end to end.
9. Review the 11 moderate Expo-chain advisories against current upstream releases before shipment; do not force an incompatible dependency downgrade.

## Deliberately scaffolded for a later integration pass

The schema and provider boundaries are present, but the following require external services or additional product work before claiming the entire original specification is complete:

- Apple HealthKit, Google Health Connect, and wearable-provider ingestion
- Production-grade media moderation and computer-vision/liveness providers
- Device-integrity/attestation providers and perceptual duplicate-media detection
- Complete comments/reactions/feed interfaces across every circle surface
- Full proof-dispute and appeal interfaces for members
- All advanced notification preference and quiet-hour controls
- Every custom recurrence/redemption/rule editor described in the product brief
- Public-circle discovery and its elevated moderation workflows
- Full accessibility audit with VoiceOver, TalkBack, Dynamic Type, and switch/keyboard testing
- Load, penetration, abuse, rate-limit, and disaster-recovery testing

These are not represented as fake success states. Core provider calls are isolated so production vendors can be added without rewriting the domain model.

## Mobile export note

The mobile project passed TypeScript, lint, unit tests, and Expo configuration resolution. A complete Expo web static export did not finish within this execution environment, so no claim is made that a release binary was produced here. EAS preview builds on configured Apple/Google accounts are the next binary gate.
