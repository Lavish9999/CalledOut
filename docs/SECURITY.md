# Security and privacy

- All user-facing tables have RLS enabled. Service-role access exists only inside server functions.
- The mobile client receives only the Supabase publishable key. Service-role keys and webhook secrets must never be bundled.
- Proof media is private, metadata is minimized, and object paths are scoped to the authenticated user.
- The app uploads approximate verification context, not exact location history. Edge Functions discard coordinates after producing a location result unless an active dispute requires temporary retention.
- Authentication sessions persist in Secure Store. OAuth uses PKCE and a custom URL scheme.
- Admin authorization is validated from `profiles.is_admin` in server functions and database policies; frontend route hiding is never the security boundary.
- Audit rows are append-only to normal users.
- Rate-limit public invitation joins, proof creation, reactions, reports, and password-reset requests at the gateway/function layer.
- Before launch, run Supabase database linting, policy tests, dependency scanning, secret scanning, and a third-party penetration test.
