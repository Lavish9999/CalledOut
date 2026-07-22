import type { CircleMember } from "../../types/domain";

export function circleCompletionRate(completed: number, missed: number) {
  const resolved = completed + missed;
  if (!resolved) return 0;
  return Math.round((completed / resolved) * 100);
}

export function rankCircleMembers(members: CircleMember[]) {
  return [...members].sort(
    (a, b) =>
      (b.circle_completion_rate ?? 0) - (a.circle_completion_rate ?? 0) ||
      (a.missed_count ?? 0) - (b.missed_count ?? 0) ||
      (b.completed_count ?? 0) - (a.completed_count ?? 0) ||
      a.profile.display_name.localeCompare(b.profile.display_name),
  );
}
