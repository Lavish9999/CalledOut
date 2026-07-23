# Store submission checklists

## Apple App Store

- Bundle ID, Sign in with Apple capability, push entitlement, camera/location usage strings, associated domains, privacy manifest, and export-compliance answers confirmed.
- In-app account deletion request works and the public deletion/support pages are live.
- Restore Purchases and Manage Subscription are visible and tested with sandbox accounts.
- Pricing, billing period, any trial, renewal, and cancellation language exactly match the configured App Store products. Do not advertise a trial unless it is active in App Store Connect and RevenueCat.
- App Privacy answers disclose user content, coarse location verification, identifiers, purchases, diagnostics, and moderation data accurately.
- Report, block, leave-circle, community-guideline, support, and moderation processes are usable from the submitted build.
- Reviewer account, seeded private circle, a reviewable proof case, and App Review instructions are supplied.
- Age rating and UGC/social questionnaire answers are reviewed against the final content and moderation model.
- Physical iPhone testing covers camera, denied permissions, offline retry, notifications, OAuth callbacks, purchases, restore, cancellation-through-expiry, and account deletion.

## Google Play

- Package name, Data Safety form, notification permission flow, account-deletion URL, content rating, and UGC policy are complete.
- Do not declare Health Connect use until the integration is implemented and included in the build.
- Billing products/base plans are active in the correct testing track.
- Closed-test purchase, restore, cancellation, billing issue, grace period, expiry, resubscribe, and account-switch scenarios pass.
- Physical Android testing covers camera variations, process death during upload, offline queue recovery, denied permissions, deep links, and push channels.
- Background work and exact-alarm declarations match actual implementation.
