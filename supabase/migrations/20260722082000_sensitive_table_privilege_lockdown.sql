begin;

-- These tables are service-owned implementation details. User-facing account
-- deletion and notification flows go through audited Edge Functions and RPCs,
-- never direct PostgREST table access.
revoke select, insert, update, delete
on table public.notification_outbox
from authenticated;

revoke select, insert, update, delete
on table public.account_deletion_requests
from authenticated;

revoke select, insert, update, delete
on table public.apple_revocation_tokens
from authenticated;

commit;
