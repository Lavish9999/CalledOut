import { supabase } from "../../lib/supabase";
import type {
  CommitmentHistoryItem,
  CommitmentStatus,
  ProfileRecord,
  RedemptionStatus,
} from "../../types/domain";

export async function completeProfile(input: {
  display_name: string;
  username: string;
  bio?: string;
  timezone: string;
  workout_types: string[];
}) {
  const user = (await supabase.auth.getUser()).data.user;
  if (!user) throw new Error("Not authenticated");

  const { data, error } = await supabase
    .from("profiles")
    .update({
      ...input,
      username: input.username.toLowerCase(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", user.id)
    .select("id")
    .maybeSingle();

  if (error) throw error;
  if (!data) throw new Error("Profile not found");
}

export async function finishOnboarding() {
  const user = (await supabase.auth.getUser()).data.user;
  if (!user) throw new Error("Not authenticated");

  const { error } = await supabase
    .from("profiles")
    .update({ onboarding_completed_at: new Date().toISOString() })
    .eq("id", user.id);

  if (error) throw error;
}

async function getOwnCommitmentsAndRedemptions() {
  const user = (await supabase.auth.getUser()).data.user;
  if (!user) throw new Error("Not authenticated");

  const [commitmentsResult, redemptionsResult] = await Promise.all([
    supabase
      .from("commitments")
      .select(
        "id,user_id,circle_id,schedule_id,title,workout_type,commitment_date,proof_window_starts_at,deadline_at,timezone,minimum_duration_minutes,proof_method,requires_location,status,grace_period_minutes,verified_at,missed_at,circle:circles(name)",
      )
      .eq("user_id", user.id)
      .is("deleted_at", null)
      .order("deadline_at", { ascending: false }),
    supabase
      .from("redemptions")
      .select("status,redemption_commitment_id")
      .eq("user_id", user.id)
      .is("deleted_at", null),
  ]);

  if (commitmentsResult.error) throw commitmentsResult.error;
  if (redemptionsResult.error) throw redemptionsResult.error;

  const redemptionByCommitment = new Map<string, RedemptionStatus>();

  for (const row of redemptionsResult.data ?? []) {
    if (row.redemption_commitment_id) {
      redemptionByCommitment.set(
        row.redemption_commitment_id,
        row.status as RedemptionStatus,
      );
    }
  }

  return {
    commitments: commitmentsResult.data ?? [],
    redemptionByCommitment,
  };
}

export async function getProfileRecord(): Promise<ProfileRecord> {
  const { commitments, redemptionByCommitment } =
    await getOwnCommitmentsAndRedemptions();

  const resolvedStatuses = new Set<CommitmentStatus>([
    "verified",
    "missed",
    "redeemed",
    "rejected",
  ]);

  const originalResolved = commitments.filter(
    (commitment) =>
      !redemptionByCommitment.has(commitment.id) &&
      resolvedStatuses.has(commitment.status as CommitmentStatus),
  );

  const completed = originalResolved.filter(
    (commitment) => commitment.status === "verified",
  ).length;

  const missed = originalResolved.filter((commitment) =>
    ["missed", "redeemed", "rejected"].includes(commitment.status),
  ).length;

  const scheduled = originalResolved.length;
  const completionRate = scheduled ? (completed / scheduled) * 100 : 0;

  const dateResults = new Map<string, boolean[]>();

  for (const commitment of originalResolved) {
    const values = dateResults.get(commitment.commitment_date) ?? [];
    values.push(commitment.status === "verified");
    dateResults.set(commitment.commitment_date, values);
  }

  const successfulDates = [...dateResults.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([, values]) => values.every(Boolean));

  let run = 0;
  let longestStreak = 0;

  for (const successful of successfulDates) {
    run = successful ? run + 1 : 0;
    longestStreak = Math.max(longestStreak, run);
  }

  const currentStreak = run;
  const redemptionsCompleted = [...redemptionByCommitment.values()].filter(
    (status) => status === "completed",
  ).length;

  return {
    scheduled,
    completed,
    missed,
    redemptionsCompleted,
    completionRate,
    currentStreak,
    longestStreak,
  };
}

export async function getCommitmentHistory(): Promise<CommitmentHistoryItem[]> {
  const { commitments, redemptionByCommitment } =
    await getOwnCommitmentsAndRedemptions();

  return commitments.map((commitment) => ({
    ...(commitment as unknown as CommitmentHistoryItem),
    isRedemption: redemptionByCommitment.has(commitment.id),
    redemptionStatus: redemptionByCommitment.get(commitment.id),
  }));
}

export async function updatePrivacy(input: {
  public_profile_opt_in: boolean;
  public_wall_opt_in: boolean;
}) {
  const user = (await supabase.auth.getUser()).data.user;
  if (!user) throw new Error("Not authenticated");

  const { error } = await supabase
    .from("profiles")
    .update({ ...input, updated_at: new Date().toISOString() })
    .eq("id", user.id);

  if (error) throw error;
}
