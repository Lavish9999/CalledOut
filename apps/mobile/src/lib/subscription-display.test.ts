import { describe, expect, it } from "vitest";

import {
  subscriptionPlanName,
  subscriptionPeriodVerb,
  subscriptionStatusLabel,
} from "./subscription-display";
import type { PlanOverview } from "../types/domain";

const basePlan: PlanOverview = {
  isPro: true,
  activeCircleCount: 1,
  activeScheduleCount: 1,
  gracePassesRemaining: 2,
  circleLimit: 5,
  scheduleLimit: 5,
  memberLimit: 20,
  subscriptionStatus: "active",
  currentPeriodEndsAt: "2026-08-21T00:00:00Z",
  willRenew: true,
  productId: "calledout_annual",
  store: "app_store",
  isSandbox: false,
  managementUrl: null,
  lastVerifiedAt: null,
};

describe("subscription display helpers", () => {
  it("maps known product IDs to readable plan names", () => {
    expect(subscriptionPlanName("calledout_annual")).toBe("Annual plan");
    expect(subscriptionPlanName("calledout_monthly")).toBe("Monthly plan");
  });

  it("shows access ending when renewal is disabled", () => {
    expect(subscriptionPeriodVerb({ ...basePlan, willRenew: false })).toBe(
      "Access ends",
    );
  });

  it("formats subscription states", () => {
    expect(subscriptionStatusLabel("billing_issue")).toBe("Billing issue");
    expect(subscriptionStatusLabel("grace_period")).toBe("Grace period");
  });
});
