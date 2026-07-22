import { createClient } from "https://esm.sh/@supabase/supabase-js@2.110.7";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

// Supabase Edge Functions in this repository do not currently generate a
// Database type. Keep the client unparameterized and put explicit contracts on
// every row we read instead of allowing the SDK to infer `never`.
type AdminClient = any;

type NotificationJob = {
  id: string;
  user_id: string;
  category: string;
  title: string;
  body: string;
  data: Record<string, unknown>;
  attempts: number;
};

type PushToken = { token: string };
type TicketRecord = { id?: string; token: string; status: string; error?: string };
type ReceiptJob = { id: string; expo_tickets: TicketRecord[] | null };
type ExpoReceipt = {
  status?: string;
  message?: string;
  details?: { error?: string };
};

function preferenceField(category: string) {
  const fields: Record<string, string> = {
    morning_reminder: "morning_reminder",
    two_hour_warning: "two_hour_warning",
    thirty_minute_warning: "thirty_minute_warning",
    proof_window_opened: "proof_window_opened",
    proof_results: "proof_results",
    commitment_missed: "commitment_missed",
    redemption_warning: "redemption_warning",
    social_activity: "social_activity",
    review_required: "review_required",
  };
  return fields[category] ?? null;
}

async function categoryStillEnabled(
  admin: AdminClient,
  userId: string,
  category: string,
) {
  const field = preferenceField(category);
  if (!field) return false;

  const { data, error } = await admin
    .from("notification_preferences")
    .select(field)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) throw error;
  const row = data as Record<string, unknown> | null;
  return row?.[field] !== false;
}

async function invalidateToken(admin: AdminClient, token: string) {
  const result = await admin
    .from("push_tokens")
    .update({ invalidated_at: new Date().toISOString() })
    .eq("token", token);
  if (result.error) console.error("Could not invalidate push token", result.error);
}

async function checkReceipts(admin: AdminClient) {
  const cutoff = new Date(Date.now() - 10 * 60_000).toISOString();
  const result = await admin
    .from("notification_outbox")
    .select("id,expo_tickets")
    .eq("status", "sent")
    .not("expo_tickets", "is", null)
    .is("receipts_checked_at", null)
    .lte("sent_at", cutoff)
    .limit(50);

  if (result.error) throw result.error;
  const jobs = (result.data ?? []) as ReceiptJob[];
  if (!jobs.length) return { checked: 0, invalidated: 0 };

  const ticketIds = [
    ...new Set(
      jobs.flatMap((job) =>
        (Array.isArray(job.expo_tickets) ? job.expo_tickets : [])
          .map((ticket: TicketRecord) => ticket.id)
          .filter((id: string | undefined): id is string => Boolean(id)),
      ),
    ),
  ];

  if (!ticketIds.length) return { checked: 0, invalidated: 0 };

  const response = await fetch("https://exp.host/--/api/v2/push/getReceipts", {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/json",
    },
    body: JSON.stringify({ ids: ticketIds }),
  });

  if (!response.ok) throw new Error(await response.text());
  const payload = (await response.json()) as {
    data?: Record<string, ExpoReceipt>;
  };
  const receipts = payload.data ?? {};
  let invalidated = 0;

  for (const job of jobs) {
    const ticketRecords = Array.isArray(job.expo_tickets)
      ? job.expo_tickets
      : [];
    const errors: string[] = [];

    for (const ticket of ticketRecords) {
      if (!ticket.id) continue;
      const receipt = receipts[ticket.id];
      if (!receipt || receipt.status !== "error") continue;

      const code = receipt.details?.error ?? receipt.message ?? "Push receipt error";
      errors.push(String(code));
      if (code === "DeviceNotRegistered") {
        await invalidateToken(admin, ticket.token);
        invalidated += 1;
      }
    }

    const update = await admin
      .from("notification_outbox")
      .update({
        receipts_checked_at: new Date().toISOString(),
        last_error: errors.length ? errors.join("; ").slice(0, 2000) : null,
      })
      .eq("id", job.id);
    if (update.error) console.error("Could not save push receipts", update.error);
  }

  return { checked: jobs.length, invalidated };
}

