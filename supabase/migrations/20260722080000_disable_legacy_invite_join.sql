begin;

revoke all on function public.join_circle_by_code(text)
from public, anon, authenticated;

-- The mobile app uses join_circle_by_code_v2, which records failed attempts
-- without rolling them back and enforces the 15-minute throttle.
grant execute on function public.join_circle_by_code_v2(text)
to authenticated;

commit;
