import type {
  RedemptionStatus,
  WallEntry,
  WallMiss,
  WallMissDetail,
} from "../../types/domain";

const now = Date.now();
const hours = (value: number) =>
  new Date(now + value * 60 * 60 * 1000).toISOString();
const days = (value: number) =>
  new Date(now + value * 24 * 60 * 60 * 1000).toISOString();

function previewMiss(input: {
  id: string;
  userId: string;
  missedAt: string;
  title: string;
  displayName: string;
  username: string;
  completionRate: number;
  redemptionStatus: RedemptionStatus | null;
  redemptionDeadlineAt?: string | null;
  redeemedAt?: string | null;
  reactionCount?: number;
}): WallMiss {
  return {
    missed_id: input.id,
    commitment_id: `${input.id}-commitment`,
    circle_id: "preview-circle",
    user_id: input.userId,
    missed_at: input.missedAt,
    redeemed_at: input.redeemedAt ?? null,
    title: input.title,
    workout_type: "gym",
    deadline_at: input.missedAt,
    display_name: input.displayName,
    username: input.username,
    avatar_path: null,
    completion_rate: input.completionRate,
    redemption_status: input.redemptionStatus,
    redemption_deadline_at: input.redemptionDeadlineAt ?? null,
    reaction_count: input.reactionCount ?? 0,
  };
}

const jordanMiss = previewMiss({
  id: "preview-miss-jordan",
  userId: "preview-user-1",
  missedAt: days(-1),
  title: "Upper body",
  displayName: "Jordan",
  username: "jordanmoves",
  completionRate: 63,
  redemptionStatus: "in_progress",
  redemptionDeadlineAt: hours(8),
  reactionCount: 7,
});

const mayaMiss = previewMiss({
  id: "preview-miss-maya",
  userId: "preview-user-2",
  missedAt: days(-2),
  title: "5K run",
  displayName: "Maya",
  username: "mayatrains",
  completionRate: 78,
  redemptionStatus: "completed",
  redeemedAt: days(-1),
  reactionCount: 5,
});

const chrisMiss = previewMiss({
  id: "preview-miss-chris",
  userId: "preview-user-3",
  missedAt: days(-3),
  title: "Leg day",
  displayName: "Chris",
  username: "chrischecks",
  completionRate: 71,
  redemptionStatus: "available",
  redemptionDeadlineAt: hours(18),
  reactionCount: 3,
});

const taylorMiss = previewMiss({
  id: "preview-miss-taylor",
  userId: "preview-user-4",
  missedAt: days(-6),
  title: "Recovery walk",
  displayName: "Taylor",
  username: "taylorstrong",
  completionRate: 88,
  redemptionStatus: "expired",
  redemptionDeadlineAt: days(-5),
  reactionCount: 1,
});

export const wallPreviewEntries: WallEntry[] = [
  {
    id: "preview-1",
    user_id: "preview-user-1",
    circle_id: "preview-circle",
    missed_count: 4,
    redeemed_count: 1,
    most_recent_missed_at: jordanMiss.missed_at,
    completion_rate: 63,
    redemption_in_progress: true,
    reaction_count: jordanMiss.reaction_count,
    latest_miss: jordanMiss,
    latest_redemption_status: "in_progress",
    profile: {
      display_name: "Jordan",
      username: "jordanmoves",
      avatar_path: null,
    },
  },
  {
    id: "preview-2",
    user_id: "preview-user-2",
    circle_id: "preview-circle",
    missed_count: 3,
    redeemed_count: 3,
    most_recent_missed_at: mayaMiss.missed_at,
    completion_rate: 78,
    redemption_in_progress: false,
    reaction_count: mayaMiss.reaction_count,
    latest_miss: mayaMiss,
    latest_redemption_status: "completed",
    profile: {
      display_name: "Maya",
      username: "mayatrains",
      avatar_path: null,
    },
  },
  {
    id: "preview-3",
    user_id: "preview-user-3",
    circle_id: "preview-circle",
    missed_count: 2,
    redeemed_count: 0,
    most_recent_missed_at: chrisMiss.missed_at,
    completion_rate: 71,
    redemption_in_progress: false,
    reaction_count: chrisMiss.reaction_count,
    latest_miss: chrisMiss,
    latest_redemption_status: "available",
    profile: {
      display_name: "Chris",
      username: "chrischecks",
      avatar_path: null,
    },
  },
  {
    id: "preview-4",
    user_id: "preview-user-4",
    circle_id: "preview-circle",
    missed_count: 1,
    redeemed_count: 0,
    most_recent_missed_at: taylorMiss.missed_at,
    completion_rate: 88,
    redemption_in_progress: false,
    reaction_count: taylorMiss.reaction_count,
    latest_miss: taylorMiss,
    latest_redemption_status: "expired",
    profile: {
      display_name: "Taylor",
      username: "taylorstrong",
      avatar_path: null,
    },
  },
];

export const wallPreviewMember = {
  profile: {
    id: "preview-user-1",
    display_name: "Jordan",
    username: "jordanmoves",
    avatar_path: null,
  },
  misses: [
    {
      id: "preview-miss-1",
      commitment_id: "preview-commitment-1",
      missed_at: days(-1),
      redeemed_at: null,
      commitment: { title: "Upper body", minimum_duration_minutes: 45 },
      redemption: {
        status: "in_progress" as const,
        deadline_at: hours(8),
        completed_at: null,
      },
    },
    {
      id: "preview-miss-2",
      commitment_id: "preview-commitment-2",
      missed_at: days(-5),
      redeemed_at: days(-4),
      commitment: { title: "5K run", minimum_duration_minutes: 30 },
      redemption: {
        status: "completed" as const,
        deadline_at: days(-4),
        completed_at: days(-4),
      },
    },
    {
      id: "preview-miss-3",
      commitment_id: "preview-commitment-3",
      missed_at: days(-9),
      redeemed_at: null,
      commitment: { title: "Leg day", minimum_duration_minutes: 40 },
      redemption: {
        status: "available" as const,
        deadline_at: hours(18),
        completed_at: null,
      },
    },
    {
      id: "preview-miss-4",
      commitment_id: "preview-commitment-4",
      missed_at: days(-14),
      redeemed_at: null,
      commitment: { title: "Recovery walk", minimum_duration_minutes: 20 },
      redemption: {
        status: "expired" as const,
        deadline_at: days(-13),
        completed_at: null,
      },
    },
    {
      id: "preview-miss-5",
      commitment_id: "preview-commitment-5",
      missed_at: days(-21),
      redeemed_at: null,
      commitment: { title: "Push workout", minimum_duration_minutes: 35 },
      redemption: null,
    },
  ] satisfies WallMissDetail[],
};
