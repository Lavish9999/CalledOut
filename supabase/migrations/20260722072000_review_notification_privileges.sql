begin;

revoke all on function public.queue_user_notification(uuid, text, text, text, jsonb, text, timestamptz)
from public, anon, authenticated;

grant execute on function public.queue_user_notification(uuid, text, text, text, jsonb, text, timestamptz)
to service_role;

commit;
