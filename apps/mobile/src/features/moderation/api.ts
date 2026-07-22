import { supabase } from "../../lib/supabase";

export type ReportReason =
  | "harassment"
  | "inappropriate_content"
  | "spam_or_impersonation"
  | "unsafe_behavior"
  | "other";

export type BlockedUser = {
  blocked_user_id: string;
  display_name: string;
  username: string;
  blocked_at: string;
};

async function requireUser() {
  const { data, error } = await supabase.auth.getUser();
  if (error) throw error;
  if (!data.user) throw new Error("Sign in to continue.");
  return data.user;
}

export async function reportUser(input: {
  reportedUserId: string;
  reason: ReportReason;
  details?: string;
}) {
  const user = await requireUser();
  const details = input.details?.trim();
  const { error } = await supabase.from("reports").insert({
    reporter_id: user.id,
    reported_user_id: input.reportedUserId,
    reason: input.reason,
    details: details || null,
  });

  if (error) throw error;
}

export async function blockUser(blockedUserId: string) {
  const user = await requireUser();
  if (user.id === blockedUserId) throw new Error("You cannot block yourself.");

  const { error } = await supabase.from("blocks").upsert(
    {
      blocker_id: user.id,
      blocked_id: blockedUserId,
    },
    {
      onConflict: "blocker_id,blocked_id",
      ignoreDuplicates: true,
    },
  );

  if (error) throw error;
}

export async function getBlockedUsers() {
  const { data, error } = await supabase.rpc("get_blocked_users");
  if (error) throw error;
  return (data ?? []) as BlockedUser[];
}

export async function unblockUser(blockedUserId: string) {
  const { error } = await supabase.rpc("unblock_user", {
    p_blocked_user_id: blockedUserId,
  });
  if (error) throw error;
}

export async function submitSupportRequest(message: string) {
  const user = await requireUser();
  const cleaned = message.trim();
  if (cleaned.length < 20) {
    throw new Error("Add a little more detail so support can help.");
  }

  const contact = user.email ? `\n\nAccount email: ${user.email}` : "";
  const { error } = await supabase.from("reports").insert({
    reporter_id: user.id,
    reason: "support_request",
    details: `${cleaned}${contact}`,
  });

  if (error) throw error;
}
