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
