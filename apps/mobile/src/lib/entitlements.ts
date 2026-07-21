export type EntitlementContext = {
  isPro: boolean;
  activeCircleCount: number;
  activeScheduleCount: number;
};
export function canCreateCircle(c: EntitlementContext) {
  return c.isPro || c.activeCircleCount < 1;
}
export function canJoinCircle(c: EntitlementContext) {
  return c.isPro || c.activeCircleCount < 1;
}
export function canCreateRecurringSchedule(c: EntitlementContext) {
  return c.isPro || c.activeScheduleCount < 1;
}
export function canSubmitProof() {
  return true;
}
