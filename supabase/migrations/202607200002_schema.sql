begin;

create table public.profiles (
 id uuid primary key references auth.users(id) on delete cascade,
 username citext not null unique check (username ~ '^[A-Za-z0-9_]{3,24}$'),
 display_name text not null check (char_length(display_name) between 1 and 60),
 bio text check (char_length(coalesce(bio,'')) <= 180),
 avatar_path text,
 timezone text not null default 'UTC',
 workout_types public.workout_type[] not null default '{}',
 onboarding_completed_at timestamptz,
 current_streak integer not null default 0 check (current_streak >= 0),
 longest_streak integer not null default 0 check (longest_streak >= 0),
 completion_rate numeric(5,2) not null default 100 check (completion_rate between 0 and 100),
 account_status text not null default 'active' check (account_status in ('active','suspended','banned','deletion_pending')),
 is_admin boolean not null default false,
 public_profile_opt_in boolean not null default false,
 public_wall_opt_in boolean not null default false,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 deleted_at timestamptz
);
create index profiles_status_idx on public.profiles(account_status) where deleted_at is null;

create table public.user_settings (
 user_id uuid primary key references public.profiles(id) on delete cascade,
 default_proof_visibility public.visibility_scope not null default 'circle',
 quiet_hours_start time,
 quiet_hours_end time,
 reduce_motion boolean not null default false,
 high_contrast boolean not null default false,
 allow_open_comments boolean not null default false,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

create table public.devices (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles(id) on delete cascade,
 installation_id text not null, platform text not null check(platform in ('ios','android','web')),
 integrity_state text not null default 'unknown', app_version text, os_version text,
 last_seen_at timestamptz not null default now(), created_at timestamptz not null default now(), updated_at timestamptz not null default now(), deleted_at timestamptz,
 unique(user_id, installation_id)
);

create table public.circles (
 id uuid primary key default gen_random_uuid(), name text not null check(char_length(name) between 2 and 60), description text check(char_length(coalesce(description,''))<=300),
 icon text not null default '◉', cover_path text, owner_id uuid not null references public.profiles(id), privacy public.circle_privacy not null default 'private',
 member_limit integer not null default 8 check(member_limit between 2 and 500), comments_enabled boolean not null default false,
 proof_settings jsonb not null default '{"minimum_score":70}'::jsonb, redemption_settings jsonb not null default '{"type":"verified_workout","minutes":30,"window_hours":24}'::jsonb,
 grace_passes_per_month integer not null default 1 check(grace_passes_per_month between 0 and 10), rules text,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(), deleted_at timestamptz
);
create index circles_owner_idx on public.circles(owner_id) where deleted_at is null;
create index circles_privacy_idx on public.circles(privacy) where deleted_at is null;

create table public.circle_members (
 id uuid primary key default gen_random_uuid(), circle_id uuid not null references public.circles(id) on delete cascade, user_id uuid not null references public.profiles(id) on delete cascade,
 role public.circle_role not null default 'member', status public.membership_status not null default 'active', joined_at timestamptz not null default now(),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(), deleted_at timestamptz,
 unique(circle_id,user_id)
);
create index circle_members_user_idx on public.circle_members(user_id,status) where deleted_at is null;
create index circle_members_circle_idx on public.circle_members(circle_id,status) where deleted_at is null;

create table public.circle_invites (
 id uuid primary key default gen_random_uuid(), circle_id uuid not null references public.circles(id) on delete cascade, code citext not null unique,
 created_by uuid not null references public.profiles(id), max_uses integer check(max_uses is null or max_uses > 0), uses integer not null default 0,
 expires_at timestamptz, revoked_at timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index circle_invites_active_idx on public.circle_invites(code) where revoked_at is null;

create table public.commitment_schedules (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles(id) on delete cascade, circle_id uuid references public.circles(id) on delete set null,
 title text not null check(char_length(title) between 1 and 80), workout_type public.workout_type not null, timezone text not null,
 days_of_week smallint[] not null check(days_of_week <@ array[0,1,2,3,4,5,6]::smallint[]), deadline_local time not null,
 proof_window_minutes integer not null default 240 check(proof_window_minutes between 5 and 1440), minimum_duration_minutes integer not null default 30 check(minimum_duration_minutes between 1 and 1440),
 proof_method public.proof_method not null default 'live_photo', requires_location boolean not null default false, location_geofence jsonb,
 grace_period_minutes integer not null default 0 check(grace_period_minutes between 0 and 1440), recurrence_rule text, active_from date not null default current_date, active_until date,
 is_active boolean not null default true, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), deleted_at timestamptz
);
create index schedules_user_active_idx on public.commitment_schedules(user_id,is_active) where deleted_at is null;

create table public.commitments (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles(id) on delete cascade, circle_id uuid references public.circles(id) on delete set null,
 schedule_id uuid references public.commitment_schedules(id) on delete set null, title text not null, workout_type public.workout_type not null,
 commitment_date date not null, proof_window_starts_at timestamptz not null, deadline_at timestamptz not null, timezone text not null,
 minimum_duration_minutes integer not null check(minimum_duration_minutes > 0), proof_method public.proof_method not null, requires_location boolean not null default false,
 location_geofence jsonb, visibility public.visibility_scope not null default 'circle', grace_period_minutes integer not null default 0,
 redemption_rules jsonb not null default '{"type":"verified_workout","minutes":30,"window_hours":24}'::jsonb,
 status public.commitment_status not null default 'upcoming', verified_at timestamptz, missed_at timestamptz, excused_at timestamptz,
 source_version integer not null default 1, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), deleted_at timestamptz,
 check(proof_window_starts_at < deadline_at), unique(schedule_id,commitment_date)
);
create index commitments_today_user_idx on public.commitments(user_id,deadline_at,status) where deleted_at is null;
create index commitments_deadline_jobs_idx on public.commitments(status,deadline_at) where status in ('upcoming','proof_window_open','proof_submitted','under_review');
create index commitments_circle_idx on public.commitments(circle_id,commitment_date) where circle_id is not null and deleted_at is null;

