import { supabase } from "../../lib/supabase";
import { circleCompletionRate } from "./metrics";
import type {
  ActivityEvent,
  Circle,
  CircleDetail,
  CircleMember,
  CircleRole,
  CircleUpcomingCommitment,
  CommitmentStatus,
} from "../../types/domain";

const COMPLETED_STATUSES: CommitmentStatus[] = ["verified", "redeemed"];
const MISSED_STATUSES: CommitmentStatus[] = ["missed", "rejected"];
const RESOLVED_STATUSES = [...COMPLETED_STATUSES, ...MISSED_STATUSES];

function normalizeActor(row: Record<string, unknown>) {
  const actor = row.actor;
  return {
    ...row,
    actor: Array.isArray(actor) ? (actor[0] ?? null) : actor,
  } as unknown as ActivityEvent;
}

async function getRedemptionCommitmentIds(commitmentIds: string[]) {
  if (!commitmentIds.length) return new Set<string>();

  const { data, error } = await supabase
    .from("redemptions")
    .select("redemption_commitment_id")
    .in("redemption_commitment_id", commitmentIds)
    .is("deleted_at", null);

  if (error) throw error;

  return new Set(
    (data ?? [])
      .map((row) => row.redemption_commitment_id)
      .filter((id): id is string => Boolean(id)),
  );
}

export async function getCircles() {
  const { data, error } = await supabase
    .from("circle_members")
    .select(
      "role,circle:circles(id,name,description,icon,privacy,member_limit,rules,comments_enabled)",
    )
    .eq("status", "active")
    .is("deleted_at", null);

  if (error) throw error;

  const circles = (data ?? []).map((row) => ({
    ...(Array.isArray(row.circle) ? row.circle[0] : row.circle),
    role: row.role,
  })) as Circle[];

  if (!circles.length) return [];

  const ids = circles.map((circle) => circle.id);
  const nowIso = new Date().toISOString();
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);

  const [countsResult, recentCommitmentsResult, upcomingResult, activityResult] =
    await Promise.all([
      supabase
        .from("circle_members")
        .select("circle_id")
        .in("circle_id", ids)
        .eq("status", "active")
        .is("deleted_at", null),
      supabase
        .from("commitments")
        .select("id,circle_id,user_id,status,commitment_date")
        .in("circle_id", ids)
        .gte("commitment_date", thirtyDaysAgo)
        .in("status", RESOLVED_STATUSES)
        .is("deleted_at", null),
      supabase
        .from("commitments")
        .select("circle_id,deadline_at,status")
        .in("circle_id", ids)
        .in("status", ["upcoming", "proof_window_open"])
        .gte("deadline_at", nowIso)
        .is("deleted_at", null)
        .order("deadline_at", { ascending: true }),
      supabase
        .from("activity_events")
        .select(
          "id,circle_id,event_type,created_at,payload,actor:profiles!activity_events_actor_id_fkey(display_name,username)",
        )
        .in("circle_id", ids)
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(100),
    ]);

  if (countsResult.error) throw countsResult.error;
  if (recentCommitmentsResult.error) throw recentCommitmentsResult.error;
  if (upcomingResult.error) throw upcomingResult.error;
  if (activityResult.error) throw activityResult.error;

  const redemptionIds = await getRedemptionCommitmentIds(
    (recentCommitmentsResult.data ?? []).map((row) => row.id),
  );
  const recentCommitments = (recentCommitmentsResult.data ?? []).filter(
    (row) => !redemptionIds.has(row.id),
  );

  const openCalloutPairs = await Promise.all(
    ids.map(async (circleId) => {
      const { data: count, error: countError } = await supabase.rpc(
        "get_circle_open_callouts",
        { p_circle: circleId },
      );
      if (countError) throw countError;
      return [circleId, Number(count ?? 0)] as const;
    }),
  );
  const openCalloutMap = new Map(openCalloutPairs);

  const countMap = new Map<string, number>();
  for (const row of countsResult.data ?? []) {
    countMap.set(row.circle_id, (countMap.get(row.circle_id) ?? 0) + 1);
  }

  const resolvedByCircle = new Map<
    string,
    { completed: number; missed: number }
  >();
  for (const row of recentCommitments) {
    if (!row.circle_id) continue;
    const current = resolvedByCircle.get(row.circle_id) ?? {
      completed: 0,
      missed: 0,
    };

    if (COMPLETED_STATUSES.includes(row.status as CommitmentStatus)) {
      current.completed += 1;
    } else if (MISSED_STATUSES.includes(row.status as CommitmentStatus)) {
      current.missed += 1;
    }

    resolvedByCircle.set(row.circle_id, current);
  }

  const upcomingByCircle = new Map<string, typeof upcomingResult.data>();
  for (const row of upcomingResult.data ?? []) {
    if (!row.circle_id) continue;
    const list = upcomingByCircle.get(row.circle_id) ?? [];
    list.push(row);
    upcomingByCircle.set(row.circle_id, list);
  }

  const latestActivity = new Map<string, ActivityEvent>();
  for (const raw of activityResult.data ?? []) {
    if (!raw.circle_id || latestActivity.has(raw.circle_id)) continue;
    latestActivity.set(raw.circle_id, normalizeActor(raw));
  }

  return circles.map((circle) => {
    const upcoming = upcomingByCircle.get(circle.id) ?? [];
    const resolved = resolvedByCircle.get(circle.id) ?? {
      completed: 0,
      missed: 0,
    };

    return {
      ...circle,
      member_count: countMap.get(circle.id) ?? 0,
      open_callouts: openCalloutMap.get(circle.id) ?? 0,
      average_completion_rate: circleCompletionRate(
        resolved.completed,
        resolved.missed,
      ),
      upcoming_count: upcoming.length,
      next_deadline_at: upcoming[0]?.deadline_at ?? null,
      latest_activity: latestActivity.get(circle.id) ?? null,
    };
  });
}

