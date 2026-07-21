import { describe, it, expect } from "vitest";
import { verificationOutcome, verificationScore } from "./scoring";
describe("proof scoring", () => {
  it("auto verifies trusted proof", () =>
    expect(
      verificationOutcome(
        verificationScore({
          freshCapture: true,
          liveness: true,
          withinWindow: true,
          locationMatch: false,
          healthMatch: false,
          integrityClean: true,
        }),
      ),
    ).toBe("verified"));
  it("routes ambiguous proof to review", () =>
    expect(verificationOutcome(50)).toBe("circle_review"));
  it("requests more proof below threshold", () =>
    expect(verificationOutcome(30)).toBe("more_proof_required"));
});
