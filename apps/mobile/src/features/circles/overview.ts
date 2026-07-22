import { supabase } from "../../lib/supabase";
import { getCircles } from "./api";
import type { CircleRole } from "../../types/domain";

const RESOLVED_STATUSES = ["verified", "redeemed", "missed", "rejected"];

export async function getCircleOverview() {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) throw new Error("Not authenticated");

  const { data: memberships, error: membershipsError } = await supabase
    .from("circle_members")
    .select("circle_id,role")
    .eq("user_id", user.id)
    .eq("status", "active")
    .is("deleted_at", null);

  if (membershipsError) throw membershipsError;
  if (!memberships?.length) return [];

  const roleByCircle = new Map<string, CircleRole>(
    memberships.map((membership) => [
      membership.circle_id,
      membership.role as CircleRole,
    ]),
  );

  const visibleCircles = await getCircles();
  const circles = Array.from(
    new Map(
      visibleCircles
        .filter((circle) => roleByCircle.has(circle.id))
        .map((circle) => [
          circle.id,
          {
            ...circle,
            role: roleByCircle.get(circle.id) ?? circle.role,
          },
        ]),
    ).values(),
  );

  if (!circles.length) return [];

  const circleIds = circles.map((circle) => circle.id);
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);

  const { data: commitments, error: commitmentsError } = await supabase
    .from("commitments")
    .select("id,circle_id")
    .in("circle_id", circleIds)
    .gte("commitment_date", thirtyDaysAgo)
    .in("status", RESOLVED_STATUSES)
    .is("deleted_at", null);

  if (commitmentsError) throw commitmentsError;

  const commitmentIds = (commitments ?? []).map((row) => row.id);
  let redemptionCommitmentIds = new Set<string>();

  if (commitmentIds.length) {
    const { data: redemptions, error: redemptionsError } = await supabase
      .from("redemptions")
      .select("redemption_commitment_id")
      .in("redemption_commitment_id", commitmentIds)
      .is("deleted_at", null);

    if (redemptionsError) throw redemptionsError;

    redemptionCommitmentIds = new Set(
      (redemptions ?? [])
        .map((row) => row.redemption_commitment_id)
        .filter((id): id is string => Boolean(id)),
    );
  }

  const resultCountByCircle = new Map<string, number>();
  for (const commitment of commitments ?? []) {
    if (!commitment.circle_id || redemptionCommitmentIds.has(commitment.id)) {
      continue;
    }

    resultCountByCircle.set(
      commitment.circle_id,
      (resultCountByCircle.get(commitment.circle_id) ?? 0) + 1,
    );
  }

  return circles.map((circle) => ({
    ...circle,
    resolved_count: resultCountByCircle.get(circle.id) ?? 0,
  }));
}
