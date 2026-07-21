import { describe, it, expect } from "vitest";
import { deadlineWarning, proofResult } from "./notification-copy";
describe("notification copy", () => {
  it("uses direct 30-minute warning", () =>
    expect(deadlineWarning(25)).toContain("30 minutes"));
  it("never calls rejected proof infallible", () =>
    expect(proofResult("rejected")).toContain("dispute"));
});
