begin;

alter table public.subscriptions
  add column if not exists is_sandbox boolean,
  add column if not exists management_url text,
  add column if not exists last_verified_at timestamptz;

create index if not exists subscriptions_user_product_idx
  on public.subscriptions(user_id, product_id, current_period_ends_at desc)
  where deleted_at is null;

create or replace function public.get_plan_overview()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_is_pro boolean;
  v_circle_count integer;
  v_schedule_count integer;
  v_grace_remaining integer;
  v_subscription public.subscriptions%rowtype;
begin
  if v_user is null then
    raise exception 'authentication required';
  end if;

  v_is_pro := public.has_active_pro(v_user);

  select count(*)::integer
  into v_circle_count
  from public.circle_members
  where user_id = v_user
    and status = 'active'
    and deleted_at is null;

  select count(*)::integer
  into v_schedule_count
  from public.commitment_schedules
  where user_id = v_user
    and is_active
    and deleted_at is null;

  select count(*)::integer
  into v_grace_remaining
  from public.grace_passes
  where user_id = v_user
    and used_at is null
    and expires_at > now();

  select *
  into v_subscription
  from public.subscriptions
  where user_id = v_user
    and deleted_at is null
  order by
    case when current_period_ends_at > now() then 0 else 1 end,
    current_period_ends_at desc nulls last,
    updated_at desc
  limit 1;

  return jsonb_build_object(
    'is_pro', v_is_pro,
    'active_circle_count', v_circle_count,
    'active_schedule_count', v_schedule_count,
    'grace_passes_remaining', v_grace_remaining,
    'circle_limit', case when v_is_pro then 5 else 1 end,
    'schedule_limit', case when v_is_pro then 5 else 1 end,
    'member_limit', case when v_is_pro then 20 else 8 end,
    'subscription_status', case when v_subscription.id is null then null else v_subscription.status::text end,
    'current_period_ends_at', v_subscription.current_period_ends_at,
    'will_renew', v_subscription.will_renew,
    'product_id', v_subscription.product_id,
    'store', v_subscription.store,
    'is_sandbox', v_subscription.is_sandbox,
    'management_url', v_subscription.management_url,
    'last_verified_at', v_subscription.last_verified_at
  );
end;
$$;

grant execute on function public.get_plan_overview() to authenticated;

commit;
