import { describe, expect, it } from "vitest";

import {
  buildCoachRead,
  formatProofLead,
  insightConfidence,
  reliabilityLabel,
} from "./insight-coach";
import type { AccountabilityInsights } from "../types/domain";

const base: AccountabilityInsights = {
  resolvedCount: 10,
  completedCount: 8,
  missedCount: 2,
  completionRate: 80,
  last30Total: 5,
  last30Completed: 4,
  last30Missed: 1,
  last30CompletionRate: 80,
  prior30Total: 5,
  prior30CompletionRate: 80,
  trendDelta: 0,
  currentStreak: 2,
  longestStreak: 4,
  bestWeekday: { name: "Tuesday", total: 4, completed: 4, rate: 100 },
  weakestWeekday: { name: "Friday", total: 3, completed: 1, rate: 33.3 },
  strongestWorkout: { name: "gym", total: 5, completed: 5, rate: 100 },
  bestDeadlineWindow: { name: "Evening", total: 5, completed: 4, rate: 80 },
  weeklyTrend: [],
  averageProofLeadMinutes: 90,
  proofSampleCount: 4,
  redemptionResolvedCount: 1,
  redemptionCompletedCount: 1,
  redemptionOpenCount: 0,
  redemptionRate: 100,
};

describe("premium accountability insight helpers", () => {
  it("grades data confidence without overstating small samples", () => {
    expect(insightConfidence(2).label).toBe("Building baseline");
    expect(insightConfidence(4).label).toBe("Early read");
    expect(insightConfidence(12).label).toBe("Reliable pattern");
  });

  it("formats proof timing", () => {
    expect(formatProofLead(45)).toBe("45 min early");
    expect(formatProofLead(90)).toBe("1.5 hrs early");
    expect(formatProofLead(null)).toBe("Not enough proof data");
  });

  it("does not call a tiny perfect sample excellent", () => {
    expect(reliabilityLabel(100, 2)).toBe("Building");
    expect(reliabilityLabel(100, 4)).toBe("Excellent");
  });

  it("turns a weak weekday into an actionable coach read", () => {
    const read = buildCoachRead(base);
    expect(read.title).toBe("One day is dragging the record");
    expect(read.action).toContain("Friday");
  });

  it("recognizes a strong current system", () => {
    const read = buildCoachRead({
      ...base,
      last30Completed: 5,
      last30Missed: 0,
      last30CompletionRate: 100,
    });
    expect(read.title).toBe("Your system is working");
  });
});
