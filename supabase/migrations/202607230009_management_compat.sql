begin;

create or replace function public.update_circle(
  p_circle_id uuid,
  p_name text default null,
  p_description text default null,
  p_privacy public.circle_privacy default null,
  p_rules text default null,
  p_comments_enabled boolean default null
)
returns void
language plpgsql
security definer
set search_path=public
as $$
begin
  if not public.is_circle_moderator(p_circle_id) then
    raise exception 'not authorized';
  end if;

  update public.circles
  set name=coalesce(nullif(trim(p_name),''),name),
      description=case when p_description is null then description else nullif(trim(p_description),'') end,
      privacy=coalesce(p_privacy,privacy),
      rules=case when p_rules is null then rules else nullif(trim(p_rules),'') end,
      comments_enabled=coalesce(p_comments_enabled,comments_enabled),
      updated_at=now()
  where id=p_circle_id and deleted_at is null;

  if not found then raise exception 'circle not found'; end if;
end $$;

grant execute on function public.update_circle(uuid,text,text,public.circle_privacy,text,boolean) to authenticated;

create or replace function public.delete_circle(p_circle_id uuid)
returns void
language plpgsql
security definer
set search_path=public
as $$
begin
  if not exists(
    select 1 from public.circle_members
    where circle_id=p_circle_id and user_id=auth.uid() and role='owner'
      and status='active' and deleted_at is null
  ) then raise exception 'owner access required'; end if;

  update public.commitment_schedules
  set circle_id=null,updated_at=now()
  where circle_id=p_circle_id and deleted_at is null;

  update public.commitments
  set circle_id=null,visibility='only_me',updated_at=now()
  where circle_id=p_circle_id and deleted_at is null;

  update public.circle_invites
  set revoked_at=coalesce(revoked_at,now()),updated_at=now()
  where circle_id=p_circle_id and revoked_at is null;

  update public.circle_members
  set status='removed',deleted_at=now(),updated_at=now()
  where circle_id=p_circle_id and deleted_at is null;

  update public.circles set deleted_at=now(),updated_at=now()
  where id=p_circle_id and deleted_at is null;
end $$;

grant execute on function public.delete_circle(uuid) to authenticated;

create or replace function public.remove_circle_member(p_circle_id uuid,p_user_id uuid)
returns void
language plpgsql
security definer
set search_path=public
as $$
declare v_role public.circle_role;
begin
  if not public.is_circle_moderator(p_circle_id) then raise exception 'not authorized'; end if;
  select role into v_role from public.circle_members
  where circle_id=p_circle_id and user_id=p_user_id and status='active' and deleted_at is null;
  if not found then raise exception 'member not found'; end if;
  if v_role='owner' then raise exception 'transfer ownership before removing the owner'; end if;

  update public.circle_members
  set status='removed',deleted_at=now(),updated_at=now()
  where circle_id=p_circle_id and user_id=p_user_id and status='active' and deleted_at is null;
end $$;

grant execute on function public.remove_circle_member(uuid,uuid) to authenticated;

create or replace function public.set_circle_member_role(
  p_circle_id uuid,
  p_user_id uuid,
  p_role public.circle_role
)
returns void
language plpgsql
security definer
set search_path=public
as $$
begin
  if not exists(
    select 1 from public.circle_members
    where circle_id=p_circle_id and user_id=auth.uid() and role='owner'
      and status='active' and deleted_at is null
  ) then raise exception 'owner access required'; end if;

  if not exists(
    select 1 from public.circle_members
    where circle_id=p_circle_id and user_id=p_user_id and status='active' and deleted_at is null
  ) then raise exception 'member not found'; end if;

  if p_role='owner' then
    update public.circle_members set role='member',updated_at=now()
    where circle_id=p_circle_id and user_id=auth.uid();
    update public.circles set owner_id=p_user_id,updated_at=now() where id=p_circle_id;
  end if;

  update public.circle_members set role=p_role,updated_at=now()
  where circle_id=p_circle_id and user_id=p_user_id and status='active' and deleted_at is null;
end $$;

grant execute on function public.set_circle_member_role(uuid,uuid,public.circle_role) to authenticated;

create or replace function public.rotate_circle_invite(p_circle_id uuid)
returns text
language plpgsql
security definer
set search_path=public
as $$
declare v_code text;
begin
  if not public.is_circle_moderator(p_circle_id) then raise exception 'not authorized'; end if;

  update public.circle_invites
  set revoked_at=coalesce(revoked_at,now()),updated_at=now()
  where circle_id=p_circle_id and revoked_at is null;

  v_code:=upper(substr(encode(gen_random_bytes(8),'hex'),1,8));
  insert into public.circle_invites(circle_id,code,created_by,expires_at)
  values(p_circle_id,v_code,auth.uid(),now()+interval '30 days');
  return v_code;
end $$;

grant execute on function public.rotate_circle_invite(uuid) to authenticated;

commit;