export async function getCircleDetail(circleId: string): Promise<CircleDetail> {
  const user = (await supabase.auth.getUser()).data.user;
  if (!user) throw new Error("Not authenticated");

  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const nowIso = new Date().toISOString();

  const [
    circleResult,
    membersResult,
    inviteResult,
    activityResult,
    recentCommitmentsResult,
    upcomingResult,
    openCalloutResult,
  ] = await Promise.all([
    supabase
      .from("circles")
      .select(
        "id,name,description,icon,privacy,member_limit,rules,comments_enabled,owner_id",
      )
      .eq("id", circleId)
      .single(),
    supabase
      .from("circle_members")
      .select(
        "id,user_id,role,joined_at,profile:profiles(display_name,username,avatar_path,current_streak,completion_rate)",
      )
      .eq("circle_id", circleId)
      .eq("status", "active")
      .is("deleted_at", null)
      .order("joined_at"),
    supabase
      .from("circle_invites")
      .select("code")
      .eq("circle_id", circleId)
      .is("revoked_at", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("activity_events")
      .select(
        "id,event_type,created_at,payload,actor:profiles!activity_events_actor_id_fkey(display_name,username)",
      )
      .eq("circle_id", circleId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(40),
    supabase
      .from("commitments")
      .select("id,user_id,status,commitment_date")
      .eq("circle_id", circleId)
      .gte("commitment_date", thirtyDaysAgo.toISOString().slice(0, 10))
      .in("status", RESOLVED_STATUSES)
      .is("deleted_at", null),
    supabase
      .from("commitments")
      .select(
        "id,user_id,title,deadline_at,proof_window_starts_at,status,profile:profiles!commitments_user_id_fkey(display_name,username)",
        { count: "exact" },
      )
      .eq("circle_id", circleId)
      .in("status", ["upcoming", "proof_window_open"])
      .gte("deadline_at", nowIso)
      .is("deleted_at", null)
      .order("deadline_at", { ascending: true })
      .limit(100),
    supabase.rpc("get_circle_open_callouts", {
      p_circle: circleId,
    }),
  ]);

  if (circleResult.error) throw circleResult.error;
  if (membersResult.error) throw membersResult.error;
  if (activityResult.error) throw activityResult.error;
  if (recentCommitmentsResult.error) throw recentCommitmentsResult.error;
  if (upcomingResult.error) throw upcomingResult.error;
  if (openCalloutResult.error) throw openCalloutResult.error;

  const redemptionIds = await getRedemptionCommitmentIds(
    (recentCommitmentsResult.data ?? []).map((row) => row.id),
  );
  const recentCommitments = (recentCommitmentsResult.data ?? []).filter(
    (row) => !redemptionIds.has(row.id),
  );

  const rawMembers = (membersResult.data ?? []).map((row) => ({
    ...row,
    profile: Array.isArray(row.profile) ? row.profile[0] : row.profile,
  })) as unknown as CircleMember[];

  const members = rawMembers.map((member) => {
    const rows = recentCommitments.filter((row) => row.user_id === member.user_id);
    const completed = rows.filter((row) =>
      COMPLETED_STATUSES.includes(row.status as CommitmentStatus),
    ).length;
    const missed = rows.filter((row) =>
      MISSED_STATUSES.includes(row.status as CommitmentStatus),
    ).length;
    const resolved = completed + missed;

    return {
      ...member,
      scheduled_count: resolved,
      completed_count: completed,
      missed_count: missed,
      circle_completion_rate: circleCompletionRate(completed, missed),
    };
  });

  const activity = (activityResult.data ?? []).map((row) =>
    normalizeActor(row),
  );

  const upcoming = (upcomingResult.data ?? []).map((row) => ({
    ...row,
    profile: Array.isArray(row.profile) ? (row.profile[0] ?? null) : row.profile,
  })) as unknown as CircleUpcomingCommitment[];

  const completedLast30 = recentCommitments.filter((row) =>
    COMPLETED_STATUSES.includes(row.status as CommitmentStatus),
  ).length;
  const missedLast30 = recentCommitments.filter((row) =>
    MISSED_STATUSES.includes(row.status as CommitmentStatus),
  ).length;
  const resolvedLast30 = completedLast30 + missedLast30;

  const myMembership = members.find((member) => member.user_id === user.id);
  if (!myMembership) throw new Error("You are not an active member of this circle.");

  return {
    circle: {
      ...(circleResult.data as Circle),
      member_count: members.length,
      role: myMembership.role,
    },
    members,
    inviteCode: inviteResult.error ? null : (inviteResult.data?.code ?? null),
    activity,
    upcoming,
    stats: {
      scheduledLast30: resolvedLast30,
      completedLast30,
      missedLast30,
      completionRateLast30: circleCompletionRate(
        completedLast30,
        missedLast30,
      ),
      openCallouts: Number(openCalloutResult.data ?? 0),
      upcomingCount: upcomingResult.count ?? upcoming.length,
    },
    myRole: myMembership.role,
  };
}

export async function createCircle(input: {
  name: string;
  description?: string;
  icon?: string;
  rules?: string;
}) {
  const { data, error } = await supabase.rpc("create_circle_v2", {
    p_name: input.name,
    p_description: input.description ?? null,
    p_icon: input.icon ?? "◉",
    p_rules: input.rules ?? null,
  });

  if (error) throw error;
  return data as string;
}

export async function joinCircle(code: string) {
  const { data, error } = await supabase.rpc("join_circle_by_code", {
    p_code: code.trim().toUpperCase(),
  });

  if (error) throw error;
  return data as string;
}

export async function updateCircle(input: {
  circleId: string;
  name: string;
  description?: string;
  icon: string;
  rules?: string;
}) {
  const { error } = await supabase.rpc("update_circle_details", {
    p_circle: input.circleId,
    p_name: input.name,
    p_description: input.description ?? null,
    p_icon: input.icon,
    p_rules: input.rules ?? null,
  });

  if (error) throw error;
}

export async function rotateCircleInvite(circleId: string) {
  const { data, error } = await supabase.rpc("rotate_circle_invite", {
    p_circle: circleId,
  });

  if (error) throw error;
  return data as string;
}

export async function leaveCircle(circleId: string) {
  const { error } = await supabase.rpc("leave_circle", { p_circle: circleId });
  if (error) throw error;
}

export async function deleteCircle(circleId: string) {
  const { error } = await supabase.rpc("delete_circle", { p_circle: circleId });
  if (error) throw error;
}

export async function removeCircleMember(circleId: string, userId: string) {
  const { error } = await supabase.rpc("remove_circle_member", {
    p_circle: circleId,
    p_user: userId,
  });

  if (error) throw error;
}

export async function setCircleMemberRole(
  circleId: string,
  userId: string,
  role: Exclude<CircleRole, "owner">,
) {
  const { error } = await supabase.rpc("set_circle_member_role", {
    p_circle: circleId,
    p_user: userId,
    p_role: role,
  });

  if (error) throw error;
}
