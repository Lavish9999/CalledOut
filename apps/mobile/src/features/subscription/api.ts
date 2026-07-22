import { supabase } from "../../lib/supabase";
import type { PlanOverview } from "../../types/domain";

function toPlanOverview(value: Record<string, unknown>): PlanOverview {
  return {
    isPro: Boolean(value.is_pro),
    activeCircleCount: Number(value.active_circle_count ?? 0),
    activeScheduleCount: Number(value.active_schedule_count ?? 0),
    gracePassesRemaining: Number(value.grace_passes_remaining ?? 0),
    circleLimit: Number(value.circle_limit ?? 1),
    scheduleLimit: Number(value.schedule_limit ?? 1),
    memberLimit: Number(value.member_limit ?? 8),
    subscriptionStatus:
      typeof value.subscription_status === "string"
        ? value.subscription_status
        : null,
    currentPeriodEndsAt:
      typeof value.current_period_ends_at === "string"
        ? value.current_period_ends_at
        : null,
    willRenew: typeof value.will_renew === "boolean" ? value.will_renew : null,
    productId: typeof value.product_id === "string" ? value.product_id : null,
    store: typeof value.store === "string" ? value.store : null,
    isSandbox: typeof value.is_sandbox === "boolean" ? value.is_sandbox : null,
    managementUrl:
      typeof value.management_url === "string" ? value.management_url : null,
    lastVerifiedAt:
      typeof value.last_verified_at === "string"
        ? value.last_verified_at
        : null,
  };
}

export async function getPlanOverview(): Promise<PlanOverview> {
  const { data, error } = await supabase.rpc("get_plan_overview");

  if (error) throw error;

  return toPlanOverview((data ?? {}) as Record<string, unknown>);
}

export async function syncRevenueCatEntitlement() {
  const { data, error } = await supabase.functions.invoke(
    "sync-revenuecat-entitlement",
    { body: {} },
  );

  if (error) throw error;
  if (!data?.ok) {
    throw new Error(
      typeof data?.error === "string"
        ? data.error
        : "Subscription access could not be verified.",
    );
  }

  return data as {
    ok: true;
    is_pro: boolean;
    product_id: string | null;
    subscription_status: string | null;
    current_period_ends_at: string | null;
    will_renew: boolean | null;
    is_sandbox: boolean | null;
    management_url: string | null;
    verified_at: string;
  };
}

export async function reconcilePlanAccess(options?: {
  expectPro?: boolean;
  attempts?: number;
  delayMs?: number;
}): Promise<PlanOverview> {
  const attempts = Math.max(1, options?.attempts ?? 2);
  const delayMs = Math.max(0, options?.delayMs ?? 700);
  let lastError: unknown;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      await syncRevenueCatEntitlement();
      const plan = await getPlanOverview();

      if (!options?.expectPro || plan.isPro) return plan;
      lastError = new Error("Pro access is still syncing.");
    } catch (error) {
      lastError = error;
    }

    if (attempt < attempts - 1 && delayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error("Subscription access could not be synchronized.");
}

export function planDisplayName(productId: string | null) {
  if (!productId) return "CalledOut Pro";
  if (productId.includes("annual") || productId.includes("yearly")) {
    return "Annual plan";
  }
  if (productId.includes("monthly")) return "Monthly plan";
  return "CalledOut Pro";
}
