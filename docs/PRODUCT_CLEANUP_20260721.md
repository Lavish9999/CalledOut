# CalledOut product cleanup — July 2026

## What changed

- Uses the native iOS System font, which resolves to San Francisco / SF Pro on iPhone.
- Removed the redundant Post tab. Proof capture now starts from the relevant commitment.
- Simplified Today into On the clock, Needs attention, and a collapsible Completed today section.
- Grouped a miss and its redemption into one journey instead of showing duplicate cards.
- Added accurate completion, miss, redemption, current-streak, and longest-streak calculations.
- Redemption workouts no longer inflate completion statistics.
- Added Redeeming, Redeemed, Available, and Expired context to The Wall.
- Added Wall member-history screens.
- Added circle details with members, invite sharing, and recent activity.
- Added workout history.
- Replaced misleading Settings copy with working privacy toggles.
- Removed duplicated native permission and background-mode entries from app.json.

## Deploy

From the project root:

```powershell
npm install
npx supabase db push
npm run verify
cd .\apps\mobile
npx eas-cli update --channel preview --message "CalledOut product cleanup and accurate records" --environment preview
```

Close and reopen the preview app twice after the update publishes.

The app.json permission cleanup will be included the next time a full native build is made, but the UI, navigation, record logic, and new screens are OTA-compatible.
