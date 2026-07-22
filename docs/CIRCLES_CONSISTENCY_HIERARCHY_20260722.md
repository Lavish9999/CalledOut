# Circles consistency and hierarchy pass

This patch tightens the Circles experience after live-device review.

## Data integrity

- The Circles dashboard and circle detail now calculate 30-day consistency from the same resolved commitment records.
- Redemption workout commitments are excluded from normal consistency calculations.
- The plan query is refreshed whenever the Circles tab receives focus.
- Exact duplicate one-time promises and recurring schedules are rejected server-side under an advisory transaction lock.

## Information hierarchy

- The large educational banner is shown only when the user has no circles.
- Existing circles become the primary content after the first circle is created.
- The circle agreement is a compact neutral notice rather than a large hero card.
- Member grammar is singular/plural aware.

## Competition

- A leaderboard requires at least two qualifying members.
- A member qualifies after three resolved promises in the last 30 days.
- Solo circles show a personal baseline and an invitation prompt rather than a misleading #1 rank.

## Upcoming promises and activity

- Upcoming promises explain how many are shown and can expand in place.
- Existing identical promises are grouped and labeled.
- Repeated same-day activity is grouped into one readable entry.

## Invite safety

- Invite codes are masked by default in Manage Circle.
- Owners and moderators can reveal, share, or revoke/refresh the code.
- Empty circle rules now show a useful explanation.
