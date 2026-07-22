begin;

-- Blocking is mutual everywhere: once either user blocks the other, neither
-- person can view or interact with the other's eligible social content.
drop policy if exists profiles_self_or_circle_read on public.profiles;
create policy profiles_self_or_circle_read
on public.profiles
for select
using (
  id = auth.uid()
  or public.is_admin()
  or (
    account_status = 'active'
    and not public.users_blocked(auth.uid(), id)
    and (
      public_profile_opt_in
      or exists (
        select 1
        from public.circle_members mine
        join public.circle_members theirs
          on theirs.circle_id = mine.circle_id
        where mine.user_id = auth.uid()
          and mine.status = 'active'
          and mine.deleted_at is null
          and theirs.user_id = profiles.id
          and theirs.status = 'active'
          and theirs.deleted_at is null
      )
    )
  )
);

drop policy if exists circle_members_read on public.circle_members;
create policy circle_members_read
on public.circle_members
for select
using (
  public.is_admin()
  or (
    public.is_circle_member(circle_id)
    and not public.users_blocked(auth.uid(), user_id)
  )
);

drop policy if exists commitments_read on public.commitments;
create policy commitments_read
on public.commitments
for select
using (
  public.is_admin()
  or user_id = auth.uid()
  or (
    circle_id is not null
    and public.is_circle_member(circle_id)
    and not public.users_blocked(auth.uid(), user_id)
  )
);

drop policy if exists proofs_read on public.proof_submissions;
create policy proofs_read
on public.proof_submissions
for select
using (
  public.is_admin()
  or user_id = auth.uid()
  or exists (
    select 1
    from public.commitments c
    where c.id = proof_submissions.commitment_id
      and c.circle_id is not null
      and public.is_circle_member(c.circle_id)
      and not public.users_blocked(auth.uid(), proof_submissions.user_id)
  )
);

drop policy if exists proof_assets_read on public.proof_assets;
create policy proof_assets_read
on public.proof_assets
for select
using (
  public.is_admin()
  or exists (
    select 1
    from public.proof_submissions p
    join public.commitments c on c.id = p.commitment_id
    where p.id = proof_assets.proof_submission_id
      and (
        p.user_id = auth.uid()
        or (
          c.circle_id is not null
          and public.is_circle_member(c.circle_id)
          and not public.users_blocked(auth.uid(), p.user_id)
        )
      )
  )
);

drop policy if exists checks_read on public.verification_checks;
create policy checks_read
on public.verification_checks
for select
using (
  public.is_admin()
  or exists (
    select 1
    from public.proof_submissions p
    join public.commitments c on c.id = p.commitment_id
    where p.id = verification_checks.proof_submission_id
      and (
        p.user_id = auth.uid()
        or (
          c.circle_id is not null
          and public.is_circle_member(c.circle_id)
          and not public.users_blocked(auth.uid(), p.user_id)
        )
      )
  )
);

drop policy if exists votes_read on public.verification_votes;
create policy votes_read
on public.verification_votes
for select
using (
  public.is_admin()
  or voter_id = auth.uid()
  or (
    not public.users_blocked(auth.uid(), voter_id)
    and exists (
      select 1
      from public.proof_submissions p
      join public.commitments c on c.id = p.commitment_id
      where p.id = verification_votes.proof_submission_id
        and c.circle_id is not null
        and public.is_circle_member(c.circle_id)
        and not public.users_blocked(auth.uid(), p.user_id)
    )
  )
);

drop policy if exists missed_read on public.missed_commitments;
create policy missed_read
on public.missed_commitments
for select
using (
  public.is_admin()
  or user_id = auth.uid()
  or (
    circle_id is not null
    and public.is_circle_member(circle_id)
    and not public.users_blocked(auth.uid(), user_id)
  )
);

drop policy if exists activity_circle_read on public.activity_events;
create policy activity_circle_read
on public.activity_events
for select
using (
  public.is_admin()
  or actor_id = auth.uid()
  or (
    not public.users_blocked(auth.uid(), actor_id)
    and (
      (
        circle_id is not null
        and public.is_circle_member(circle_id)
      )
      or visibility = 'public'
    )
  )
);

