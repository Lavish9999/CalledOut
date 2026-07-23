import type { AccountabilityCoachInsights } from "../types/domain";

export function insightConfidence(resolvedCount: number) {
  if (resolvedCount < 3) {
    return {
      label: "Building baseline",
      detail: `${3 - resolvedCount} more resolved promise${3 - resolvedCount === 1 ? "" : "s"} for an early read`,
      progress: Math.min(1, resolvedCount / 3),
    };
  }

  if (resolvedCount < 10) {
    return {
      label: "Early read",
      detail: `${10 - resolvedCount} more resolved promise${10 - resolvedCount === 1 ? "" : "s"} for stronger confidence`,
      progress: resolvedCount / 10,
    };
  }

  if (resolvedCount < 25) {
    return {
      label: "Reliable pattern",
      detail: `${resolvedCount} resolved promises analyzed`,
      progress: Math.min(1, resolvedCount / 25),
    };
  }

  return {
    label: "High confidence",
    detail: `${resolvedCount} resolved promises analyzed`,
    progress: 1,
  };
}

export function reliabilityLabel(rate: number, total: number) {
  if (total < 3) return "Building";
  if (rate >= 90) return "Excellent";
  if (rate >= 75) return "Strong";
  if (rate >= 60) return "Mixed";
  return "At risk";
}

export function formatProofLead(minutes: number | null) {
  if (minutes === null) return "Not enough proof data";
  if (minutes < 60) return `${Math.round(minutes)} min early`;

  const hours = minutes / 60;
  const rounded = hours >= 10 ? Math.round(hours) : Math.round(hours * 10) / 10;
  return `${rounded} hr${rounded === 1 ? "" : "s"} early`;
}

export function buildCoachRead(insights: AccountabilityCoachInsights) {
  if (insights.last30Total < 3) {
    const remaining = 3 - insights.last30Total;
    return {
      title: "Build a trustworthy baseline",
      body: `Keep ${remaining} more promise${remaining === 1 ? "" : "s"} to unlock a useful read on your schedule, workout type, and deadline habits.`,
      action: "Keep your next promise exactly as scheduled.",
    };
  }

  if (insights.trendDelta !== null && insights.trendDelta <= -10) {
    const weakDay = insights.weakestWeekday?.name;
    return {
      title: "Your momentum needs protection",
      body: `Your 30-day consistency is down ${Math.abs(Math.round(insights.trendDelta))} points from the prior period.${weakDay ? ` ${weakDay} is currently your least reliable day.` : ""}`,
      action: weakDay
        ? `Move one high-pressure ${weakDay} promise to your strongest window or shorten its minimum duration.`
        : "Reduce one commitment before adding another.",
    };
  }

  if (insights.last30CompletionRate >= 90) {
    const pieces = [
      insights.strongestWorkout?.name,
      insights.bestWeekday?.name,
      insights.bestDeadlineWindow?.name
        ? `${insights.bestDeadlineWindow.name.toLowerCase()} deadlines`
        : null,
    ].filter(Boolean);

    return {
      title: "Your system is working",
      body: `You kept ${insights.last30Completed} of ${insights.last30Total} promises in the last 30 days.${pieces.length ? ` Your strongest setup so far is ${pieces.join(" · ")}.` : ""}`,
      action: "Protect this pattern before increasing your weekly commitment load.",
    };
  }

  if (
    insights.weakestWeekday &&
    insights.bestWeekday &&
    insights.bestWeekday.rate - insights.weakestWeekday.rate >= 20
  ) {
    return {
      title: "One day is dragging the record",
      body: `${insights.bestWeekday.name} is your most reliable day at ${Math.round(insights.bestWeekday.rate)}%, while ${insights.weakestWeekday.name} is at ${Math.round(insights.weakestWeekday.rate)}%.`,
      action: `Move one ${insights.weakestWeekday.name} promise or reduce its minimum duration.`,
    };
  }

  return {
    title: "Consistency is within reach",
    body: `You kept ${insights.last30Completed} of ${insights.last30Total} promises in the last 30 days.`,
    action: insights.bestDeadlineWindow
      ? `Favor ${insights.bestDeadlineWindow.name.toLowerCase()} deadlines, your strongest window so far.`
      : "Keep the schedule stable long enough to reveal a dependable pattern.",
  };
}
