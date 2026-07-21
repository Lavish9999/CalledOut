import { supabase } from "../../lib/supabase";
import type {
  Commitment,
  ProofMethod,
  RedemptionLink,
  TodayDashboard,
  WorkoutType,
} from "../../types/domain";

function localDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

const commitmentSelect =
  "id,user_id,circle_id,schedule_id,title,workout_type,commitment_date,proof_window_starts_at,deadline_at,timezone,minimum_duration_minutes,proof_method,requires_location,status,grace_period_minutes,verified_at,missed_at,circle:circles(name)";

export async function getTodayDashboard(): Promise<TodayDashboard> {
  const user = (await supabase.auth.getUser()).data.user;
  if (!user) throw new Error("Not authenticated");

  const [todayResult, redemptionResult] = await Promise.all([
    supabase
      .from("commitments")
      .select(commitmentSelect)
      .eq("user_id", user.id)
      .eq("commitment_date", localDateKey())
      .is("deleted_at", null)
      .order("deadline_at"),
    supabase
      .from("redemptions")
      .select(
        "id,status,missed_commitment_id,redemption_commitment_id,deadline_at,completed_at,missed:missed_commitments(commitment_id,redeemed_at)",
      )
      .eq("user_id", user.id)
      .is("deleted_at", null)
      .in("status", ["available", "in_progress", "completed"]),
  ]);

  if (todayResult.error) throw todayResult.error;
  if (redemptionResult.error) throw redemptionResult.error;

  const redemptions: RedemptionLink[] = (redemptionResult.data ?? []).map(
    (row) => {
      const missed = Array.isArray(row.missed) ? row.missed[0] : row.missed;

      return {
        id: row.id,
        status: row.status,
        missed_commitment_id: row.missed_commitment_id,
        redemption_commitment_id: row.redemption_commitment_id,
        deadline_at: row.deadline_at,
        completed_at: row.completed_at,
        source_commitment_id: missed?.commitment_id ?? "",
        redeemed_at: missed?.redeemed_at ?? null,
      } as RedemptionLink;
    },
  );

  const existingIds = new Set((todayResult.data ?? []).map((row) => row.id));
  const missingRedemptionIds = redemptions
    .map((row) => row.redemption_commitment_id)
    .filter((id): id is string => Boolean(id) && !existingIds.has(id));

  let additional: Commitment[] = [];

  if (missingRedemptionIds.length) {
    const additionalResult = await supabase
      .from("commitments")
      .select(commitmentSelect)
      .eq("user_id", user.id)
      .in("id", missingRedemptionIds)
      .is("deleted_at", null);

    if (additionalResult.error) throw additionalResult.error;
    additional = (additionalResult.data ?? []) as unknown as Commitment[];
  }

  const todayCommitments = (todayResult.data ?? []) as unknown as Commitment[];

  const commitments = [...todayCommitments, ...additional]
    .filter(
      (commitment, index, all) =>
        all.findIndex((candidate) => candidate.id === commitment.id) === index,
    )
    .sort(
      (left, right) =>
        new Date(left.deadline_at).getTime() -
        new Date(right.deadline_at).getTime(),
    );

  return { commitments, redemptions };
}

export async function getTodayCommitments() {
  const dashboard = await getTodayDashboard();
  return dashboard.commitments;
}

export async function createRecurringCommitment(input: {
  title: string;
  workout_type: WorkoutType;
  days_of_week: number[];
  deadline_hour: number;
  minimum_duration_minutes: number;
  proof_method: ProofMethod;
  requires_location: boolean;
  circle_id?: string | null;
}) {
  const { data, error } = await supabase.rpc(
    "create_schedule_with_commitments",
    {
      p_title: input.title,
      p_workout_type: input.workout_type,
      p_days_of_week: input.days_of_week,
      p_deadline_hour: input.deadline_hour,
      p_minimum_duration: input.minimum_duration_minutes,
      p_proof_method: input.proof_method,
      p_requires_location: input.requires_location,
      p_circle_id: input.circle_id ?? null,
    },
  );

  if (error) throw error;
  return data;
}
