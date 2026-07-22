import type { WallEntry, WallMissDetail } from "../../types/domain";

const now = Date.now();
const hours = (value: number) => new Date(now + value * 60 * 60 * 1000).toISOString();
const days = (value: number) => new Date(now + value * 24 * 60 * 60 * 1000).toISOString();

export const wallPreviewEntries: WallEntry[] = [
  {
    id: "preview-1",
    user_id: "preview-user-1",
    circle_id: "preview-circle",
    missed_count: 4,
    redeemed_count: 1,
    most_recent_missed_at: days(-1),
    completion_rate: 63,
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
    most_recent_missed_at: days(-2),
    completion_rate: 78,
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
    most_recent_missed_at: days(-3),
    completion_rate: 71,
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
    most_recent_missed_at: days(-6),
    completion_rate: 88,
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
