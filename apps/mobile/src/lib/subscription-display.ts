import type { PlanOverview } from "../types/domain";

export function subscriptionPlanName(productId: string | null) {
  if (!productId) return "CalledOut Pro";
  const value = productId.toLowerCase();
  if (value.includes("annual") || value.includes("yearly"))
    return "Annual plan";
  if (value.includes("monthly")) return "Monthly plan";
  return "CalledOut Pro";
}

export function subscriptionStatusLabel(status: string | null) {
  switch (status) {
    case "trialing":
      return "Trial active";
    case "grace_period":
      return "Grace period";
    case "billing_issue":
      return "Billing issue";
    case "cancelled":
      return "Canceled";
    case "expired":
      return "Expired";
    case "active":
      return "Active";
    default:
      return "Active";
  }
}

export function subscriptionPeriodVerb(plan: PlanOverview) {
  if (plan.willRenew === false || plan.subscriptionStatus === "cancelled") {
    return "Access ends";
  }
  return "Renews";
}