drop policy if exists reactions_circle on public.reactions;
create policy reactions_circle
on public.reactions
for select
using (
  public.is_admin()
  or user_id = auth.uid()
  or (
    not public.users_blocked(auth.uid(), user_id)
    and (
      exists (
        select 1
        from public.missed_commitments m
        where m.id = reactions.missed_commitment_id
          and public.is_circle_member(m.circle_id)
          and not public.users_blocked(auth.uid(), m.user_id)
      )
      or exists (
        select 1
        from public.activity_events a
        where a.id = reactions.activity_event_id
          and public.is_circle_member(a.circle_id)
          and not public.users_blocked(auth.uid(), a.actor_id)
      )
    )
  )
);

drop policy if exists reactions_insert on public.reactions;
create policy reactions_insert
on public.reactions
for insert
with check (
  user_id = auth.uid()
  and (
    exists (
      select 1
      from public.missed_commitments m
      where m.id = reactions.missed_commitment_id
        and m.user_id <> auth.uid()
        and public.is_circle_member(m.circle_id)
        and not public.users_blocked(auth.uid(), m.user_id)
    )
    or exists (
      select 1
      from public.activity_events a
      where a.id = reactions.activity_event_id
        and a.actor_id is distinct from auth.uid()
        and public.is_circle_member(a.circle_id)
        and not public.users_blocked(auth.uid(), a.actor_id)
    )
  )
);

drop policy if exists comments_circle on public.comments;
create policy comments_circle
on public.comments
for select
using (
  public.is_admin()
  or user_id = auth.uid()
  or (
    moderation_state = 'visible'
    and not public.users_blocked(auth.uid(), user_id)
    and exists (
      select 1
      from public.activity_events a
      where a.id = comments.activity_event_id
        and not public.users_blocked(auth.uid(), a.actor_id)
        and (
          (a.circle_id is not null and public.is_circle_member(a.circle_id))
          or a.visibility = 'public'
        )
    )
  )
);

drop policy if exists comments_insert on public.comments;
create policy comments_insert
on public.comments
for insert
with check (
  user_id = auth.uid()
  and exists (
    select 1
    from public.activity_events a
    join public.circles c on c.id = a.circle_id
    where a.id = comments.activity_event_id
      and c.comments_enabled
      and public.is_circle_member(c.id)
      and not public.users_blocked(auth.uid(), a.actor_id)
  )
);

-- Storage access must follow the same block relationship as the database row.
drop policy if exists proof_owner_read on storage.objects;
drop policy if exists proof_owner_member_admin_read on storage.objects;
create policy proof_owner_member_admin_read
on storage.objects
for select
to authenticated
using (
  bucket_id = 'proof-media'
  and (
    (storage.foldername(name))[1] = auth.uid()::text
    or public.is_admin()
    or exists (
      select 1
      from public.proof_submissions p
      join public.commitments c on c.id = p.commitment_id
      where p.asset_path = storage.objects.name
        and c.circle_id is not null
        and public.is_circle_member(c.circle_id)
        and not public.users_blocked(auth.uid(), p.user_id)
    )
  )
);

-- Reports must go through guarded RPCs so duplicate submissions and abuse can
-- be rate-limited consistently.
drop policy if exists reports_insert on public.reports;

