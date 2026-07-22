import { supabase } from "../../lib/supabase";
import type {
  AccountabilityInsights,
  CommitmentHistoryItem,
  InsightPattern,
  InsightWeek,
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
  const { data, error } = await supabase.rpc("get_profile_record");

  if (error) throw error;

  const value = (data ?? {}) as Record<string, unknown>;

  return {
    scheduled: Number(value.scheduled ?? 0),
    completed: Number(value.completed ?? 0),
    missed: Number(value.missed ?? 0),
    redemptionsCompleted: Number(value.redemptions_completed ?? 0),
    completionRate: Number(value.completion_rate ?? 0),
    currentStreak: Number(value.current_streak ?? 0),
    longestStreak: Number(value.longest_streak ?? 0),
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

function parseInsightPattern(value: unknown): InsightPattern | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;

  const row = value as Record<string, unknown>;
  if (typeof row.name !== "string") return null;

  return {
    name: row.name,
    total: Number(row.total ?? 0),
    completed: Number(row.completed ?? 0),
    rate: Number(row.rate ?? 0),
  };
}

function parseInsightWeeks(value: unknown): InsightWeek[] {
  if (!Array.isArray(value)) return [];

  return value.flatMap((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return [];
    const row = item as Record<string, unknown>;
    if (typeof row.week_start !== "string" || typeof row.label !== "string") {
      return [];
    }

    return [
      {
        weekStart: row.week_start,
        label: row.label,
        total: Number(row.total ?? 0),
        completed: Number(row.completed ?? 0),
        missed: Number(row.missed ?? 0),
        rate: Number(row.rate ?? 0),
      },
    ];
  });
}

function nullableNumber(value: unknown) {
  if (value === null || value === undefined) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export async function getAccountabilityInsights(): Promise<AccountabilityInsights> {
  const { data, error } = await supabase.rpc("get_accountability_insights");

  if (error) throw error;

  const value = (data ?? {}) as Record<string, unknown>;

  return {
    resolvedCount: Number(value.resolved_count ?? 0),
    completedCount: Number(value.completed_count ?? 0),
    missedCount: Number(value.missed_count ?? 0),
    completionRate: Number(value.completion_rate ?? 0),
    last30Total: Number(value.last30_total ?? 0),
    last30Completed: Number(value.last30_completed ?? 0),
    last30Missed: Number(value.last30_missed ?? 0),
    last30CompletionRate: Number(value.last30_completion_rate ?? 0),
    prior30Total: Number(value.prior30_total ?? 0),
    prior30CompletionRate: nullableNumber(value.prior30_completion_rate),
    trendDelta: nullableNumber(value.trend_delta),
    currentStreak: Number(value.current_streak ?? 0),
    longestStreak: Number(value.longest_streak ?? 0),
    bestWeekday: parseInsightPattern(value.best_weekday),
    weakestWeekday: parseInsightPattern(value.weakest_weekday),
    strongestWorkout: parseInsightPattern(value.strongest_workout),
    bestDeadlineWindow: parseInsightPattern(value.best_deadline_window),
    weeklyTrend: parseInsightWeeks(value.weekly_trend),
    averageProofLeadMinutes: nullableNumber(value.average_proof_lead_minutes),
    proofSampleCount: Number(value.proof_sample_count ?? 0),
    redemptionResolvedCount: Number(value.redemption_resolved_count ?? 0),
    redemptionCompletedCount: Number(value.redemption_completed_count ?? 0),
    redemptionOpenCount: Number(value.redemption_open_count ?? 0),
    redemptionRate: nullableNumber(value.redemption_rate),
  };
}
