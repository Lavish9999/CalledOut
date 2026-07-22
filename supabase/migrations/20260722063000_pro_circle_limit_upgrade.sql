begin;

create or replace function public.apply_pro_circle_limits()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.identifier = 'pro'
    and new.status = 'active'
    and (new.expires_at is null or new.expires_at > now())
  then
    update public.circles
    set member_limit = greatest(member_limit, 20),
        updated_at = now()
    where owner_id = new.user_id
      and deleted_at is null
      and member_limit < 20;
  end if;

  return new;
end;
$$;

drop trigger if exists apply_pro_circle_limits on public.entitlements;
create trigger apply_pro_circle_limits
after insert or update of status, expires_at
on public.entitlements
for each row
execute function public.apply_pro_circle_limits();

update public.circles circle
set member_limit = 20,
    updated_at = now()
where circle.member_limit < 20
  and circle.deleted_at is null
  and exists (
    select 1
    from public.entitlements entitlement
    where entitlement.user_id = circle.owner_id
      and entitlement.identifier = 'pro'
      and entitlement.status = 'active'
      and (entitlement.expires_at is null or entitlement.expires_at > now())
  );

revoke all on function public.apply_pro_circle_limits() from public;

commit;
