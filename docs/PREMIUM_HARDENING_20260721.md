# CalledOut Pro hardening — 2026-07-21

## What changed

- Added authenticated RevenueCat-to-Supabase reconciliation through the new `sync-revenuecat-entitlement` Edge Function.
- Reconciles Pro on sign-in, app foreground, purchase, restore, and manual refresh.
- Keeps the RevenueCat webhook as the source for renewals, cancellations, billing issues, transfers, and expiration.
- Resolves RevenueCat webhook aliases to the real CalledOut UUID before changing access.
- Added plan metadata to `get_plan_overview`: product, store, sandbox state, management URL, and verification time.
- Added a dedicated Subscription & Plan screen with plan name, status, renewal/end date, limits, restore, sync, and management actions.
- Added a clear Pro status card to Profile.
- Improved the paywall pricing presentation, purchase confirmation flow, retry behavior, and customer-facing error copy.
- Added a working grace-pass action to active commitment cards.
- Added subscription display unit tests.

## Required deployment

Run from the repository root:

```powershell
npx supabase db push
```

Save the RevenueCat App Store public SDK key (`appl_...`) as a Supabase function secret. The RevenueCat v1 customer-status endpoint supports the public platform API key; it remains server-side here so the app never supplies its own entitlement state.

```powershell
npx supabase secrets set "REVENUECAT_REST_API_KEY=appl_YOUR_KEY"
```

Deploy both subscription functions:

```powershell
npx supabase functions deploy revenuecat-webhook --no-verify-jwt
npx supabase functions deploy sync-revenuecat-entitlement --no-verify-jwt
```

Then publish the mobile update from `apps/mobile`:

```powershell
npx eas-cli update --channel preview --message "Harden Pro sync, plan status, and grace passes" --environment preview
```

## QA checklist

1. Launch the app while signed in and open Profile. Existing Pro users should show their plan without manual SQL.
2. Purchase monthly and annual separately with sandbox testers.
3. Confirm the paywall dismisses only after Supabase reports Pro active.
4. Reinstall, sign in, and use Restore purchases.
5. Cancel a sandbox subscription and confirm access remains until expiration.
6. Let the sandbox subscription expire and confirm Pro limits return.
7. Verify the Subscription & Plan screen shows annual/monthly, renewal/end date, and sandbox status.
8. Use a grace pass to extend a commitment and then use another to excuse one.
9. Test app foregrounding after changing the subscription in the App Store sandbox.
10. Confirm RevenueCat webhook deliveries return HTTP 200.
