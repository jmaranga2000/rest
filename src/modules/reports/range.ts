import { addDays, businessDate, daysBetween, isIsoDate } from "@/platform/dates";
import { ValidationError } from "@/platform/errors";

export type Preset = "today" | "yesterday" | "7d" | "30d" | "month" | "custom";
export const PRESETS: { key: Exclude<Preset, "custom">; label: string }[] = [
  { key: "today", label: "Today" }, { key: "yesterday", label: "Yesterday" }, { key: "7d", label: "Last 7 days" },
  { key: "30d", label: "Last 30 days" }, { key: "month", label: "This month" },
];
export const MAX_RANGE_DAYS = 366;

export interface DateRange { preset: Preset; from: string; to: string; days: number; label: string }

/** Inclusive calendar-date range in the branch's timezone. Default: last 7 days. */
export function parseRange(input: { preset?: string; from?: string; to?: string }, timeZone: string, now: Date = new Date()): DateRange {
  const today = businessDate(now, timeZone);
  const make = (preset: Preset, from: string, to: string, label: string): DateRange => ({ preset, from, to, days: daysBetween(from, to) + 1, label });
  if (input.from || input.to) {
    const from = input.from ?? "";
    const to = input.to ?? "";
    if (!isIsoDate(from) || !isIsoDate(to)) throw new ValidationError("Enter the start and end dates as YYYY-MM-DD.");
    if (from > to) throw new ValidationError("The start date must be on or before the end date.");
    if (daysBetween(from, to) + 1 > MAX_RANGE_DAYS) throw new ValidationError(`Choose a range of at most ${MAX_RANGE_DAYS} days.`);
    return make("custom", from, to, `${from} → ${to}`);
  }
  switch (input.preset) {
    case "today": return make("today", today, today, "Today");
    case "yesterday": { const y = addDays(today, -1); return make("yesterday", y, y, "Yesterday"); }
    case "30d": return make("30d", addDays(today, -29), today, "Last 30 days");
    case "month": return make("month", `${today.slice(0, 8)}01`, today, "This month");
    default: return make("7d", addDays(today, -6), today, "Last 7 days");
  }
}
