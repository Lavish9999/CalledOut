# CalledOut Wall refresh

## Goals
- Remove the AI-looking side color rails from Wall history cards.
- Keep status color contained to the status pill only.
- Add a friendly-competition leaderboard to The Wall tab.
- Preserve preview-data support.

## UX changes
- Added a segmented control on The Wall tab: `The Wall` / `Leaderboard`.
- Added summary metrics at the top of the Wall screen.
- Leaderboard ranks members by completion rate, then fewer misses, then more redeemed misses.
- Wall member history now has clean neutral cards and status filters: All / Open / Redeemed / Missed.
- The original punitive core message remains intact: misses stay visible; redemption never erases the miss.
