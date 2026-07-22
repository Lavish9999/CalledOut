export type CommitmentStatus =
  | "upcoming"
  | "proof_window_open"
  | "proof_submitted"
  | "under_review"
  | "verified"
  | "missed"
  | "excused"
  | "redemption_available"
  | "redeemed"
  | "rejected";

export type ProofMethod =
  | "live_photo"
  | "live_video"
  | "location"
  | "health"
  | "wearable"
  | "friend"
  | "combined";

export type WorkoutType =
  | "gym"
  | "running"
  | "walking"
  | "cycling"
  | "sports"
  | "home"
  | "swimming"
  | "mobility"
  | "other";

export type CircleRole = "owner" | "moderator" | "member";
export type RedemptionStatus =
  | "available"
  | "in_progress"
  | "completed"
  | "expired"
  | "waived";
export type AccountStatus =
  | "active"
  | "suspended"
  | "banned"
  | "deletion_pending";

export interface Profile {
  id: string;
  username: string;
  display_name: string;
  bio: string | null;
  avatar_path: string | null;
  timezone: string;
  onboarding_completed_at: string | null;
  current_streak: number;
  longest_streak: number;
  completion_rate: number;
  public_profile_opt_in: boolean;
  public_wall_opt_in: boolean;
  is_admin: boolean;
  account_status: AccountStatus;
}

export interface CommitmentSchedule {
  id: string;
  title: string;
  workout_type: WorkoutType;
  timezone: string;
  days_of_week: number[];
  deadline_local: string;
  proof_window_minutes: number;
  minimum_duration_minutes: number;
  proof_method: ProofMethod;
  requires_location: boolean;
  is_active: boolean;
  created_at: string;
  circle?: { name: string } | null;
}

export interface Commitment {
  id: string;
  user_id: string;
  circle_id: string | null;
  schedule_id: string | null;
  title: string;
  workout_type: WorkoutType;
  commitment_date: string;
  proof_window_starts_at: string;
  deadline_at: string;
  timezone: string;
  minimum_duration_minutes: number;
  proof_method: ProofMethod;
  requires_location: boolean;
  status: CommitmentStatus;
  grace_period_minutes: number;
  verified_at: string | null;
  missed_at?: string | null;
  circle?: { name: string } | null;
}

export interface RedemptionLink {
  id: string;
  status: RedemptionStatus;
  missed_commitment_id: string;
  redemption_commitment_id: string | null;
  deadline_at: string;
  completed_at: string | null;
  source_commitment_id: string;
  redeemed_at: string | null;
}

export interface TodayDashboard {
  commitments: Commitment[];
  redemptions: RedemptionLink[];
}

export interface ProfileRecord {
  scheduled: number;
  completed: number;
  missed: number;
  redemptionsCompleted: number;
  completionRate: number;
  currentStreak: number;
  longestStreak: number;
}

export interface CommitmentDetail extends Commitment {
  proof?: {
    id: string;
    status: string;
    verification_score: number | null;
    captured_at: string;
    decided_at: string | null;
  } | null;
  redemption?: {
    status: RedemptionStatus;
    completed_at: string | null;
    deadline_at: string;
  } | null;
}

export interface CommitmentHistoryItem extends Commitment {
  isRedemption: boolean;
  redemptionStatus?: RedemptionStatus;
}

export interface WallEntry {
  id: string;
  user_id: string;
  circle_id: string;
  missed_count: number;
  redeemed_count: number;
  most_recent_missed_at: string;
  completion_rate: number;
  latest_redemption_status: RedemptionStatus | null;
  profile: {
    display_name: string;
    username: string;
    avatar_path: string | null;
  };
}

export interface Circle {
  id: string;
  name: string;
  description: string | null;
  icon: string;
  privacy: "private" | "discoverable" | "public";
  member_limit: number;
  member_count?: number;
  role?: CircleRole;
  invite_code?: string;
  rules?: string | null;
  comments_enabled?: boolean;
  open_callouts?: number;
  average_completion_rate?: number;
  upcoming_count?: number;
  next_deadline_at?: string | null;
  latest_activity?: ActivityEvent | null;
}

export interface CircleMember {
  id: string;
  user_id: string;
  role: CircleRole;
  joined_at: string;
  profile: {
    display_name: string;
    username: string;
    avatar_path: string | null;
    current_streak?: number;
    completion_rate?: number;
  };
  scheduled_count?: number;
  completed_count?: number;
  missed_count?: number;
  circle_completion_rate?: number;
}

export interface CircleUpcomingCommitment {
  id: string;
  user_id: string;
  title: string;
  deadline_at: string;
  proof_window_starts_at: string;
  status: CommitmentStatus;
  profile: {
    display_name: string;
    username: string;
  } | null;
}

export interface CircleStats {
  scheduledLast30: number;
  completedLast30: number;
  missedLast30: number;
  completionRateLast30: number;
  openCallouts: number;
  upcomingCount: number;
}

export interface ActivityEvent {
  id: string;
  event_type: string;
  created_at: string;
  payload: Record<string, unknown>;
  actor: {
    display_name: string;
    username: string;
  } | null;
}

export interface CircleDetail {
  circle: Circle;
  members: CircleMember[];
  inviteCode: string | null;
  activity: ActivityEvent[];
  upcoming: CircleUpcomingCommitment[];
  stats: CircleStats;
  myRole: CircleRole;
}

export interface WallMissDetail {
  id: string;
  commitment_id: string;
  missed_at: string;
  redeemed_at: string | null;
  commitment: {
    title: string;
    minimum_duration_minutes: number;
  } | null;
  redemption: {
    status: RedemptionStatus;
    deadline_at: string;
    completed_at: string | null;
  } | null;
}

export interface PlanOverview {
  isPro: boolean;
  activeCircleCount: number;
  activeScheduleCount: number;
  gracePassesRemaining: number;
  circleLimit: number;
  scheduleLimit: number;
  memberLimit: number;
  subscriptionStatus: string | null;
  currentPeriodEndsAt: string | null;
  willRenew: boolean | null;
  productId: string | null;
  store: string | null;
  isSandbox: boolean | null;
  managementUrl: string | null;
  lastVerifiedAt: string | null;
}

export interface InsightPattern {
  name: string;
  total: number;
  completed: number;
  rate: number;
}

export interface InsightWeek {
  weekStart: string;
  label: string;
  total: number;
  completed: number;
  missed: number;
  rate: number;
}

export interface AccountabilityInsights {
  resolvedCount: number;
  completedCount: number;
  missedCount: number;
  completionRate: number;
  last30Total: number;
  last30Completed: number;
  last30Missed: number;
  last30CompletionRate: number;
  prior30Total: number;
  prior30CompletionRate: number | null;
  trendDelta: number | null;
  currentStreak: number;
  longestStreak: number;
  bestWeekday: InsightPattern | null;
  weakestWeekday: InsightPattern | null;
  strongestWorkout: InsightPattern | null;
  bestDeadlineWindow: InsightPattern | null;
  weeklyTrend: InsightWeek[];
  averageProofLeadMinutes: number | null;
  proofSampleCount: number;
  redemptionResolvedCount: number;
  redemptionCompletedCount: number;
  redemptionOpenCount: number;
  redemptionRate: number | null;
}
