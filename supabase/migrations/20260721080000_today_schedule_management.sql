begin;

create or replace function public.end_commitment_schedule(p_schedule_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_updated integer;
begin
  if auth.uid() is null then
    raise exception 'authentication required';
  end if;

  update public.commitment_schedules
  set
    is_active = false,
    active_until = (now() at time zone timezone)::date,
    updated_at = now()
  where id = p_schedule_id
    and user_id = auth.uid()
    and is_active
    and deleted_at is null;

  get diagnostics v_updated = row_count;

  if v_updated = 0 then
    raise exception 'active schedule not found';
  end if;

  update public.commitments
  set
    deleted_at = now(),
    updated_at = now()
  where schedule_id = p_schedule_id
    and user_id = auth.uid()
    and deleted_at is null
    and status = 'upcoming'
    and proof_window_starts_at > now();
end;
$$;

revoke all on function public.end_commitment_schedule(uuid) from public;
grant execute on function public.end_commitment_schedule(uuid) to authenticated;

commit;
