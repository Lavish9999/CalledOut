begin;


create or replace function public.get_circle_open_callouts(p_circle uuid)
returns integer
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  if auth.uid() is null then
    raise exception 'authentication required';
  end if;

  if not public.is_circle_member(p_circle) then
    raise exception 'You are not a member of this circle';
  end if;

  select count(*)::integer
  into v_count
  from public.missed_commitments m
  join public.redemptions r
    on r.missed_commitment_id = m.id
  where m.circle_id = p_circle
    and m.deleted_at is null
    and r.deleted_at is null
    and r.status in ('available', 'in_progress');

  return coalesce(v_count, 0);
end;
$$;

create or replace function public.create_circle_v2(
  p_name text,
  p_description text default null,
  p_icon text default '◉',
  p_rules text default null
)
returns uuid
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_id uuid := gen_random_uuid();
  v_code text;
  v_count integer;
  v_is_pro boolean;
  v_limit integer;
  v_member_limit integer;
begin
  if auth.uid() is null then
    raise exception 'authentication required';
  end if;

  if char_length(trim(coalesce(p_name, ''))) not between 2 and 60 then
    raise exception 'Circle names must be between 2 and 60 characters';
  end if;

  if char_length(coalesce(p_description, '')) > 300 then
    raise exception 'Circle descriptions must be 300 characters or fewer';
  end if;

  if char_length(coalesce(p_rules, '')) > 1000 then
    raise exception 'Circle rules must be 1000 characters or fewer';
  end if;

  if char_length(trim(coalesce(p_icon, ''))) not between 1 and 8 then
    raise exception 'Choose a valid circle icon';
  end if;

  v_is_pro := public.has_active_pro();
  v_limit := case when v_is_pro then 5 else 1 end;
  v_member_limit := case when v_is_pro then 20 else 8 end;

  select count(*)::integer
  into v_count
  from public.circle_members
  where user_id = auth.uid()
    and status = 'active'
    and deleted_at is null;

  if v_count >= v_limit then
    if v_is_pro then
      raise exception 'CalledOut Pro supports up to 5 active circles';
    end if;
    raise exception 'CalledOut Pro is required to create another circle';
  end if;

  insert into public.circles(
    id,
    name,
    description,
    icon,
    rules,
    owner_id,
    member_limit
  )
  values(
    v_id,
    trim(p_name),
    nullif(trim(p_description), ''),
    trim(p_icon),
    nullif(trim(p_rules), ''),
    auth.uid(),
    v_member_limit
  );

  insert into public.circle_members(circle_id, user_id, role, status)
  values(v_id, auth.uid(), 'owner', 'active');

  loop
    v_code := upper(substr(encode(gen_random_bytes(8), 'hex'), 1, 8));
    exit when not exists(
      select 1 from public.circle_invites where code = v_code
    );
  end loop;

  insert into public.circle_invites(circle_id, code, created_by, expires_at)
  values(v_id, v_code, auth.uid(), now() + interval '30 days');

  insert into public.activity_events(actor_id, circle_id, event_type, payload)
  values(
    auth.uid(),
    v_id,
    'member_joined',
    jsonb_build_object('role', 'owner')
  );

  return v_id;
end;
$$;

