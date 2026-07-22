import type { RedemptionStatus, WallMissDetail } from "../../types/domain";

export type WallTone = "danger" | "warning" | "success" | "dark" | "neutral";

export function wallStatusMeta(status: RedemptionStatus | null | undefined) {
  switch (status) {
    case "completed":
      return { label: "redeemed", tone: "success" as const };
    case "in_progress":
      return { label: "redeeming", tone: "warning" as const };
    case "available":
      return { label: "redemption available", tone: "dark" as const };
    case "expired":
      return { label: "expired", tone: "danger" as const };
    case "waived":
      return { label: "waived", tone: "neutral" as const };
    default:
      return { label: "missed", tone: "danger" as const };
  }
}

export function summarizeMemberWall(misses: WallMissDetail[]) {
  return misses.reduce(
    (summary, miss) => {
      const status = miss.redemption?.status;
      if (status === "completed") summary.redeemed += 1;
      if (status === "available" || status === "in_progress") {
        summary.openRedemptions += 1;
      }
      if (status === "expired") summary.expired += 1;
      return summary;
    },
    {
      missed: misses.length,
      redeemed: 0,
      openRedemptions: 0,
      expired: 0,
    },
  );
}

export function initials(displayName: string) {
  const parts = displayName.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  return parts
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}
