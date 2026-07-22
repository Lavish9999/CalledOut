import { describe, expect, it } from "vitest";

import { circleCompletionRate, rankCircleMembers } from "./metrics";
import type { CircleMember } from "../../types/domain";

function member(
  name: string,
  completionRate: number,
  missed: number,
  completed: number,
): CircleMember {
  return {
    id: name,
    user_id: name,
    role: "member",
    joined_at: "2026-07-21T00:00:00.000Z",
    profile: {
      display_name: name,
      username: name.toLowerCase(),
      avatar_path: null,
    },
    circle_completion_rate: completionRate,
    missed_count: missed,
    completed_count: completed,
  };
}

describe("circle metrics", () => {
  it("calculates completion rate from resolved promises", () => {
    expect(circleCompletionRate(7, 3)).toBe(70);
    expect(circleCompletionRate(0, 0)).toBe(0);
  });

  it("ranks by consistency, then fewer misses, then completed promises", () => {
    const ranked = rankCircleMembers([
      member("Jordan", 80, 2, 8),
      member("Maya", 90, 1, 9),
      member("Chris", 80, 1, 7),
    ]);

    expect(ranked.map((entry) => entry.profile.display_name)).toEqual([
      "Maya",
      "Chris",
      "Jordan",
    ]);
  });
});
