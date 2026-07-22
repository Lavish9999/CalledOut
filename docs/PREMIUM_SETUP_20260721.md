# CalledOut Pro setup

## Launch plan

Free remains fully functional for the core accountability loop:

- 1 active recurring workout schedule
- 1 active circle with up to 8 members
- 1 monthly grace pass
- proof submission, verification, The Wall, redemption, records, and account access

CalledOut Pro unlocks:

- up to 5 active recurring workout schedules
- up to 5 active circles
- circles created while Pro is active support up to 20 members
- 2 monthly grace passes total
- custom 1, 2, 4, or 8 hour proof windows
- accountability insights

Existing proof, history, and account data remain available when Pro expires.

## Recommended launch pricing

- Monthly: `calledout_monthly` — $4.99/month
- Annual: `calledout_annual` — $29.99/year
- Annual introductory offer: 7-day free trial

The app reads localized prices and trial details directly from the store. Do not hardcode price text in the UI.

## App Store Connect

1. Create one auto-renewable subscription group named `CalledOut Pro`.
2. Create monthly product `calledout_monthly`.
3. Create annual product `calledout_annual`.
4. Add localized display names and descriptions.
5. Add a 7-day free trial to the annual product if desired.
6. Add the products to the app version/submission and complete subscription review metadata.
7. Confirm Paid Apps agreement, tax, and banking are active.

## RevenueCat

1. Add the iOS app using bundle ID `com.calledout.app`.
2. Import `calledout_monthly` and `calledout_annual`.
3. Create entitlement identifier `pro`.
4. Attach both products to `pro`.
5. Create offering identifier `default` and make it the current offering.
6. Add the monthly product to the `$rc_monthly` package.
7. Add the annual product to the `$rc_annual` package.
8. Copy the public iOS SDK key (`appl_...`) into the EAS preview and production environments as `EXPO_PUBLIC_REVENUECAT_IOS_API_KEY`.
9. Create a webhook pointing to `/functions/v1/revenuecat-webhook` with an Authorization header matching `REVENUECAT_WEBHOOK_AUTH`.
10. Set RevenueCat restore/transfer behavior deliberately and test account switching.

## Required Supabase secret

Set a high-entropy webhook secret:

```powershell
npx supabase secrets set "REVENUECAT_WEBHOOK_AUTH=REPLACE_WITH_RANDOM_SECRET"
```

Use the same value as the RevenueCat webhook Authorization bearer token.

## Test matrix

- monthly purchase
- annual purchase
- annual free-trial eligibility and displayed disclosure
- user cancels purchase sheet
- restore on same CalledOut account
- restore after reinstall
- purchase attached to a different CalledOut account
- cancellation while access remains active through expiration
- billing issue
- expiration
- renewal
- webhook retry/idempotency
- Free limit gates for second schedule and second circle
- Pro custom proof windows
- Pro insights
- downgrade: proof, history, and existing records remain available