create table public.proof_submissions (
 id uuid primary key default gen_random_uuid(), commitment_id uuid not null references public.commitments(id) on delete cascade, user_id uuid not null references public.profiles(id) on delete cascade,
 captured_at timestamptz not null, received_at timestamptz not null default now(), capture_source text not null check(capture_source in ('in_app_camera','in_app_video','health','wearable','friend')),
 liveness_prompt text, liveness_completed boolean not null default false, location_result public.location_result not null default 'not_required',
 status public.proof_status not null default 'pending_upload', verification_score integer check(verification_score between 0 and 100), asset_path text,
 client_submission_key uuid not null default gen_random_uuid(), dispute_reason text, decided_at timestamptz,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(), deleted_at timestamptz,
 unique(commitment_id,client_submission_key)
);
create unique index proof_one_active_idx on public.proof_submissions(commitment_id) where status not in ('rejected') and deleted_at is null;
create index proof_review_idx on public.proof_submissions(status,created_at) where status in ('processing','circle_review','disputed');

create table public.proof_assets (
 id uuid primary key default gen_random_uuid(), proof_submission_id uuid not null references public.proof_submissions(id) on delete cascade,
 storage_path text not null unique, media_type text not null check(media_type in ('image','video','health_record','wearable_record')), mime_type text,
 byte_size bigint check(byte_size is null or byte_size>=0), sha256 text, perceptual_hash text, metadata jsonb not null default '{}'::jsonb,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(), deleted_at timestamptz
);
create index proof_assets_hash_idx on public.proof_assets(sha256) where sha256 is not null;

create table public.verification_checks (
 id uuid primary key default gen_random_uuid(), proof_submission_id uuid not null references public.proof_submissions(id) on delete cascade,
 check_type text not null, points_awarded integer not null default 0, passed boolean, confidence numeric(5,4), details jsonb not null default '{}'::jsonb,
 provider text not null default 'calledout', created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index verification_checks_submission_idx on public.verification_checks(proof_submission_id);

create table public.verification_votes (
 id uuid primary key default gen_random_uuid(), proof_submission_id uuid not null references public.proof_submissions(id) on delete cascade,
 voter_id uuid not null references public.profiles(id) on delete cascade, vote text not null check(vote in ('accept','reject')), reason text,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(proof_submission_id,voter_id)
);

create table public.missed_commitments (
 id uuid primary key default gen_random_uuid(), commitment_id uuid not null unique references public.commitments(id) on delete cascade, user_id uuid not null references public.profiles(id) on delete cascade,
 circle_id uuid references public.circles(id) on delete cascade, missed_at timestamptz not null, wall_visible boolean not null default true,
 redeemed_at timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), deleted_at timestamptz
);
create index missed_wall_idx on public.missed_commitments(circle_id,missed_at desc) where wall_visible and deleted_at is null;

create table public.redemptions (
 id uuid primary key default gen_random_uuid(), missed_commitment_id uuid not null references public.missed_commitments(id) on delete cascade,
 user_id uuid not null references public.profiles(id) on delete cascade, redemption_commitment_id uuid references public.commitments(id) on delete set null,
 status public.redemption_status not null default 'available', rules jsonb not null, opens_at timestamptz not null, deadline_at timestamptz not null,
 completed_at timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), deleted_at timestamptz,
 unique(missed_commitment_id)
);
create index redemption_jobs_idx on public.redemptions(status,deadline_at) where status in ('available','in_progress');

create table public.grace_passes (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles(id) on delete cascade, circle_id uuid references public.circles(id) on delete cascade,
 granted_for_month date not null, source text not null check(source in ('free_monthly','pro_monthly','moderator','support')), used_commitment_id uuid references public.commitments(id) on delete set null,
 use_type text check(use_type in ('move','excuse','extend')), used_at timestamptz, expires_at timestamptz not null,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(user_id,circle_id,granted_for_month,source)
);

