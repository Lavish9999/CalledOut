import { supabase } from "../../lib/supabase";
import type {
  ActivityEvent,
  Circle,
  CircleDetail,
  CircleMember,
} from "../../types/domain";

export async function getCircles() {
  const { data, error } = await supabase
    .from("circle_members")
    .select(
      "role,circle:circles(id,name,description,icon,privacy,member_limit)",
    )
    .eq("status", "active")
    .is("deleted_at", null);

  if (error) throw error;

  const circles = (data ?? []).map((row) => ({
    ...(Array.isArray(row.circle) ? row.circle[0] : row.circle),
    role: row.role,
  })) as Circle[];

  const counts = await Promise.all(
    circles.map(async (circle) => {
      const result = await supabase
        .from("circle_members")
        .select("id", { count: "exact", head: true })
        .eq("circle_id", circle.id)
        .eq("status", "active")
        .is("deleted_at", null);

      if (result.error) throw result.error;
      return [circle.id, result.count ?? 0] as const;
    }),
  );

  const countMap = new Map(counts);
  return circles.map((circle) => ({
    ...circle,
    member_count: countMap.get(circle.id) ?? 0,
  }));
}

export async function getCircleDetail(circleId: string): Promise<CircleDetail> {
  const [circleResult, membersResult, inviteResult, activityResult] =
    await Promise.all([
      supabase
        .from("circles")
        .select("id,name,description,icon,privacy,member_limit")
        .eq("id", circleId)
        .single(),
      supabase
        .from("circle_members")
        .select(
          "id,user_id,role,joined_at,profile:profiles(display_name,username,avatar_path)",
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
        .order("created_at", { ascending: false })
        .limit(20),
    ]);

  if (circleResult.error) throw circleResult.error;
  if (membersResult.error) throw membersResult.error;
  if (activityResult.error) throw activityResult.error;

  const members = (membersResult.data ?? []).map((row) => ({
    ...row,
    profile: Array.isArray(row.profile) ? row.profile[0] : row.profile,
  })) as unknown as CircleMember[];

  const activity = (activityResult.data ?? []).map((row) => ({
    ...row,
    actor: Array.isArray(row.actor) ? (row.actor[0] ?? null) : row.actor,
  })) as unknown as ActivityEvent[];

  return {
    circle: {
      ...(circleResult.data as Circle),
      member_count: members.length,
    },
    members,
    inviteCode: inviteResult.error ? null : (inviteResult.data?.code ?? null),
    activity,
  };
}

export async function createCircle(input: {
  name: string;
  description?: string;
}) {
  const { data, error } = await supabase.rpc("create_circle", {
    p_name: input.name,
    p_description: input.description ?? null,
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
