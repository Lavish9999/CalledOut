import { describe, expect, it } from "vitest";

import {
  dateFromOffset,
  firstOccurrenceLabel,
  formatWeekdaySelection,
  localDateKey,
  nextWeeklyDeadline,
  oneTimeDateLabel,
  todayDeadlinePassed,
} from "./recurrence";

describe("recurrence helpers", () => {
  it("formats one and multiple weekdays clearly", () => {
    expect(formatWeekdaySelection([2])).toBe("Every Tuesday");
    expect(formatWeekdaySelection([1, 3, 5])).toBe(
      "Every Monday, Wednesday, and Friday",
    );
    expect(formatWeekdaySelection([0, 1, 2, 3, 4, 5, 6])).toBe("Every day");
  });

  it("creates a stable local date key", () => {
    expect(localDateKey(new Date(2026, 6, 21, 22, 30))).toBe("2026-07-21");
  });

  it("labels nearby one-time dates", () => {
    const base = new Date(2026, 6, 21, 9, 0);
    expect(oneTimeDateLabel(0, base)).toBe("Today");
    expect(oneTimeDateLabel(1, base)).toBe("Tomorrow");
    expect(oneTimeDateLabel(2, base)).toContain("Thursday");
    expect(dateFromOffset(2, base).getDate()).toBe(23);
  });

  it("skips a weekly deadline that already passed today", () => {
    const base = new Date(2026, 6, 21, 16, 0); // Tuesday at 4:00 PM
    const next = nextWeeklyDeadline([2], 15, base);

    expect(next).not.toBeNull();
    expect(next?.getDate()).toBe(28);
    expect(next?.getHours()).toBe(15);
    expect(todayDeadlinePassed([2], 15, base)).toBe(true);
    expect(firstOccurrenceLabel(next!, base)).toContain("Tuesday, Jul 28");
  });

  it("uses today's weekly deadline when it is still ahead", () => {
    const base = new Date(2026, 6, 21, 14, 0); // Tuesday at 2:00 PM
    const next = nextWeeklyDeadline([2], 15, base);

    expect(next?.getDate()).toBe(21);
    expect(next?.getHours()).toBe(15);
    expect(todayDeadlinePassed([2], 15, base)).toBe(false);
    expect(firstOccurrenceLabel(next!, base)).toBe("Today at 3:00 PM");
  });
});
