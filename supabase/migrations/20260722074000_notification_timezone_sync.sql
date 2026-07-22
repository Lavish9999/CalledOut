begin;

update public.notification_preferences preference
set timezone = profile.timezone,
    updated_at = now()
from public.profiles profile
where profile.id = preference.user_id
  and preference.timezone is distinct from profile.timezone;

create or replace function public.sync_notification_timezone()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.notification_preferences
  set timezone = new.timezone,
      updated_at = now()
  where user_id = new.id
    and timezone is distinct from new.timezone;

  return new;
end;
$$;

drop trigger if exists sync_notification_timezone on public.profiles;
create trigger sync_notification_timezone
after update of timezone on public.profiles
for each row
when (old.timezone is distinct from new.timezone)
execute function public.sync_notification_timezone();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_timezone text := coalesce(new.raw_user_meta_data ->> 'timezone', 'UTC');
begin
  insert into public.profiles(id, username, display_name, timezone)
  values(
    new.id,
    'user_' || substr(replace(new.id::text, '-', ''), 1, 10),
    coalesce(new.raw_user_meta_data ->> 'display_name', 'New member'),
    v_timezone
  )
  on conflict do nothing;

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

create or replace function public.notification_quiet_until(
  p_user uuid,
  p_desired timestamptz
)
returns timestamptz
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_start time;
  v_end time;
  v_timezone text;
  v_local timestamp;
  v_local_time time;
  v_quiet_end timestamp;
begin
  select
    coalesce(preference.quiet_hours_start, settings.quiet_hours_start),
    coalesce(preference.quiet_hours_end, settings.quiet_hours_end),
    coalesce(profile.timezone, 'UTC')
  into v_start, v_end, v_timezone
  from public.profiles profile
  left join public.notification_preferences preference
    on preference.user_id = profile.id
  left join public.user_settings settings
    on settings.user_id = profile.id
  where profile.id = p_user;

  if v_start is null or v_end is null or v_start = v_end then
    return p_desired;
  end if;

  v_local := p_desired at time zone v_timezone;
  v_local_time := v_local::time;

  if v_start < v_end then
    if v_local_time >= v_start and v_local_time < v_end then
      v_quiet_end := v_local::date + v_end;
      return v_quiet_end at time zone v_timezone;
    end if;
  else
    if v_local_time >= v_start then
      v_quiet_end := (v_local::date + 1) + v_end;
      return v_quiet_end at time zone v_timezone;
    elsif v_local_time < v_end then
      v_quiet_end := v_local::date + v_end;
      return v_quiet_end at time zone v_timezone;
    end if;
  end if;

  return p_desired;
end;
$$;

revoke all on function public.sync_notification_timezone() from public, anon, authenticated;
revoke all on function public.notification_quiet_until(uuid, timestamptz) from public, anon, authenticated;

commit;
