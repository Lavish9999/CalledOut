import { createClient } from "https://esm.sh/@supabase/supabase-js@2.110.7";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

Deno.serve(async (req) => {
  try {
    const authHeader = req.headers.get("authorization");
    if (!authHeader?.toLowerCase().startsWith("bearer ")) {
      return json({ error: "Unauthorized" }, 401);
    }

    const token = authHeader.replace(/^Bearer\s+/i, "");
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !serviceRoleKey) {
      throw new Error("Required Supabase function secrets are missing");
    }

    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const {
      data: { user },
      error: userError,
    } = await admin.auth.getUser(token);

    if (userError || !user) {
      return json({ error: userError?.message ?? "Unauthorized" }, 401);
    }

    const scheduledFor = new Date(Date.now() + 30 * 86_400_000).toISOString();

    const request = await admin.from("account_deletion_requests").upsert(
      {
        user_id: user.id,
        requested_at: new Date().toISOString(),
        scheduled_for: scheduledFor,
        cancelled_at: null,
        completed_at: null,
      },
      { onConflict: "user_id" },
    );
    if (request.error) throw request.error;

    const profile = await admin
      .from("profiles")
      .update({
        account_status: "deletion_pending",
        public_profile_opt_in: false,
        public_wall_opt_in: false,
      })
      .eq("id", user.id);
    if (profile.error) throw profile.error;

    const tokens = await admin
      .from("push_tokens")
      .delete()
      .eq("user_id", user.id);
    if (tokens.error) throw tokens.error;

    const audit = await admin.from("audit_logs").insert({
      actor_id: user.id,
      action: "account_deletion_requested",
      entity_type: "profile",
      entity_id: user.id,
    });
    if (audit.error) console.error("Deletion audit failed", audit.error);

    return json({ scheduledFor });
  } catch (error) {
    console.error("request-account-deletion failed", error);
    return json(
      { error: error instanceof Error ? error.message : "Unexpected error" },
      500,
    );
  }
});
