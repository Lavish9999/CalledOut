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
  "available" | "in_progress" | "completed" | "expired" | "waived";

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
  };
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