Deno.serve(async (req) => {
  const secret = Deno.env.get("NOTIFICATION_JOB_SECRET");
  if (!secret || req.headers.get("x-job-secret") !== secret) {
    return json({ error: "Unauthorized" }, 401);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) {
    return json({ error: "Required Supabase secrets are missing" }, 500);
  }

  const admin: AdminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  let receiptSummary = { checked: 0, invalidated: 0 };
  try {
    receiptSummary = await checkReceipts(admin);
  } catch (error) {
    console.error("Expo receipt check failed", error);
  }

  const claim = await admin.rpc("claim_notification_jobs", { p_limit: 100 });
  if (claim.error) return json({ error: claim.error.message }, 500);

  const jobs = (claim.data ?? []) as NotificationJob[];
  let sent = 0;
  let failed = 0;
  let cancelled = 0;

  for (const job of jobs) {
    try {
      if (!(await categoryStillEnabled(admin, job.user_id, job.category))) {
        await admin
          .from("notification_outbox")
          .update({
            status: "cancelled",
            claimed_at: null,
            last_error: "Notification category disabled",
          })
          .eq("id", job.id);
        cancelled += 1;
        continue;
      }

      const tokenResult = await admin
        .from("push_tokens")
        .select("token")
        .eq("user_id", job.user_id)
        .is("invalidated_at", null);

      if (tokenResult.error) throw tokenResult.error;
      const activeTokens = (tokenResult.data ?? []) as PushToken[];

      if (!activeTokens.length) {
        await admin
          .from("notification_outbox")
          .update({
            status: "cancelled",
            claimed_at: null,
            last_error: "No active push token",
          })
          .eq("id", job.id);
        cancelled += 1;
        continue;
      }

      const messages = activeTokens.map(({ token }) => ({
        to: token,
        sound: "default",
        title: job.title,
        body: job.body,
        data: job.data,
        channelId: "commitments",
      }));

      const response = await fetch("https://exp.host/--/api/v2/push/send", {
        method: "POST",
        headers: {
          accept: "application/json",
          "content-type": "application/json",
        },
        body: JSON.stringify(messages),
      });

      if (!response.ok) throw new Error(await response.text());
      const payload = (await response.json()) as { data?: unknown[] };
      const tickets = Array.isArray(payload.data) ? payload.data : [];
      const records: TicketRecord[] = activeTokens.map(({ token }, index) => {
        const ticket = (tickets[index] ?? {}) as {
          id?: unknown;
          status?: unknown;
          message?: unknown;
          details?: { error?: unknown };
        };
        return {
          id: typeof ticket.id === "string" ? ticket.id : undefined,
          token,
          status: typeof ticket.status === "string" ? ticket.status : "error",
          error:
            typeof ticket.details?.error === "string"
              ? ticket.details.error
              : typeof ticket.message === "string"
                ? ticket.message
                : undefined,
        };
      });

      for (const ticket of records) {
        if (ticket.error === "DeviceNotRegistered") {
          await invalidateToken(admin, ticket.token);
        }
      }

      const accepted = records.filter(
        (ticket) => ticket.status === "ok" && Boolean(ticket.id),
      );
      const ticketErrors = records
        .filter((ticket) => ticket.status !== "ok")
        .map((ticket) => ticket.error ?? "Expo rejected a push message");

      if (!accepted.length) {
        await admin
          .from("notification_outbox")
          .update({
            status: job.attempts >= 5 ? "failed" : "pending",
            claimed_at: null,
            last_error: ticketErrors.join("; ").slice(0, 2000),
          })
          .eq("id", job.id);
        failed += 1;
        continue;
      }

      const update = await admin
        .from("notification_outbox")
        .update({
          status: "sent",
          sent_at: new Date().toISOString(),
          claimed_at: null,
          expo_tickets: accepted,
          last_error: ticketErrors.length
            ? `Partial delivery: ${ticketErrors.join("; ")}`.slice(0, 2000)
            : null,
        })
        .eq("id", job.id);
      if (update.error) throw update.error;
      sent += 1;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Push error";
      console.error("Push delivery failed", { jobId: job.id, error: message });
      await admin
        .from("notification_outbox")
        .update({
          status: job.attempts >= 5 ? "failed" : "pending",
          claimed_at: null,
          last_error: message.slice(0, 2000),
        })
        .eq("id", job.id);
      failed += 1;
    }
  }

  return json({
    claimed: jobs.length,
    sent,
    failed,
    cancelled,
    receipts: receiptSummary,
    processedAt: new Date().toISOString(),
  });
});