create or replace function public.update_circle_details(
  p_circle uuid,
  p_name text,
  p_description text default null,
  p_icon text default '◉',
  p_rules text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'authentication required';
  end if;

  if not public.is_circle_moderator(p_circle) then
    raise exception 'Only circle owners and moderators can edit this circle';
  end if;

  if char_length(trim(coalesce(p_name, ''))) not between 2 and 60 then
    raise exception 'Circle names must be between 2 and 60 characters';
  end if;

  if char_length(coalesce(p_description, '')) > 300 then
    raise exception 'Circle descriptions must be 300 characters or fewer';
  end if;

  if char_length(coalesce(p_rules, '')) > 1000 then
    raise exception 'Circle rules must be 1000 characters or fewer';
  end if;

  if char_length(trim(coalesce(p_icon, ''))) not between 1 and 8 then
    raise exception 'Choose a valid circle icon';
  end if;

  update public.circles
  set
    name = trim(p_name),
    description = nullif(trim(p_description), ''),
    icon = trim(p_icon),
    rules = nullif(trim(p_rules), '')
  where id = p_circle
    and deleted_at is null;

  if not found then
    raise exception 'Circle not found';
  end if;
end;
$$;

create or replace function public.rotate_circle_invite(p_circle uuid)
returns text
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_code text;
begin
  if auth.uid() is null then
    raise exception 'authentication required';
  end if;

  if not public.is_circle_moderator(p_circle) then
    raise exception 'Only circle owners and moderators can refresh invites';
  end if;

  update public.circle_invites
  set revoked_at = now()
  where circle_id = p_circle
    and revoked_at is null;

  loop
    v_code := upper(substr(encode(gen_random_bytes(8), 'hex'), 1, 8));
    exit when not exists(
      select 1 from public.circle_invites where code = v_code
    );
  end loop;

  insert into public.circle_invites(
    circle_id,
    code,
    created_by,
    expires_at
  )
  values(
    p_circle,
    v_code,
    auth.uid(),
    now() + interval '30 days'
  );

  return v_code;
end;
$$;

create or replace function public.leave_circle(p_circle uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role public.circle_role;
begin
  if auth.uid() is null then
    raise exception 'authentication required';
  end if;

  select role
  into v_role
  from public.circle_members
  where circle_id = p_circle
    and user_id = auth.uid()
    and status = 'active'
    and deleted_at is null
  for update;

  if not found then
    raise exception 'You are not an active member of this circle';
  end if;

  if v_role = 'owner' then
    raise exception 'The owner must delete the circle or transfer ownership before leaving';
  end if;

  update public.commitment_schedules
  set circle_id = null
  where user_id = auth.uid()
    and circle_id = p_circle
    and deleted_at is null;

  update public.commitments
  set
    circle_id = null,
    visibility = 'only_me'
  where user_id = auth.uid()
    and circle_id = p_circle
    and status = 'upcoming'
    and proof_window_starts_at > now()
    and deleted_at is null;

  update public.circle_members
  set
    status = 'left',
    deleted_at = now()
  where circle_id = p_circle
    and user_id = auth.uid()
    and deleted_at is null;
end;
$$;

create or replace function public.remove_circle_member(
  p_circle uuid,
  p_user uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_role public.circle_role;
  v_target_role public.circle_role;
begin
  if auth.uid() is null then
    raise exception 'authentication required';
  end if;

  if p_user = auth.uid() then
    raise exception 'Use Leave circle to remove yourself';
  end if;

  select role
  into v_actor_role
  from public.circle_members
  where circle_id = p_circle
    and user_id = auth.uid()
    and status = 'active'
    and deleted_at is null;

  if v_actor_role is null or v_actor_role not in ('owner', 'moderator') then
    raise exception 'Only circle owners and moderators can remove members';
  end if;

  select role
  into v_target_role
  from public.circle_members
  where circle_id = p_circle
    and user_id = p_user
    and status = 'active'
    and deleted_at is null
  for update;

  if not found then
    raise exception 'Member not found';
  end if;

  if v_target_role = 'owner' then
    raise exception 'The circle owner cannot be removed';
  end if;

  if v_target_role = 'moderator' and v_actor_role <> 'owner' then
    raise exception 'Only the owner can remove a moderator';
  end if;

  update public.commitment_schedules
  set circle_id = null
  where user_id = p_user
    and circle_id = p_circle
    and deleted_at is null;

  update public.commitments
  set
    circle_id = null,
    visibility = 'only_me'
  where user_id = p_user
    and circle_id = p_circle
    and status = 'upcoming'
    and proof_window_starts_at > now()
    and deleted_at is null;

  update public.circle_members
  set
    status = 'removed',
    deleted_at = now()
  where circle_id = p_circle
    and user_id = p_user
    and deleted_at is null;
end;
$$;

create or replace function public.set_circle_member_role(
  p_circle uuid,
  p_user uuid,
  p_role public.circle_role
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_role public.circle_role;
  v_target_role public.circle_role;
begin
  if auth.uid() is null then
    raise exception 'authentication required';
  end if;

  select role
  into v_actor_role
  from public.circle_members
  where circle_id = p_circle
    and user_id = auth.uid()
    and status = 'active'
    and deleted_at is null;

  if v_actor_role is distinct from 'owner' then
    raise exception 'Only the circle owner can change moderator roles';
  end if;

  if p_role is null or p_role not in ('member', 'moderator') then
    raise exception 'A member can only be assigned member or moderator';
  end if;

  select role
  into v_target_role
  from public.circle_members
  where circle_id = p_circle
    and user_id = p_user
    and status = 'active'
    and deleted_at is null
  for update;

  if not found then
    raise exception 'Member not found';
  end if;

  if v_target_role = 'owner' then
    raise exception 'The owner role cannot be changed here';
  end if;

  update public.circle_members
  set role = p_role
  where circle_id = p_circle
    and user_id = p_user
    and status = 'active'
    and deleted_at is null;
end;
$$;

create or replace function public.delete_circle(p_circle uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'authentication required';
  end if;

  if not exists(
    select 1
    from public.circles
    where id = p_circle
      and owner_id = auth.uid()
      and deleted_at is null
  ) then
    raise exception 'Only the circle owner can delete this circle';
  end if;

  update public.commitment_schedules
  set circle_id = null
  where circle_id = p_circle
    and deleted_at is null;

  update public.commitments
  set
    circle_id = null,
    visibility = 'only_me'
  where circle_id = p_circle
    and status = 'upcoming'
    and proof_window_starts_at > now()
    and deleted_at is null;

  update public.circle_invites
  set revoked_at = coalesce(revoked_at, now())
  where circle_id = p_circle;

  update public.circle_members
  set
    status = 'removed',
    deleted_at = coalesce(deleted_at, now())
  where circle_id = p_circle;

  update public.circles
  set deleted_at = now()
  where id = p_circle;
end;
$$;

grant execute on function public.get_circle_open_callouts(uuid) to authenticated;
grant execute on function public.create_circle_v2(text, text, text, text) to authenticated;
grant execute on function public.update_circle_details(uuid, text, text, text, text) to authenticated;
grant execute on function public.rotate_circle_invite(uuid) to authenticated;
grant execute on function public.leave_circle(uuid) to authenticated;
grant execute on function public.remove_circle_member(uuid, uuid) to authenticated;
grant execute on function public.set_circle_member_role(uuid, uuid, public.circle_role) to authenticated;
grant execute on function public.delete_circle(uuid) to authenticated;

commit;
