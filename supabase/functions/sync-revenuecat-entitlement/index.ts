import { createClient } from "https://esm.sh/@supabase/supabase-js@2.110.7";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "content-type": "application/json" },
  });

type RevenueCatEntitlement = {
  expires_date?: string | null;
  grace_period_expires_date?: string | null;
  product_identifier?: string | null;
  purchase_date?: string | null;
};

type RevenueCatSubscription = {
  billing_issues_detected_at?: string | null;
  expires_date?: string | null;
  grace_period_expires_date?: string | null;
  is_sandbox?: boolean | null;
  period_type?: string | null;
  purchase_date?: string | null;
  refunded_at?: string | null;
  store?: string | null;
  unsubscribe_detected_at?: string | null;
};

type RevenueCatSubscriber = {
  entitlements?: Record<string, RevenueCatEntitlement>;
  management_url?: string | null;
  original_app_user_id?: string | null;
  subscriptions?: Record<string, RevenueCatSubscription>;
};

function laterDate(...values: Array<string | null | undefined>) {
  const dates = values
    .filter((value): value is string => Boolean(value))
    .map((value) => new Date(value))
    .filter((value) => !Number.isNaN(value.getTime()))
    .sort((left, right) => right.getTime() - left.getTime());

  return dates[0] ?? null;
}

