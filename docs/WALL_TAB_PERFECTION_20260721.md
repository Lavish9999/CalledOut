# Wall Tab Perfection — 2026-07-21

The Wall is the consequence layer of CalledOut. This pass makes that concept visible immediately while keeping the experience private, safe, and actionable.

## Product language

- Miss a day. Get called out.
- Misses stay on the record.
- Redemption proves the response; it never erases the original miss.

## Main Wall

- Added a concise consequence explainer.
- Added private-circle filtering when the user belongs to multiple circles.
- Rebuilt ranking cards with rank, initials, circle context, misses, redemptions, completion rate, latest status, and a clear drill-in affordance.
- Improved empty, loading, error, and preview states.
- Added an explicit privacy reminder.

## Member record

- Added a record summary with missed, redeemed, and open-redemption counts.
- Compressed oversized history cards while improving hierarchy.
- Added distinct state semantics: redeemed is green, redeeming is amber, available is black, and missed/expired is red.
- Added minimum workout duration and plain-language redemption timing.
- Added a Start redemption action when a user views their own eligible miss.
- Added safe preset accountability reactions for other circle members: We saw that, No excuses, and Redeem it.
- Reactions are disabled on redeemed and expired records to avoid dogpiling old history.

## Safety

- Wall records remain circle-private.
- No free-form public comments were added.
- Preview mode never writes real reactions or account data.
