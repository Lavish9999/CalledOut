import { createClient } from "https://esm.sh/@supabase/supabase-js@2.110.7";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function userCandidates(event: Record<string, unknown>) {
  const values = [
    event.app_user_id,
    event.original_app_user_id,
    ...(Array.isArray(event.aliases) ? event.aliases : []),
  ];

  return [
    ...new Set(
      values.filter(
        (value): value is string =>
          typeof value === "string" && uuidPattern.test(value),
      ),
    ),
  ];
}

Deno.serve(async (req) => {
  try {
    const expected = Deno.env.get("REVENUECAT_WEBHOOK_AUTH");
    if (
      !expected ||
      req.headers.get("authorization") !== `Bearer ${expected}`
    ) {
      return json({ error: "Unauthorized" }, 401);
    }

    const body = await req.json();
    const event = body?.event as Record<string, unknown> | undefined;
    const eventId = typeof event?.id === "string" ? event.id : null;
    const eventType = typeof event?.type === "string" ? event.type : null;

    if (!event || !eventId || !eventType) {
      return json({ error: "Invalid RevenueCat event" }, 400);
    }

    if (eventType === "TEST") {
      return json({ ok: true, ignored: "test_event" });
    }

    const candidates = userCandidates(event);
    if (!candidates.length) {
      console.warn("RevenueCat event had no CalledOut UUID", {
        eventId,
        eventType,
      });
      return json({ ok: true, ignored: "no_calledout_user" });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceRoleKey) {
      throw new Error("Required Supabase secrets are missing");
    }

    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: profiles, error: profileError } = await admin
      .from("profiles")
      .select("id")
      .in("id", candidates)
      .limit(1);

    if (profileError) throw profileError;
    const userId = profiles?.[0]?.id as string | undefined;
    if (!userId) {
      console.warn("RevenueCat user does not match a CalledOut profile", {
        eventId,
        candidates,
      });
      return json({ ok: true, ignored: "unknown_user" });
    }

    const entitlementIds = Array.isArray(event.entitlement_ids)
      ? event.entitlement_ids.filter(
          (value): value is string => typeof value === "string",
        )
      : typeof event.entitlement_id === "string"
        ? [event.entitlement_id]
        : [];

    if (entitlementIds.length && !entitlementIds.includes("pro")) {
      return json({ ok: true, ignored: "unrelated_entitlement" });
    }

    const expirationAt =
      typeof event.expiration_at_ms === "number"
        ? new Date(event.expiration_at_ms)
        : null;
    const periodStillActive =
      !expirationAt || expirationAt.getTime() > Date.now();
    const explicitlyInactive = ["EXPIRATION", "TRANSFER"].includes(eventType);
    const entitlementActive = periodStillActive && !explicitlyInactive;

    const subscriptionStatus =
      eventType === "BILLING_ISSUE"
        ? "billing_issue"
        : eventType === "CANCELLATION"
          ? "cancelled"
          : eventType === "EXPIRATION" || eventType === "TRANSFER"
            ? "expired"
            : String(event.period_type ?? "").toUpperCase() === "TRIAL"
              ? "trialing"
              : "active";
    const now = new Date().toISOString();

    const { data: subscription, error: subscriptionError } = await admin
      .from("subscriptions")
      .upsert(
        {
          user_id: userId,
          revenuecat_customer_id:
            typeof event.original_app_user_id === "string"
              ? event.original_app_user_id
              : typeof event.app_user_id === "string"
                ? event.app_user_id
                : userId,
          store: typeof event.store === "string" ? event.store : null,
          product_id:
            typeof event.product_id === "string" ? event.product_id : null,
          status: subscriptionStatus,
          current_period_starts_at:
            typeof event.purchased_at_ms === "number"
              ? new Date(event.purchased_at_ms).toISOString()
              : null,
          current_period_ends_at: expirationAt?.toISOString() ?? null,
          will_renew:
            typeof event.will_renew === "boolean"
              ? event.will_renew
              : eventType === "CANCELLATION"
                ? false
                : null,
          raw_event_id: eventId,
          is_sandbox: event.environment === "SANDBOX",
          last_verified_at: now,
          updated_at: now,
        },
        { onConflict: "raw_event_id" },
      )
      .select("id")
      .single();

    if (subscriptionError) {
      console.error("RevenueCat subscription sync failed", subscriptionError);
      return json({ error: "Database error" }, 500);
    }

    const { error: entitlementError } = await admin.from("entitlements").upsert(
      {
        user_id: userId,
        identifier: "pro",
        status: entitlementActive ? "active" : "inactive",
        expires_at: expirationAt?.toISOString() ?? null,
        source_subscription_id: subscription.id,
        updated_at: now,
      },
      { onConflict: "user_id,identifier" },
    );

    if (entitlementError) {
      console.error("RevenueCat entitlement sync failed", entitlementError);
      return json({ error: "Database error" }, 500);
    }

    return json({
      ok: true,
      user_id: userId,
      event_type: eventType,
      entitlement_active: entitlementActive,
    });
  } catch (error) {
    console.error("RevenueCat webhook failed", error);
    return json(
      {
        error:
          error instanceof Error ? error.message : "Unexpected webhook error",
      },
      500,
    );
  }
});