create table public.activity_events (
 id uuid primary key default gen_random_uuid(), actor_id uuid references public.profiles(id) on delete set null, circle_id uuid references public.circles(id) on delete cascade,
 commitment_id uuid references public.commitments(id) on delete cascade, proof_submission_id uuid references public.proof_submissions(id) on delete cascade,
 event_type public.activity_type not null, visibility public.visibility_scope not null default 'circle', payload jsonb not null default '{}'::jsonb,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(), deleted_at timestamptz
);
create index activity_circle_idx on public.activity_events(circle_id,created_at desc) where deleted_at is null;

create table public.reactions (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles(id) on delete cascade,
 missed_commitment_id uuid references public.missed_commitments(id) on delete cascade, activity_event_id uuid references public.activity_events(id) on delete cascade,
 reaction_type public.reaction_type not null, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), deleted_at timestamptz,
 check((missed_commitment_id is not null)::int + (activity_event_id is not null)::int = 1), unique(user_id,missed_commitment_id,reaction_type)
);

create table public.comments (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles(id) on delete cascade, activity_event_id uuid not null references public.activity_events(id) on delete cascade,
 body text not null check(char_length(body) between 1 and 500), moderation_state text not null default 'visible' check(moderation_state in ('visible','held','removed')),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(), deleted_at timestamptz
);

create table public.blocks (
 id uuid primary key default gen_random_uuid(), blocker_id uuid not null references public.profiles(id) on delete cascade, blocked_id uuid not null references public.profiles(id) on delete cascade,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(), check(blocker_id<>blocked_id), unique(blocker_id,blocked_id)
);

create table public.reports (
 id uuid primary key default gen_random_uuid(), reporter_id uuid not null references public.profiles(id) on delete cascade, reported_user_id uuid references public.profiles(id) on delete set null,
 proof_submission_id uuid references public.proof_submissions(id) on delete set null, comment_id uuid references public.comments(id) on delete set null,
 reason text not null, details text, status public.report_status not null default 'open', assigned_admin_id uuid references public.profiles(id) on delete set null,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(), resolved_at timestamptz
);
create index reports_queue_idx on public.reports(status,created_at);

create table public.moderation_actions (
 id uuid primary key default gen_random_uuid(), report_id uuid references public.reports(id) on delete set null, admin_id uuid not null references public.profiles(id), target_user_id uuid references public.profiles(id),
 proof_submission_id uuid references public.proof_submissions(id), comment_id uuid references public.comments(id), action_type public.moderation_action_type not null,
 reason text not null, expires_at timestamptz, metadata jsonb not null default '{}'::jsonb, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

create table public.notification_preferences (
 user_id uuid primary key references public.profiles(id) on delete cascade, morning_reminder boolean not null default true, two_hour_warning boolean not null default true,
 thirty_minute_warning boolean not null default true, proof_window_opened boolean not null default true, proof_results boolean not null default true,
 commitment_missed boolean not null default true, redemption_warning boolean not null default true, social_activity boolean not null default true,
 review_required boolean not null default true, quiet_hours_start time, quiet_hours_end time, timezone text not null default 'UTC',
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

create table public.push_tokens (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles(id) on delete cascade, token text not null unique,
 platform text not null check(platform in ('ios','android','web')), last_seen_at timestamptz not null default now(), invalidated_at timestamptz,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

create table public.subscriptions (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles(id) on delete cascade, revenuecat_customer_id text not null,
 store text, product_id text, status public.subscription_status not null, current_period_starts_at timestamptz, current_period_ends_at timestamptz,
 will_renew boolean, raw_event_id text unique, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), deleted_at timestamptz
);
create index subscriptions_user_idx on public.subscriptions(user_id,status);

create table public.entitlements (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles(id) on delete cascade, identifier text not null,
 status public.entitlement_status not null, expires_at timestamptz, source_subscription_id uuid references public.subscriptions(id) on delete set null,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(user_id,identifier)
);

create table public.health_connections (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles(id) on delete cascade,
 provider text not null check(provider in ('apple_health','health_connect','garmin','fitbit','other')), status text not null check(status in ('connected','disconnected','revoked','error')),
 scopes text[] not null default '{}', external_subject_hash text, last_synced_at timestamptz,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(), deleted_at timestamptz, unique(user_id,provider)
);

create table public.audit_logs (
 id bigint generated always as identity primary key, actor_id uuid references public.profiles(id) on delete set null, action text not null, entity_type text not null, entity_id uuid,
 before_state jsonb, after_state jsonb, ip_hash text, request_id text, created_at timestamptz not null default now()
);
create index audit_entity_idx on public.audit_logs(entity_type,entity_id,created_at desc);

create table public.account_deletion_requests (
 id uuid primary key default gen_random_uuid(), user_id uuid not null unique references public.profiles(id) on delete cascade,
 requested_at timestamptz not null default now(), scheduled_for timestamptz not null default (now()+interval '30 days'), cancelled_at timestamptz, completed_at timestamptz,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

commit;
