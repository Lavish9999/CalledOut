begin;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_timezone text := coalesce(new.raw_user_meta_data ->> 'timezone', 'UTC');
  v_username text := 'user_' || substr(md5(new.id::text), 1, 12);
begin
  insert into public.profiles(id, username, display_name, timezone)
  values(
    new.id,
    v_username,
    coalesce(new.raw_user_meta_data ->> 'display_name', 'New member'),
    v_timezone
  )
  on conflict(id) do nothing;

  insert into public.user_settings(user_id)
  values(new.id)
  on conflict do nothing;

  insert into public.notification_preferences(user_id, timezone)
  values(new.id, v_timezone)
  on conflict(user_id) do update
    set timezone = excluded.timezone,
        updated_at = now();

  return new;
end;
$$;

revoke all on function public.handle_new_user() from public, anon, authenticated;

commit;
