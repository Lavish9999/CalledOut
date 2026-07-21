export type Signals = {
  freshCapture: boolean;
  liveness: boolean;
  withinWindow: boolean;
  locationMatch: boolean;
  healthMatch: boolean;
  integrityClean: boolean;
};
export function verificationScore(s: Signals) {
  return (
    (s.freshCapture ? 25 : 0) +
    (s.liveness ? 20 : 0) +
    (s.withinWindow ? 15 : 0) +
    (s.locationMatch ? 15 : 0) +
    (s.healthMatch ? 15 : 0) +
    (s.integrityClean ? 10 : 0)
  );
}
export function verificationOutcome(score: number) {
  return score >= 70
    ? "verified"
    : score >= 45
      ? "circle_review"
      : "more_proof_required";
}
