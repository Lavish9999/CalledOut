export const weekdayOptions = [
  { value: 0, short: "Sun", narrow: "S", long: "Sunday" },
  { value: 1, short: "Mon", narrow: "M", long: "Monday" },
  { value: 2, short: "Tue", narrow: "T", long: "Tuesday" },
  { value: 3, short: "Wed", narrow: "W", long: "Wednesday" },
  { value: 4, short: "Thu", narrow: "T", long: "Thursday" },
  { value: 5, short: "Fri", narrow: "F", long: "Friday" },
  { value: 6, short: "Sat", narrow: "S", long: "Saturday" },
] as const;

function joinNatural(values: string[]) {
  if (values.length <= 1) return values[0] ?? "";
  if (values.length === 2) return `${values[0]} and ${values[1]}`;
  return `${values.slice(0, -1).join(", ")}, and ${values.at(-1)}`;
}

export function formatWeekdaySelection(days: number[]) {
  const normalized = [...new Set(days)]
    .filter((day) => day >= 0 && day <= 6)
    .sort((left, right) => left - right);

  if (normalized.length === 7) return "Every day";

  const names = normalized.map(
    (day) => weekdayOptions.find((option) => option.value === day)?.long ?? "",
  );

  return normalized.length === 1
    ? `Every ${names[0]}`
    : `Every ${joinNatural(names)}`;
}

export function localDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function dateFromOffset(offset: number, baseDate = new Date()) {
  const next = new Date(baseDate);
  next.setHours(12, 0, 0, 0);
  next.setDate(next.getDate() + offset);
  return next;
}

export function oneTimeDateLabel(offset: number, baseDate = new Date()) {
  if (offset === 0) return "Today";
  if (offset === 1) return "Tomorrow";
  return new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "short",
    day: "numeric",
  }).format(dateFromOffset(offset, baseDate));
}

export function nextWeeklyDeadline(
  days: number[],
  deadlineHour: number,
  baseDate = new Date(),
) {
  const normalized = new Set(
    days.filter((day) => Number.isInteger(day) && day >= 0 && day <= 6),
  );

  if (!normalized.size || deadlineHour < 0 || deadlineHour > 23) return null;

  for (let offset = 0; offset <= 7; offset += 1) {
    const candidate = new Date(baseDate);
    candidate.setSeconds(0, 0);
    candidate.setDate(baseDate.getDate() + offset);
    candidate.setHours(deadlineHour, 0, 0, 0);

    if (
      normalized.has(candidate.getDay()) &&
      candidate.getTime() > baseDate.getTime()
    ) {
      return candidate;
    }
  }

  return null;
}

export function todayDeadlinePassed(
  days: number[],
  deadlineHour: number,
  baseDate = new Date(),
) {
  if (!days.includes(baseDate.getDay())) return false;

  const deadline = new Date(baseDate);
  deadline.setHours(deadlineHour, 0, 0, 0);
  return deadline.getTime() <= baseDate.getTime();
}

export function firstOccurrenceLabel(date: Date, baseDate = new Date()) {
  const start = new Date(baseDate);
  start.setHours(0, 0, 0, 0);
  const target = new Date(date);
  target.setHours(0, 0, 0, 0);
  const offset = Math.round((target.getTime() - start.getTime()) / 86_400_000);
  const time = new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
  }).format(date);

  if (offset === 0) return `Today at ${time}`;
  if (offset === 1) return `Tomorrow at ${time}`;

  const day = new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "short",
    day: "numeric",
  }).format(date);

  return `${day} at ${time}`;
}