function subscriptionState(subscriber: RevenueCatSubscriber) {
  const entitlement = subscriber.entitlements?.pro;
  const subscriptions = subscriber.subscriptions ?? {};
  const entitlementProduct = entitlement?.product_identifier ?? null;
  const subscriptionEntries = Object.entries(subscriptions);
  const selectedEntry = entitlementProduct
    ? subscriptionEntries.find(
        ([productId]) => productId === entitlementProduct,
      )
    : subscriptionEntries.sort((left, right) => {
        const leftDate = laterDate(
          left[1].grace_period_expires_date,
          left[1].expires_date,
        );
        const rightDate = laterDate(
          right[1].grace_period_expires_date,
          right[1].expires_date,
        );
        return (rightDate?.getTime() ?? 0) - (leftDate?.getTime() ?? 0);
      })[0];

  const productId = entitlementProduct ?? selectedEntry?.[0] ?? null;
  const subscription =
    selectedEntry?.[1] ?? (productId ? subscriptions[productId] : undefined);
  const expiresAt = laterDate(
    entitlement?.grace_period_expires_date,
    entitlement?.expires_date,
    subscription?.grace_period_expires_date,
    subscription?.expires_date,
  );
  const isActive =
    Boolean(entitlement) && (!expiresAt || expiresAt.getTime() > Date.now());
  const inGracePeriod = Boolean(
    subscription?.grace_period_expires_date &&
    new Date(subscription.grace_period_expires_date).getTime() > Date.now(),
  );
  const hasBillingIssue = Boolean(subscription?.billing_issues_detected_at);
  const wasCancelled = Boolean(subscription?.unsubscribe_detected_at);
  const wasRefunded = Boolean(subscription?.refunded_at);

  const status = !isActive
    ? "expired"
    : inGracePeriod
      ? "grace_period"
      : hasBillingIssue
        ? "billing_issue"
        : subscription?.period_type?.toLowerCase() === "trial"
          ? "trialing"
          : wasCancelled
            ? "cancelled"
            : "active";

  return {
    isActive,
    productId,
    subscription,
    expiresAt,
    status,
    willRenew: isActive && !wasCancelled && !wasRefunded,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const revenueCatKey = Deno.env.get("REVENUECAT_REST_API_KEY");
    const authorization = req.headers.get("authorization");

    if (!supabaseUrl || !anonKey || !serviceRoleKey || !revenueCatKey) {
      throw new Error("Required subscription sync secrets are missing");
    }
    if (!authorization) return json({ error: "Unauthorized" }, 401);

    const requestBody = await req.json().catch(() => ({}));
    const force = requestBody?.force === true;

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authorization } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const {
      data: { user },
      error: userError,
    } = await userClient.auth.getUser();

    if (userError || !user) return json({ error: "Unauthorized" }, 401);

    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    if (!force) {
      const [subscriptionResult, entitlementResult] = await Promise.all([
        admin
          .from("subscriptions")
          .select(
            "product_id,status,current_period_ends_at,will_renew,is_sandbox,management_url,last_verified_at",
          )
          .eq("user_id", user.id)
          .is("deleted_at", null)
          .order("last_verified_at", { ascending: false, nullsFirst: false })
          .limit(1)
          .maybeSingle(),
        admin
          .from("entitlements")
          .select("status,expires_at")
          .eq("user_id", user.id)
          .eq("identifier", "pro")
          .maybeSingle(),
      ]);

      if (subscriptionResult.error) throw subscriptionResult.error;
      if (entitlementResult.error) throw entitlementResult.error;

      const verifiedAt = subscriptionResult.data?.last_verified_at
        ? new Date(subscriptionResult.data.last_verified_at).getTime()
        : 0;
      const fresh = Date.now() - verifiedAt < 5 * 60_000;

      if (fresh) {
        const expiresAt = entitlementResult.data?.expires_at
          ? new Date(entitlementResult.data.expires_at)
          : null;
        const isPro =
          entitlementResult.data?.status === "active" &&
          (!expiresAt || expiresAt.getTime() > Date.now());

        return json({
          ok: true,
          cached: true,
          is_pro: isPro,
          product_id: subscriptionResult.data?.product_id ?? null,
          subscription_status: subscriptionResult.data?.status ?? null,
          current_period_ends_at:
            subscriptionResult.data?.current_period_ends_at ?? null,
          will_renew: subscriptionResult.data?.will_renew ?? null,
          is_sandbox: subscriptionResult.data?.is_sandbox ?? null,
          management_url: subscriptionResult.data?.management_url ?? null,
          verified_at: subscriptionResult.data?.last_verified_at,
        });
      }
    }

    const revenueCatResponse = await fetch(
      `https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(user.id)}`,
      {
        headers: {
          Authorization: `Bearer ${revenueCatKey}`,
          "Content-Type": "application/json",
        },
      },
    );

    if (!revenueCatResponse.ok) {
      const detail = await revenueCatResponse.text();
      console.error("RevenueCat customer lookup failed", {
        status: revenueCatResponse.status,
        detail,
      });
      return json(
        { error: "Subscription verification is temporarily unavailable" },
        502,
      );
    }

    const customer = await revenueCatResponse.json();
    const subscriber = (customer?.subscriber ?? {}) as RevenueCatSubscriber;
    const state = subscriptionState(subscriber);
    const verifiedAt = new Date().toISOString();
    let sourceSubscriptionId: string | null = null;

    if (state.productId || state.subscription) {
      const expirationKey = state.expiresAt?.toISOString() ?? "lifetime";
      const rawEventId = `reconcile:${user.id}:${state.productId ?? "unknown"}:${expirationKey}`;
      const { data: subscription, error: subscriptionError } = await admin
        .from("subscriptions")
        .upsert(
          {
            user_id: user.id,
            revenuecat_customer_id: subscriber.original_app_user_id ?? user.id,
            store: state.subscription?.store ?? null,
            product_id: state.productId,
            status: state.status,
            current_period_starts_at: state.subscription?.purchase_date ?? null,
            current_period_ends_at: state.expiresAt?.toISOString() ?? null,
            will_renew: state.willRenew,
            raw_event_id: rawEventId,
            is_sandbox: state.subscription?.is_sandbox ?? null,
            management_url: subscriber.management_url ?? null,
            last_verified_at: verifiedAt,
            updated_at: verifiedAt,
          },
          { onConflict: "raw_event_id" },
        )
        .select("id")
        .single();

      if (subscriptionError) {
        console.error("Subscription reconciliation failed", subscriptionError);
        return json({ error: "Could not update subscription access" }, 500);
      }

      sourceSubscriptionId = subscription.id;
    }

    const { error: entitlementError } = await admin.from("entitlements").upsert(
      {
        user_id: user.id,
        identifier: "pro",
        status: state.isActive ? "active" : "inactive",
        expires_at: state.expiresAt?.toISOString() ?? null,
        source_subscription_id: sourceSubscriptionId,
        updated_at: verifiedAt,
      },
      { onConflict: "user_id,identifier" },
    );

    if (entitlementError) {
      console.error("Entitlement reconciliation failed", entitlementError);
      return json({ error: "Could not update subscription access" }, 500);
    }

    if (state.isActive) {
      const circleUpgrade = await admin
        .from("circles")
        .update({ member_limit: 20, updated_at: verifiedAt })
        .eq("owner_id", user.id)
        .lt("member_limit", 20)
        .is("deleted_at", null);
      if (circleUpgrade.error) {
        console.error("Could not upgrade Pro circle limits", circleUpgrade.error);
      }
    }

    await admin.from("audit_logs").insert({
      actor_id: user.id,
      action: "revenuecat_entitlement_reconciled",
      entity_type: "subscription",
      entity_id: sourceSubscriptionId,
      after_state: {
        is_pro: state.isActive,
        product_id: state.productId,
        status: state.status,
        expires_at: state.expiresAt?.toISOString() ?? null,
        forced: force,
      },
    });

    return json({
      ok: true,
      cached: false,
      is_pro: state.isActive,
      product_id: state.productId,
      subscription_status: state.status,
      current_period_ends_at: state.expiresAt?.toISOString() ?? null,
      will_renew: state.willRenew,
      is_sandbox: state.subscription?.is_sandbox ?? null,
      management_url: subscriber.management_url ?? null,
      verified_at: verifiedAt,
    });
  } catch (error) {
    console.error("RevenueCat entitlement sync failed", error);
    return json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unexpected subscription sync error",
      },
      500,
    );
  }
});
