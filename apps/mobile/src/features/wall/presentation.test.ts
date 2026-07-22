import { describe, expect, it } from "vitest";

import {
  initials,
  summarizeMemberWall,
  wallStatusMeta,
} from "./presentation";
import type { WallMissDetail } from "../../types/domain";

const baseMiss = {
  id: "miss-1",
  commitment_id: "commitment-1",
  missed_at: "2026-07-20T12:00:00.000Z",
  redeemed_at: null,
  commitment: { title: "Workout", minimum_duration_minutes: 30 },
} satisfies Omit<WallMissDetail, "redemption">;

describe("wall presentation", () => {
  it("uses distinct semantics for redemption states", () => {
    expect(wallStatusMeta("completed")).toEqual({
      label: "redeemed",
      tone: "success",
    });
    expect(wallStatusMeta("available")).toEqual({
      label: "redemption available",
      tone: "dark",
    });
    expect(wallStatusMeta("expired")).toEqual({
      label: "expired",
      tone: "danger",
    });
  });

  it("summarizes misses without erasing redeemed records", () => {
    const misses: WallMissDetail[] = [
      { ...baseMiss, id: "1", redemption: { status: "completed", deadline_at: "2026-07-21T12:00:00.000Z", completed_at: "2026-07-21T10:00:00.000Z" } },
      { ...baseMiss, id: "2", redemption: { status: "available", deadline_at: "2026-07-22T12:00:00.000Z", completed_at: null } },
      { ...baseMiss, id: "3", redemption: { status: "in_progress", deadline_at: "2026-07-22T12:00:00.000Z", completed_at: null } },
      { ...baseMiss, id: "4", redemption: { status: "expired", deadline_at: "2026-07-19T12:00:00.000Z", completed_at: null } },
      { ...baseMiss, id: "5", redemption: null },
    ];

    expect(summarizeMemberWall(misses)).toEqual({
      missed: 5,
      redeemed: 1,
      openRedemptions: 2,
      expired: 1,
    });
  });

  it("creates compact initials", () => {
    expect(initials("Jordan Miles")).toBe("JM");
    expect(initials("Jordan")).toBe("J");
  });
});
