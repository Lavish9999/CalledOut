# Today Recurrence and Consequence Polish — July 21, 2026

## Product decisions

- A promise can be **one time** or **weekly**.
- Weekly schedules support any combination of weekdays.
- Multiple weekdays within one weekly pattern count as one recurring schedule.
- One-time promises do not consume a recurring schedule slot.
- The creation flow consistently says a weekly pattern continues until the user **ends** it.
- The final promise summary remains serious without stacking two large black surfaces.
- Grace passes are presented as a secondary exception, not an escape-focused primary action.
- Ending a schedule is visually destructive and requires confirmation.

## Backend safeguards

- `create_recurring_commitment_v3` validates title and weekday selection before delegating to the established schedule creation flow.
- `create_one_time_commitment_v1` validates authentication, membership, proof-window entitlement, date range, and future deadline server-side.
- One-time promises use `schedule_id = null`, so they do not affect recurring schedule limits.

## Verification

- TypeScript passed.
- ESLint passed.
- 16 unit tests passed.
- Admin production build passed.
