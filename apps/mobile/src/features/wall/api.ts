import { supabase } from "../../lib/supabase";
import type { WallEntry, WallMissDetail } from "../../types/domain";

export async function getWall(circleId?: string) {
  let query = supabase
    .from("wall_rankings")
    .select("*")
    .order("missed_count", { ascending: false })
    .order("most_recent_missed_at", { ascending: false });

  if (circleId) query = query.eq("circle_id", circleId);

  const { data, error } = await query;
  if (error) throw error;

  return (data ?? []).map((row) => ({
    ...row,
    redeemed_count: row.redeemed_count ?? 0,
    latest_redemption_status: row.latest_redemption_status ?? null,
    profile: {
      display_name: row.display_name,
      username: row.username,
      avatar_path: row.avatar_path,
    },
  })) as WallEntry[];
}

export async function getMemberWall(userId: string, circleId: string) {
  const [profileResult, missesResult] = await Promise.all([
    supabase
      .from("profiles")
      .select("display_name,username,avatar_path")
      .eq("id", userId)
      .single(),
    supabase
      .from("missed_commitments")
      .select(
        "id,commitment_id,missed_at,redeemed_at,commitment:commitments(title,minimum_duration_minutes),redemption:redemptions(status,deadline_at,completed_at)",
      )
      .eq("user_id", userId)
      .eq("circle_id", circleId)
      .is("deleted_at", null)
      .order("missed_at", { ascending: false }),
  ]);

  if (profileResult.error) throw profileResult.error;
  if (missesResult.error) throw missesResult.error;

  const misses = (missesResult.data ?? []).map((row) => ({
    ...row,
    commitment: Array.isArray(row.commitment)
      ? (row.commitment[0] ?? null)
      : row.commitment,
    redemption: Array.isArray(row.redemption)
      ? (row.redemption[0] ?? null)
      : row.redemption,
  })) as unknown as WallMissDetail[];

  return { profile: profileResult.data, misses };
}

export async function reactToMiss(missedId: string, reaction: string) {
  const user = (await supabase.auth.getUser()).data.user;
  if (!user) throw new Error("Not authenticated");

  const { error } = await supabase.from("reactions").insert({
    user_id: user.id,
    missed_commitment_id: missedId,
    reaction_type: reaction,
  });

  if (error) throw error;
}
