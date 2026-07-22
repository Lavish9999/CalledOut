begin;

-- A full unique index still allows multiple NULL commitment IDs and can be
-- inferred by ON CONFLICT without repeating a partial-index predicate.
drop index if exists public.activity_commitment_event_unique;
create unique index activity_commitment_event_unique
on public.activity_events(commitment_id, event_type);

create or replace function public.mark_commitment_missed(
  p_commitment_id uuid,
  p_missed_at timestamptz default now()
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_commitment public.commitments%rowtype;
  v_missed public.missed_commitments%rowtype;
begin
  select *
  into v_commitment
  from public.commitments
  where id = p_commitment_id
    and deleted_at is null
  for update;

  if not found then
    raise exception 'Commitment was not found';
  end if;

  update public.commitments
  set status = 'missed',
      missed_at = coalesce(missed_at, p_missed_at),
      updated_at = now()
  where id = p_commitment_id;

  insert into public.missed_commitments(
    commitment_id,
    user_id,
    circle_id,
    missed_at
  )
  values(
    v_commitment.id,
    v_commitment.user_id,
    v_commitment.circle_id,
    p_missed_at
  )
  on conflict(commitment_id) do update
    set missed_at = least(public.missed_commitments.missed_at, excluded.missed_at),
        updated_at = now()
  returning * into v_missed;

  insert into public.redemptions(
    missed_commitment_id,
    user_id,
    status,
    rules,
    opens_at,
    deadline_at
  )
  values(
    v_missed.id,
    v_commitment.user_id,
    'available',
    v_commitment.redemption_rules,
    now(),
    now() + make_interval(
      hours => coalesce((v_commitment.redemption_rules ->> 'window_hours')::integer, 24)
    )
  )
  on conflict(missed_commitment_id) do nothing;

  insert into public.activity_events(
    actor_id,
    circle_id,
    commitment_id,
    event_type,
    payload
  )
  values(
    v_commitment.user_id,
    v_commitment.circle_id,
    v_commitment.id,
    'commitment_missed',
    jsonb_build_object('title', v_commitment.title)
  )
  on conflict(commitment_id, event_type) do nothing;

  perform public.queue_user_notification(
    v_commitment.user_id,
    'commitment_missed',
    'You missed it.',
    'The Wall and your record have been updated.',
    jsonb_build_object('commitment_id', v_commitment.id),
    'commitment-missed:' || v_commitment.id::text,
    now()
  );

  return v_missed.id;
end;
$$;

create or replace function public.finalize_proof_review(
  p_submission uuid,
  p_accept boolean,
  p_actor uuid,
  p_source text,
  p_reason text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_proof public.proof_submissions%rowtype;
  v_commitment public.commitments%rowtype;
  v_redemption public.redemptions%rowtype;
  v_missed public.missed_commitments%rowtype;
  v_is_redemption boolean := false;
  v_late_rejection boolean := false;
  v_decided_at timestamptz := now();
begin
  select *
  into v_proof
  from public.proof_submissions
  where id = p_submission
    and deleted_at is null
  for update;

  if not found then
    raise exception 'Proof was not found';
  end if;

  if v_proof.status not in ('circle_review', 'disputed') then
    if p_accept and v_proof.status = 'verified' then return; end if;
    if not p_accept and v_proof.status = 'rejected' then return; end if;
    raise exception 'Proof is not awaiting review';
  end if;

  select *
  into v_commitment
  from public.commitments
  where id = v_proof.commitment_id
    and deleted_at is null
  for update;

  if not found then
    raise exception 'Commitment was not found';
  end if;

  select *
  into v_redemption
  from public.redemptions
  where redemption_commitment_id = v_commitment.id
    and deleted_at is null
  for update;

  v_is_redemption := found;
  v_late_rejection :=
    not p_accept
    and v_decided_at > v_commitment.deadline_at +
      make_interval(mins => v_commitment.grace_period_minutes);

  update public.proof_submissions
  set status = case
        when p_accept then 'verified'::public.proof_status
        else 'rejected'::public.proof_status
      end,
      decided_at = v_decided_at,
      dispute_reason = case
        when p_accept then dispute_reason
        else nullif(trim(coalesce(p_reason, '')), '')
      end,
      updated_at = v_decided_at
  where id = p_submission;

  if p_accept then
    update public.commitments
    set status = 'verified',
        verified_at = v_decided_at,
        updated_at = v_decided_at
    where id = v_commitment.id;
  elsif v_late_rejection then
    perform public.mark_commitment_missed(v_commitment.id, v_decided_at);
  else
    update public.commitments
    set status = 'rejected',
        verified_at = null,
        updated_at = v_decided_at
    where id = v_commitment.id;
  end if;

  if p_accept and v_is_redemption then
    update public.redemptions
    set status = 'completed',
        completed_at = v_decided_at,
        updated_at = v_decided_at
    where id = v_redemption.id;

    select *
    into v_missed
    from public.missed_commitments
    where id = v_redemption.missed_commitment_id
      and deleted_at is null
    for update;

    if not found then
      raise exception 'Original missed commitment was not found';
    end if;

    update public.missed_commitments
    set redeemed_at = v_decided_at,
        updated_at = v_decided_at
    where id = v_missed.id;

    update public.commitments
    set status = 'redeemed',
        updated_at = v_decided_at
    where id = v_missed.commitment_id
      and deleted_at is null;

    insert into public.activity_events(
      actor_id,
      circle_id,
      commitment_id,
      proof_submission_id,
      event_type,
      payload
    )
    values(
      v_commitment.user_id,
      v_commitment.circle_id,
      v_missed.commitment_id,
      p_submission,
      'redemption_completed',
      jsonb_build_object(
        'title', v_commitment.title,
        'review_source', p_source
      )
    )
    on conflict(commitment_id, event_type) do nothing;
  elsif p_accept then
    insert into public.activity_events(
      actor_id,
      circle_id,
      commitment_id,
      proof_submission_id,
      event_type,
      payload
    )
    values(
      v_commitment.user_id,
      v_commitment.circle_id,
      v_commitment.id,
      p_submission,
      'proof_verified',
      jsonb_build_object(
        'title', v_commitment.title,
        'review_source', p_source
      )
    )
    on conflict(commitment_id, event_type) do nothing;
  end if;

  perform public.queue_user_notification(
    v_commitment.user_id,
    'proof_results',
    case
      when p_accept then 'Proof approved'
      when v_late_rejection then 'Proof rejected — commitment missed'
      else 'Proof needs a retake'
    end,
    case
      when p_accept and v_is_redemption then 'Redemption complete. The original miss remains in your record.'
      when p_accept then 'Your promise has been marked complete.'
      when v_late_rejection then 'The proof did not pass review and the proof window has closed.'
      else 'Retake fresh proof before the deadline.'
    end,
    jsonb_build_object(
      'commitment_id', v_commitment.id,
      'proof_submission_id', p_submission,
      'approved', p_accept,
      'redemption', v_is_redemption,
      'missed', v_late_rejection
    ),
    'proof-result:' || p_submission::text,
    now()
  );

  insert into public.audit_logs(
    actor_id,
    action,
    entity_type,
    entity_id,
    after_state
  )
  values(
    p_actor,
    case when p_accept then 'proof_review_approved' else 'proof_review_rejected' end,
    'proof_submission',
    p_submission,
    jsonb_build_object(
      'source', p_source,
      'reason', nullif(trim(coalesce(p_reason, '')), ''),
      'commitment_id', v_commitment.id,
      'redemption', v_is_redemption,
      'missed', v_late_rejection
    )
  );
end;
$$;

create or replace function public.process_commitment_deadlines()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_commitment public.commitments%rowtype;
  v_opened integer := 0;
  v_missed integer := 0;
  v_expired integer := 0;
  v_granted integer := 0;
  v_generated integer := 0;
begin
  perform pg_advisory_xact_lock(hashtext('calledout_deadline_job'));

  v_generated := public.maintain_commitment_horizon(45);
  v_granted := public.grant_monthly_grace_passes();

  for v_commitment in
    update public.commitments
    set status = 'proof_window_open',
        updated_at = now()
    where status = 'upcoming'
      and proof_window_starts_at <= now()
      and deadline_at > now()
      and deleted_at is null
    returning *
  loop
    v_opened := v_opened + 1;
    perform public.queue_user_notification(
      v_commitment.user_id,
      'proof_window_opened',
      'Proof window open',
      'Your proof window is open. Proof is due by ' ||
        to_char(v_commitment.deadline_at at time zone v_commitment.timezone, 'HH12:MI AM') || '.',
      jsonb_build_object('commitment_id', v_commitment.id),
      'proof-window:' || v_commitment.id::text,
      now()
    );
  end loop;

  for v_commitment in
    select *
    from public.commitments
    where status in ('upcoming', 'proof_window_open', 'rejected')
      and deadline_at + make_interval(mins => grace_period_minutes) < now()
      and deleted_at is null
    for update
  loop
    perform public.mark_commitment_missed(v_commitment.id, now());
    v_missed := v_missed + 1;
  end loop;

  update public.redemptions
  set status = 'expired',
      updated_at = now()
  where status in ('available', 'in_progress')
    and deadline_at < now()
    and deleted_at is null;
  get diagnostics v_expired = row_count;

  return jsonb_build_object(
    'generated', v_generated,
    'opened', v_opened,
    'missed', v_missed,
    'redemptions_expired', v_expired,
    'grace_passes_granted', v_granted,
    'processed_at', now()
  );
end;
$$;

revoke all on function public.mark_commitment_missed(uuid, timestamptz) from public;
revoke all on function public.finalize_proof_review(uuid, boolean, uuid, text, text) from public;
grant execute on function public.process_commitment_deadlines() to service_role;

commit;
