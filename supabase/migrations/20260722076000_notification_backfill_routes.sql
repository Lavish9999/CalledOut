begin;

create or replace function public.schedule_redemption_notifications()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_active boolean;
  v_source_commitment uuid;
  v_route text;
begin
  v_active :=
    new.deleted_at is null
    and new.status in ('available', 'in_progress')
    and new.deadline_at > now();

  if not v_active then
    update public.notification_outbox
    set status = 'cancelled',
        claimed_at = null,
        last_error = 'Redemption no longer eligible',
        updated_at = now()
    where user_id = new.user_id
      and dedupe_key = 'redemption-warning:' || new.id::text
      and status in ('pending', 'processing');
    return new;
  end if;

  select missed.commitment_id
  into v_source_commitment
  from public.missed_commitments missed
  where missed.id = new.missed_commitment_id;

  if v_source_commitment is null then
    return new;
  end if;

  v_route := '/redemption/' || v_source_commitment::text;

  perform public.upsert_scheduled_notification(
    new.user_id,
    'redemption_warning',
    'Redemption window closing',
    'Complete fresh proof before this callout expires.',
    jsonb_build_object(
      'route', v_route,
      'redemption_id', new.id,
      'commitment_id', v_source_commitment
    ),
    'redemption-warning:' || new.id::text,
    new.deadline_at - interval '2 hours'
  );

  return new;
end;
$$;

-- Including the watched columns in SET guarantees the AFTER UPDATE OF triggers
-- fire even though the business values remain unchanged.
update public.commitments
set status = status,
    deadline_at = deadline_at,
    proof_window_starts_at = proof_window_starts_at,
    updated_at = now()
where deleted_at is null
  and status in ('upcoming', 'proof_window_open')
  and deadline_at > now();

update public.redemptions
set status = status,
    deadline_at = deadline_at,
    redemption_commitment_id = redemption_commitment_id,
    updated_at = now()
where deleted_at is null
  and status in ('available', 'in_progress')
  and deadline_at > now();

revoke all on function public.schedule_redemption_notifications()
from public, anon, authenticated;

commit;
