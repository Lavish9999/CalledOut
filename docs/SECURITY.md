# Security and privacy

- All user-facing tables are protected by Row Level Security. Service-role access is limited to server functions and must never be bundled in the app.
- The mobile app receives only the Supabase publishable key.
- Native authentication sessions use a chunked Expo SecureStore adapter; web sessions use AsyncStorage. OAuth uses PKCE and the CalledOut URL scheme.
- Proof media is private. Object paths are scoped to the submitting user, and user-facing reads use membership-aware signed access.
- Durable offline retries copy pending proof into application document storage before queuing, retain the original capture time, and remove the local copy only after confirmed completion.
- Social surfaces expose a location verification result, not raw coordinates. Production launch must confirm retention behavior and privacy disclosures for any dispute workflow.
- Deadlines, future occurrence generation, miss creation, redemption completion, statistics, plan limits, and privileged moderation are server-authoritative.
- RevenueCat remains the purchase authority. PostgreSQL mirrors entitlement state for server authorization and retains paid access through the reported expiration timestamp after cancellation.
- Admin authorization is checked in PostgreSQL RPCs and policies; hidden frontend routes are never treated as a security boundary.
- Reports, blocks, circle leave controls, community rules, and account-deletion requests are exposed in the app. Reports still require a documented moderation SLA and staffed operational process.
- Audit records are append-only to normal users. Sensitive scheduler functions use three distinct secrets.
- Add gateway/function rate limits for invitation joins, proof creation, verification retries, reactions, reports, password resets, and account-deletion requests before public launch.
- Before release, run database linting, authenticated RLS tests, dependency/secret scans, abuse testing, penetration testing, and backup/restore exercises.
