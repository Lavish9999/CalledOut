# Technical architecture

## Boundaries

- **Mobile client:** presentation, permission prompts, secure session storage, optimistic interaction state, offline upload queue, and server API calls.
- **PostgreSQL:** canonical commitments, membership, visibility, deadlines, Wall records, redemption state, entitlements, moderation state, and audit history.
- **Edge Functions:** privileged media verification, deadline processing, RevenueCat webhook reconciliation, notifications, and deletion orchestration.
- **Storage:** private proof media. Clients upload only to a user-owned pending path and read assets only through membership-aware signed URLs.
- **RevenueCat:** store transaction validation and entitlement delivery. PostgreSQL mirrors entitlement state for server authorization but never replaces RevenueCat as purchase authority.

## Core invariants

1. Deadlines are decided by server timestamps, not device clocks.
2. A commitment cannot be edited or deleted after `proof_window_starts_at` unless a server-approved grace pass is consumed.
3. Raw coordinates are not exposed socially. A short-lived location sample becomes `within_approved_location`, `outside_approved_location`, or `unavailable`.
4. Private-circle access requires an active `circle_members` row.
5. Blocked users cannot read each other's activity through RLS helper checks.
6. Proof status transitions are append-audited and idempotent.
7. Subscription expiry never blocks proof submission.

## Mobile folders

- `src/app`: Expo Router routes.
- `src/components`: reusable accessible UI.
- `src/features`: domain queries, mutations, validation, and view models.
- `src/lib`: service adapters for Supabase, analytics, notifications, purchases, media, and environment config.
- `src/providers`: session, query, app lifecycle, and connectivity providers.
- `src/state`: lightweight client-only Zustand state.
- `src/types`: database and domain types.

## Data flow

TanStack Query owns remote state. Mutations invalidate narrowly scoped keys. Zustand owns only ephemeral onboarding and pending-capture state. Supabase Realtime invalidates circle activity, proof review, and Wall queries; it does not bypass RLS.

## Verification score

The `verify-proof` function assigns: fresh app capture 25, prompt 20, valid window 15, location 15, health/wearable 15, integrity/duplicate checks 10. Scores at least 70 verify automatically, 45–69 enter circle review, and lower scores require more proof or are rejected. The initial implementation uses deterministic signals and a pluggable moderation adapter; it never presents automated verification as infallible.
