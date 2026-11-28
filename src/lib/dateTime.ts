import type { TimeDisplay } from "@/config/appSettings";

/** A date and time for people, in the time zone of this browser or in UTC; the text itself when it is not a date. */
export function formatDateTime(value: string, display: TimeDisplay = "local"): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return display === "utc" ? `${date.toISOString().slice(0, 19).replace("T", " ")} UTC` : date.toLocaleString();
}

/** The date alone, in the time zone of this browser or in UTC; the text itself when it is not a date. */
export function formatDate(value: string, display: TimeDisplay = "local"): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return display === "utc" ? `${date.toISOString().slice(0, 10)} UTC` : date.toLocaleDateString();
}
