export type CommitmentStatus = 'upcoming'|'proof_window_open'|'proof_submitted'|'under_review'|'verified'|'missed'|'excused'|'redemption_available'|'redeemed'|'rejected';
export type ProofMethod = 'live_photo'|'live_video'|'location'|'health'|'wearable'|'friend'|'combined';
export type WorkoutType = 'gym'|'running'|'walking'|'cycling'|'sports'|'home'|'swimming'|'mobility'|'other';
export type CircleRole = 'owner'|'moderator'|'member';
export type WallPeriod = 'week'|'month'|'all';
export type RedemptionStatus = 'available'|'in_progress'|'completed'|'expired'|'waived';
export type AccountStatus = 'active'|'suspended'|'banned'|'deletion_pending';

export interface Profile {
  id:string;
  username:string;
  display_name:string;
  bio:string|null;
  avatar_path:string|null;
  timezone:string;
  onboarding_completed_at:string|null;
  current_streak:number;
  longest_streak:number;
  completion_rate:number;
  account_status?:AccountStatus;
  is_admin:boolean;
}

export interface CommitmentSchedule {
  id:string;
  user_id:string;
  circle_id:string|null;
  title:string;
  workout_type:WorkoutType;
  timezone:string;
  days_of_week:number[];
  deadline_local:string;
  proof_window_minutes:number;
  minimum_duration_minutes:number;
  proof_method:ProofMethod;
  requires_location:boolean;
  active_from:string;
  active_until:string|null;
  is_active:boolean;
  consequence_text:string;
  redemption_window_hours:number;
  circle?:{id:string;name:string}|null;
}

export interface Commitment {
  id:string;
  user_id:string;
  circle_id:string|null;
  schedule_id:string|null;
  title:string;
  workout_type:WorkoutType;
  commitment_date:string;
  proof_window_starts_at:string;
  deadline_at:string;
  timezone:string;
  minimum_duration_minutes:number;
  proof_method:ProofMethod;
  requires_location:boolean;
  location_geofence?:{latitude:number;longitude:number;radius_m?:number}|null;
  status:CommitmentStatus;
  grace_period_minutes:number;
  verified_at:string|null;
  missed_at?:string|null;
  excused_at?:string|null;
  deleted_at?:string|null;
  redemption_rules?:{consequence?:string;minutes?:number;window_hours?:number;type?:string}|null;
  isRedemption?:boolean;
  circle?: {id?:string;name:string}|null;
}

export interface WallMiss {
  missed_id:string;
  commitment_id:string;
  circle_id:string;
  user_id:string;
  missed_at:string;
  redeemed_at:string|null;
  title:string;
  workout_type:WorkoutType;
  deadline_at:string;
  display_name:string;
  username:string;
  avatar_path:string|null;
  completion_rate:number;
  redemption_status:RedemptionStatus|null;
  redemption_deadline_at:string|null;
  reaction_count:number;
}

/** Compatibility name used by the member-wall presentation layer. */
export type WallMissDetail = Record<string,any>;

export interface WallEntry {
  id:string;
  user_id:string;
  circle_id:string;
  missed_count:number;
  most_recent_missed_at:string;
  completion_rate:number;
  redemption_in_progress:boolean;
  redeemed_count:number;
  reaction_count:number;
  latest_miss:WallMiss;
  latest_redemption_status?:RedemptionStatus|null;
  profile:{display_name:string;username:string;avatar_path:string|null};
}

export interface Circle {
  id:string;
  name:string;
  description:string|null;
  icon:string;
  privacy:'private'|'discoverable'|'public';
  member_limit:number;
  member_count?:number;
  role?:CircleRole;
  invite_code?:string;
  comments_enabled?:boolean;
  rules?:string|null;
}

export interface CircleMember {
  user_id:string;
  role:CircleRole;
  joined_at:string;
  profile:{
    display_name:string;
    username:string;
    avatar_path:string|null;
    current_streak:number;
    completion_rate:number;
  };
  [key:string]:any;
}

export interface ActivityEvent {
  id:string;
  event_type:'proof_verified'|'commitment_missed'|'redemption_completed'|'streak_record'|'member_joined'|'challenge_started';
  created_at:string;
  payload:Record<string,unknown>;
  actor:{id:string;display_name:string;username:string;avatar_path:string|null}|null;
}

/**
 * Supports both the original flat circle-detail contract and the newer
 * management screen's nested contract during the V1 migration.
 */
export interface CircleDetail extends Circle {
  circle:Circle;
  invite_code:string;
  inviteCode:string;
  myRole:CircleRole;
  members:CircleMember[];
  activity:ActivityEvent[];
}

export interface ProofReviewItem {
  id:string;
  commitment_id:string;
  user_id:string;
  status:'circle_review';
  verification_score:number|null;
  liveness_prompt:string|null;
  created_at:string;
  asset_path:string|null;
  signed_url:string|null;
  user:{display_name:string;username:string;avatar_path:string|null};
  commitment:{id:string;title:string;circle_id:string};
}

export interface ProofResult {
  id:string;
  commitment_id:string;
  status:'pending_upload'|'processing'|'circle_review'|'verified'|'more_proof_required'|'rejected'|'disputed';
  verification_score:number|null;
  liveness_prompt:string|null;
  dispute_reason:string|null;
  decided_at:string|null;
  asset_path:string|null;
  signed_url:string|null;
  commitment?:{circle_id:string|null}|null;
  checks:{check_type:string;passed:boolean|null;points_awarded:number;details:Record<string,unknown>}[];
}

export interface AccountabilityInsights {
  total:number;
  verified:number;
  missed:number;
  redeemed:number;
  onTimeRate:number;
  strongestDay:string|null;
  weakestDay:string|null;
  weeks:{label:string;verified:number;missed:number;rate:number}[];
}

export interface AccountabilityPattern {
  name:string;
  total:number;
  completed:number;
  rate:number;
}

export interface AccountabilityCoachInsights {
  resolvedCount:number;
  completedCount:number;
  missedCount:number;
  completionRate:number;
  last30Total:number;
  last30Completed:number;
  last30Missed:number;
  last30CompletionRate:number;
  prior30Total:number;
  prior30CompletionRate:number;
  trendDelta:number|null;
  currentStreak:number;
  longestStreak:number;
  bestWeekday:AccountabilityPattern|null;
  weakestWeekday:AccountabilityPattern|null;
  strongestWorkout:AccountabilityPattern|null;
  bestDeadlineWindow:AccountabilityPattern|null;
  weeklyTrend:{label:string;total:number;completed:number;rate:number}[];
  averageProofLeadMinutes:number|null;
  proofSampleCount:number;
  redemptionResolvedCount:number;
  redemptionCompletedCount:number;
  redemptionOpenCount:number;
  redemptionRate:number;
}

export interface PlanOverview {
  isPro:boolean;
  activeCircleCount:number;
  activeScheduleCount:number;
  gracePassesRemaining:number;
  circleLimit:number;
  scheduleLimit:number;
  memberLimit:number;
  subscriptionStatus:string|null;
  currentPeriodEndsAt:string|null;
  willRenew:boolean|null;
  productId:string|null;
  store:string|null;
  isSandbox:boolean|null;
  managementUrl:string|null;
  lastVerifiedAt:string|null;
}

export interface MemberWallDetail {
  profile:Profile;
  misses:WallMissDetail[];
  missed_count:number;
  redeemed_count:number;
  completion_rate:number;
  [key:string]:unknown;
}

