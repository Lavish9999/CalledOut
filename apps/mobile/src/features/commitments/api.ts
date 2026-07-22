import { supabase } from "../../lib/supabase";
import type {
  Commitment,
  CommitmentDetail,
  CommitmentSchedule,
  ProofMethod,
  RedemptionLink,
  TodayDashboard,
  WorkoutType,
} from "../../types/domain";

function localDateKey(date = new Date(), timeZone?: string) {
  if (!timeZone) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";

  return `${value("year")}-${value("month")}-${value("day")}`;
}

const commitmentSelect =
  "id,user_id,circle_id,schedule_id,title,workout_type,commitment_date,proof_window_starts_at,deadline_at,timezone,minimum_duration_minutes,proof_method,requires_location,status,grace_period_minutes,verified_at,missed_at,circle:circles(name)";

export async function getTodayDashboard(): Promise<TodayDashboard> {
  const user = (await supabase.auth.getUser()).data.user;
  if (!user) throw new Error("Not authenticated");

  const profileResult = await supabase
    .from("profiles")
    .select("timezone")
    .eq("id", user.id)
    .single();

  if (profileResult.error) throw profileResult.error;

  const todayKey = localDateKey(
    new Date(),
    profileResult.data.timezone ?? undefined,
  );

  const [todayResult, redemptionResult] = await Promise.all([
    supabase
      .from("commitments")
      .select(commitmentSelect)
      .eq("user_id", user.id)
      .eq("commitment_date", todayKey)
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
  proof_window_minutes?: number;
  requires_location: boolean;
  circle_id?: string | null;
}) {
  const { data, error } = await supabase.rpc("create_recurring_commitment_v3", {
    p_title: input.title,
    p_workout_type: input.workout_type,
    p_days_of_week: input.days_of_week,
    p_deadline_hour: input.deadline_hour,
    p_minimum_duration: input.minimum_duration_minutes,
    p_proof_method: input.proof_method,
    p_proof_window_minutes: input.proof_window_minutes ?? 240,
    p_requires_location: input.requires_location,
    p_circle_id: input.circle_id ?? null,
  });

  if (error) throw error;
  return data;
}

export async function createOneTimeCommitment(input: {
  title: string;
  workout_type: WorkoutType;
  commitment_date: string;
  deadline_hour: number;
  minimum_duration_minutes: number;
  proof_method: ProofMethod;
  proof_window_minutes?: number;
  requires_location: boolean;
  circle_id?: string | null;
}) {
  const { data, error } = await supabase.rpc("create_one_time_commitment_v1", {
    p_title: input.title,
    p_workout_type: input.workout_type,
    p_commitment_date: input.commitment_date,
    p_deadline_hour: input.deadline_hour,
    p_minimum_duration: input.minimum_duration_minutes,
    p_proof_method: input.proof_method,
    p_proof_window_minutes: input.proof_window_minutes ?? 240,
    p_requires_location: input.requires_location,
    p_circle_id: input.circle_id ?? null,
  });

  if (error) throw error;
  return data;
}

export async function getCommitmentDetail(
  commitmentId: string,
): Promise<CommitmentDetail> {
  const [commitmentResult, proofResult, missedResult] = await Promise.all([
    supabase
      .from("commitments")
      .select(commitmentSelect)
      .eq("id", commitmentId)
      .single(),
    supabase
      .from("proof_submissions")
      .select("id,status,verification_score,captured_at,decided_at")
      .eq("commitment_id", commitmentId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("missed_commitments")
      .select("id,redemption:redemptions(status,completed_at,deadline_at)")
      .eq("commitment_id", commitmentId)
      .is("deleted_at", null)
      .maybeSingle(),
  ]);

  if (commitmentResult.error) throw commitmentResult.error;
  if (proofResult.error) throw proofResult.error;
  if (missedResult.error) throw missedResult.error;

  const nestedRedemption = missedResult.data?.redemption;
  const redemption = Array.isArray(nestedRedemption)
    ? (nestedRedemption[0] ?? null)
    : (nestedRedemption ?? null);

  return {
    ...(commitmentResult.data as unknown as Commitment),
    proof: proofResult.data ?? null,
    redemption,
  };
}

export async function consumeGracePass(
  commitmentId: string,
  action: "extend" | "excuse",
) {
  const { error } = await supabase.rpc("use_grace_pass", {
    p_commitment_id: commitmentId,
    p_use_type: action,
    p_extend_minutes: action === "extend" ? 60 : 60,
  });

  if (error) throw error;
}

export async function getCommitmentSchedules() {
  const { data, error } = await supabase
    .from("commitment_schedules")
    .select(
      "id,title,workout_type,timezone,days_of_week,deadline_local,proof_window_minutes,minimum_duration_minutes,proof_method,requires_location,is_active,created_at,circle:circles(name)",
    )
    .eq("is_active", true)
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return (data ?? []) as unknown as CommitmentSchedule[];
}

export async function endCommitmentSchedule(scheduleId: string) {
  const { error } = await supabase.rpc("end_commitment_schedule", {
    p_schedule_id: scheduleId,
  });

  if (error) throw error;
}
