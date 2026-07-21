import { format, formatDistanceToNowStrict } from "date-fns";

export const deadlineLabel = (iso: string) =>
  formatDistanceToNowStrict(new Date(iso), { addSuffix: false });

export const timeLabel = (iso: string) => format(new Date(iso), "h:mm a");
export const shortDateLabel = (iso: string) => format(new Date(iso), "MMM d");
export const dateLabel = (iso: string) => format(new Date(iso), "MMMM d, yyyy");
export const dateHeading = (date = new Date()) => format(date, "EEEE, MMMM d");
