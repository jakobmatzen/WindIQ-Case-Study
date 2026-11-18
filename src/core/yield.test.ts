import { describe, expect, test } from "bun:test";
import { referenceSite, referenceTurbine } from "./__fixtures__/reference-turbine";
import { rollingYear, type HourWindow } from "./coverage";
import type { Mast } from "./mast";
import type { MeasurementStatus } from "./measurement";
import { calculateYield } from "./yield";

const HOUR_MS = 3_600_000;

/** Example mast from the WindIQ API docs: measures at 100 m. */
const mast: Mast = {
  id: "WIQ-MM-01",
  name: "Messmast Spreewald",
  latitude: 51.9,
  longitude: 14.1,
  measurementHeightM: 100,
  operator: "WindIQ",
  commissionedAt: "2025-01-01",
};

/** (140 / 100) ^ 0.2: wind at 100 m times this is wind at the 140 m hub. */
const HEIGHT_FACTOR = 1.06961;

/** A wind speed at 100 m that becomes exactly 8 m/s at the hub, where the curve gives 1,590 kW. */
const AT_8_MS_HUB = 8 / HEIGHT_FACTOR;

const newest = new Date("2026-11-17T23:00:00Z");
const year = rollingYear(newest);

type Reading = { hour: Date; status: MeasurementStatus; windSpeedMs: number | null };

/** One reading per hour of the window; `pick(i)` decides each hour (undefined = no record). */
function hours(window: HourWindow, pick: (i: number) => Omit<Reading, "hour"> | undefined) {
  const readings: Reading[] = [];
  for (let i = 0; i < window.hours; i++) {
    const reading = pick(i);
    if (reading)
      readings.push({ hour: new Date(window.start.getTime() + i * HOUR_MS), ...reading });
  }
  return readings;
}

const valid = (windSpeedMs: number) => ({ status: "valid" as const, windSpeedMs });
const rejected = { status: "sentinel" as const, windSpeedMs: null };

function yieldOf(readings: Reading[], window: HourWindow = year) {
  return calculateYield({ readings, window, mast, turbine: referenceTurbine, site: referenceSite });
}

describe("calculateYield", () => {
  test("meets the reference values of the API docs example", () => {
    const result = yieldOf(hours(year, () => valid(AT_8_MS_HUB)));

    expect(result.hubHeightFactor).toBeCloseTo(1.07, 2);
    // 1,590 kW for 8,760 h
    expect(result.grossAepMwh).toBeCloseTo(13_928.4, 1);
    // 0.97 × 0.98 × 0.95
    expect(result.netAepMwh / result.grossAepMwh).toBeCloseTo(0.9031, 4);
    expect(result.p50Mwh).toBe(result.netAepMwh);
    // 1 − 1.282 × 0.10
    expect(result.p90Mwh / result.p50Mwh).toBeCloseTo(0.8718, 4);
  });

  test("extrapolates to a full year when hours are missing or rejected", () => {
    // Every 4th hour has no record, every 4th is rejected: half the year is valid.
    const result = yieldOf(
      hours(year, (i) => (i % 4 === 0 ? undefined : i % 4 === 1 ? rejected : valid(AT_8_MS_HUB))),
    );

    expect(result.coverage.validHours).toBe(4380);
    expect(result.coverage.missingHours).toBe(2190);
    expect(result.coverage.rejectedHours).toBe(2190);
    // 1,590 kW for the 4,380 valid hours ...
    expect(result.measuredEnergyMwh).toBeCloseTo(6_964.2, 1);
    // ... is the same full year as without gaps
    expect(result.grossAepMwh).toBeCloseTo(13_928.4, 1);
  });

  test("leaves out readings outside the window", () => {
    const window: HourWindow = { start: newest, end: newest, hours: 1 };
    const result = yieldOf(
      [
        { hour: new Date(newest.getTime() - HOUR_MS), ...valid(20) },
        { hour: newest, ...valid(AT_8_MS_HUB) },
        { hour: new Date(newest.getTime() + HOUR_MS), ...valid(20) },
      ],
      window,
    );

    expect(result.measuredEnergyMwh).toBeCloseTo(1.59, 4);
  });

  test.each([
    [100, "ok"],
    [90, "ok"],
    [89, "uncertain"],
    [70, "uncertain"],
    [69, "not_meaningful"],
    [0, "not_meaningful"],
  ] as const)("with %i %% data coverage the result is %s", (percent, quality) => {
    const hundredHours: HourWindow = {
      start: year.start,
      end: new Date(year.start.getTime() + 99 * HOUR_MS),
      hours: 100,
    };
    const result = yieldOf(
      hours(hundredHours, (i) => (i < percent ? valid(AT_8_MS_HUB) : undefined)),
      hundredHours,
    );

    expect(result.coverage.ratio).toBeCloseTo(percent / 100, 6);
    expect(result.quality).toBe(quality);
  });

  test("records the window and the versions it was calculated with", () => {
    const turbine = { ...referenceTurbine, version: 47 };
    const site = { ...referenceSite, version: 12 };
    const result = calculateYield({ readings: [], window: year, mast, turbine, site });

    expect(result.coverage.window).toEqual(year);
    expect(result.basis).toEqual({
      mastId: "WIQ-MM-01",
      turbineId: "WIQ-T36",
      turbineVersion: 47,
      siteId: "WIQ-SITE-01",
      siteVersion: 12,
    });
  });

  test("is 0, not NaN, when no hour is valid", () => {
    const result = yieldOf(hours(year, () => rejected));

    expect(result.grossAepMwh).toBe(0);
    expect(result.p50Mwh).toBe(0);
    expect(result.p90Mwh).toBe(0);
  });
});
