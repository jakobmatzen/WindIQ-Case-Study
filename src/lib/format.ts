// German number and date formats for the dashboard (`7.512 MWh/a`, `98,2 %`), times in Europe/Berlin.

const TIME_ZONE = "Europe/Berlin";

const cache = new Map<string, Intl.NumberFormat>();
function numberFormat(options: Intl.NumberFormatOptions): Intl.NumberFormat {
  const key = JSON.stringify(options);
  let format = cache.get(key);
  if (!format) {
    format = new Intl.NumberFormat("de-DE", options);
    cache.set(key, format);
  }
  return format;
}

/** Whole number with thousands separator: 7.512 */
export function formatInt(value: number): string {
  return numberFormat({ maximumFractionDigits: 0 }).format(value);
}

/** Fixed decimals: 6,40 */
export function formatDecimal(value: number, digits: number): string {
  return numberFormat({ minimumFractionDigits: digits, maximumFractionDigits: digits }).format(
    value,
  );
}

/** A share as percent: 0.982 → 98,2 % */
export function formatPercent(share: number, digits = 1): string {
  return numberFormat({
    style: "percent",
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(share);
}

const dateTime = new Intl.DateTimeFormat("de-DE", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: TIME_ZONE,
});
const date = new Intl.DateTimeFormat("de-DE", { dateStyle: "medium", timeZone: TIME_ZONE });

/** 18.11.2026, 14:00 */
export function formatDateTime(value: Date): string {
  return dateTime.format(value);
}

/** 18.11.2026 */
export function formatDate(value: Date): string {
  return date.format(value);
}

const dayTime = new Intl.DateTimeFormat("de-DE", {
  day: "2-digit",
  month: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: TIME_ZONE,
});

/** 18.11., 21:09 */
export function formatDayTime(value: Date): string {
  return dayTime.format(value);
}

// Months are calendar months in UTC (see core/yield), so they are named in UTC too.
const monthYear = new Intl.DateTimeFormat("de-DE", {
  month: "short",
  year: "2-digit",
  timeZone: "UTC",
});
const monthLong = new Intl.DateTimeFormat("de-DE", {
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});
const monthLetter = new Intl.DateTimeFormat("de-DE", { month: "narrow", timeZone: "UTC" });

/** Nov 25 */
export function formatMonth(month: Date): string {
  return monthYear.format(month).replace(".", "");
}

/** November 2025 */
export function formatMonthLong(month: Date): string {
  return monthLong.format(month);
}

/** N */
export function formatMonthLetter(month: Date): string {
  return monthLetter.format(month);
}

/** How long ago, for a ticking label: gerade eben, vor 12 s, vor 3 min, vor 2 h */
export function formatAgo(seconds: number): string {
  if (seconds < 5) return "gerade eben";
  if (seconds < 60) return `vor ${Math.floor(seconds)} s`;
  if (seconds < 3600) return `vor ${Math.floor(seconds / 60)} min`;
  return `vor ${Math.floor(seconds / 3600)} h`;
}