create or replace function public.submit_user_report(
  p_reported_user_id uuid,
  p_reason text,
  p_details text default null,
  p_proof_submission_id uuid default null,
  p_comment_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_report_id uuid := gen_random_uuid();
  v_target_user uuid := p_reported_user_id;
  v_content_owner uuid;
  v_details text := nullif(trim(coalesce(p_details, '')), '');
begin
  if auth.uid() is null then
    raise exception 'authentication required';
  end if;

  if p_reason not in (
    'harassment',
    'inappropriate_content',
    'spam_or_impersonation',
    'unsafe_behavior',
    'other'
  ) then
    raise exception 'Choose a valid report reason';
  end if;

  if char_length(coalesce(v_details, '')) > 1000 then
    raise exception 'Report details must be 1000 characters or fewer';
  end if;

  if p_proof_submission_id is not null then
    select p.user_id
    into v_content_owner
    from public.proof_submissions p
    join public.commitments c on c.id = p.commitment_id
    where p.id = p_proof_submission_id
      and (
        p.user_id = auth.uid()
        or (
          c.circle_id is not null
          and public.is_circle_member(c.circle_id)
        )
      );

    if v_content_owner is null then
      raise exception 'Proof is unavailable';
    end if;

    if v_target_user is not null and v_target_user <> v_content_owner then
      raise exception 'Reported user does not match the proof owner';
    end if;

    v_target_user := v_content_owner;
  end if;

  if p_comment_id is not null then
    select c.user_id
    into v_content_owner
    from public.comments c
    join public.activity_events a on a.id = c.activity_event_id
    where c.id = p_comment_id
      and (
        c.user_id = auth.uid()
        or (a.circle_id is not null and public.is_circle_member(a.circle_id))
      );

    if v_content_owner is null then
      raise exception 'Comment is unavailable';
    end if;

    if v_target_user is not null and v_target_user <> v_content_owner then
      raise exception 'Reported user does not match the comment author';
    end if;

    v_target_user := v_content_owner;
  end if;

  if v_target_user is null then
    raise exception 'A reported user or content item is required';
  end if;

  if v_target_user = auth.uid() then
    raise exception 'You cannot report your own account';
  end if;

  if not exists (
    select 1 from public.profiles
    where id = v_target_user and deleted_at is null
  ) then
    raise exception 'Reported account is unavailable';
  end if;

  if (
    select count(*)
    from public.reports
    where reporter_id = auth.uid()
      and created_at > now() - interval '1 hour'
  ) >= 5 then
    raise exception 'Too many reports were submitted. Try again later.';
  end if;

  if exists (
    select 1
    from public.reports
    where reporter_id = auth.uid()
      and reported_user_id = v_target_user
      and reason = p_reason
      and status = 'open'
      and created_at > now() - interval '24 hours'
      and proof_submission_id is not distinct from p_proof_submission_id
      and comment_id is not distinct from p_comment_id
  ) then
    raise exception 'You already submitted this report. It is still under review.';
  end if;

  insert into public.reports(
    id,
    reporter_id,
    reported_user_id,
    proof_submission_id,
    comment_id,
    reason,
    details
  )
  values(
    v_report_id,
    auth.uid(),
    v_target_user,
    p_proof_submission_id,
    p_comment_id,
    p_reason,
    v_details
  );

  return v_report_id;
end;
$$;

create or replace function public.submit_support_request(p_details text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_report_id uuid := gen_random_uuid();
  v_details text := trim(coalesce(p_details, ''));
  v_email text := nullif(auth.jwt() ->> 'email', '');
begin
  if auth.uid() is null then
    raise exception 'authentication required';
  end if;

  if char_length(v_details) not between 20 and 1500 then
    raise exception 'Support requests must be between 20 and 1500 characters';
  end if;

  if (
    select count(*)
    from public.reports
    where reporter_id = auth.uid()
      and reason = 'support_request'
      and created_at > now() - interval '1 hour'
  ) >= 3 then
    raise exception 'Too many support requests were submitted. Try again later.';
  end if;

  insert into public.reports(id, reporter_id, reason, details)
  values(
    v_report_id,
    auth.uid(),
    'support_request',
    v_details || case when v_email is null then '' else E'\n\nAccount email: ' || v_email end
  );

  return v_report_id;
end;
$$;

revoke all on function public.submit_user_report(uuid, text, text, uuid, uuid) from public;
revoke all on function public.submit_support_request(text) from public;
grant execute on function public.submit_user_report(uuid, text, text, uuid, uuid) to authenticated;
grant execute on function public.submit_support_request(text) to authenticated;

-- Any queued social notification that identifies the other blocked user is
-- cancelled before delivery. Self commitment reminders are unaffected.
create or replace function public.cancel_blocked_social_notifications()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.notification_outbox
  set status = 'cancelled'
  where status = 'pending'
    and (
      (
        user_id = new.blocker_id
        and data ->> 'actor_user_id' = new.blocked_id::text
      )
      or (
        user_id = new.blocked_id
        and data ->> 'actor_user_id' = new.blocker_id::text
      )
    );

  return new;
end;
$$;

drop trigger if exists cancel_blocked_social_notifications on public.blocks;
create trigger cancel_blocked_social_notifications
after insert on public.blocks
for each row execute function public.cancel_blocked_social_notifications();

commit;
