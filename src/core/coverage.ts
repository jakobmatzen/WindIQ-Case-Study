/**
 * Data coverage: how many hours of a period have a usable reading.
 * Missing hours (no record at all) and rejected hours (record, but not usable) both count as not covered.
 * Pure, no I/O.
 */
import type { MeasurementStatus } from "./measurement";

export const HOUR_MS = 3_600_000;

/** Hours in the year an AEP refers to (leap years ignored on purpose). */
export const HOURS_PER_YEAR = 8760;

/** A period of whole hours; `start` and `end` are both the start of an hour and both included. */
export type HourWindow = { start: Date; end: Date; hours: number };

/** The rolling 12 months: the 8,760 hours ending with the newest reading. */
export function rollingYear(newestHour: Date): HourWindow {
  const start = new Date(newestHour.getTime() - (HOURS_PER_YEAR - 1) * HOUR_MS);
  return { start, end: newestHour, hours: HOURS_PER_YEAR };
}

/** Whether an hour lies inside the window, both ends included. */
export function isInWindow(hour: Date, window: HourWindow): boolean {
  const t = hour.getTime();
  return t >= window.start.getTime() && t <= window.end.getTime();
}

export type Coverage = {
  window: HourWindow;
  validHours: number;
  rejectedHours: number;
  missingHours: number;
  /** validHours / window.hours, between 0 and 1. */
  ratio: number;
};

export function calculateCoverage(
  readings: { hour: Date; status: MeasurementStatus }[],
  window: HourWindow,
): Coverage {
  let validHours = 0;
  let rejectedHours = 0;
  for (const { hour, status } of readings) {
    if (!isInWindow(hour, window)) continue;
    if (status === "valid") validHours++;
    else rejectedHours++;
  }
  const missingHours = window.hours - validHours - rejectedHours;
  return { window, validHours, rejectedHours, missingHours, ratio: validHours / window.hours };
}
