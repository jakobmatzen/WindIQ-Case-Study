import { describe, expect, test } from "bun:test";
import { referenceSite, referenceTurbine } from "./__fixtures__/reference-turbine";
import { rollingYear, type HourWindow } from "./coverage";
import type { Mast } from "./mast";
import type { MeasurementStatus } from "./measurement";
import { calculateYield, sameFingerprint, type YieldFingerprint } from "./yield";

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
      measurementHeightM: 100,
      turbineId: "WIQ-T36",
      turbineVersion: 47,
      siteId: "WIQ-SITE-01",
      siteVersion: 12,
    });
  });

  test("averages the wind at the mast over the valid hours in the window only", () => {
    const window: HourWindow = {
      start: newest,
      end: new Date(newest.getTime() + 3 * HOUR_MS),
      hours: 4,
    };
    const at = (i: number) => new Date(newest.getTime() + i * HOUR_MS);
    const result = yieldOf(
      [
        { hour: new Date(newest.getTime() - HOUR_MS), ...valid(30) }, // outside the window
        { hour: at(0), ...valid(4) },
        { hour: at(1), ...rejected },
        { hour: at(2), ...valid(8) },
        // hour 3 missing
      ],
      window,
    );

    expect(result.meanWindSpeedMs).toBe(6);
  });

  test("is 0, not NaN, when no hour is valid", () => {
    const result = yieldOf(hours(year, () => rejected));

    expect(result.grossAepMwh).toBe(0);
    expect(result.p50Mwh).toBe(0);
    expect(result.p90Mwh).toBe(0);
  });

  test("has no mean wind, rather than 0 m/s, when no hour is valid", () => {
    expect(yieldOf(hours(year, () => rejected)).meanWindSpeedMs).toBeNull();
  });
});

describe("calculateYield per month", () => {
  test("splits the rolling year into 13 UTC calendar months, the first and last partial", () => {
    // The window runs from 18 Nov 2025 00:00 to 17 Nov 2026 23:00 UTC.
    const { months } = yieldOf(hours(year, () => valid(AT_8_MS_HUB)));

    expect(months).toHaveLength(13);
    expect(months[0]?.month).toEqual(new Date("2025-11-01T00:00:00Z"));
    expect(months[0]?.hours).toBe(13 * 24);
    expect(months[3]?.month).toEqual(new Date("2026-02-01T00:00:00Z"));
    expect(months[3]?.hours).toBe(28 * 24);
    expect(months[12]?.month).toEqual(new Date("2026-11-01T00:00:00Z"));
    expect(months[12]?.hours).toBe(17 * 24);
  });

  test("adds up to gross AEP, even with gaps of different size per month", () => {
    const at = (i: number) => new Date(year.start.getTime() + i * HOUR_MS);
    const result = yieldOf(
      hours(year, (i) => {
        const hour = at(i);
        // 72 hours missing in April, every 10th hour rejected in January
        if (hour.getUTCMonth() === 3 && hour.getUTCDate() <= 3) return undefined;
        if (hour.getUTCMonth() === 0 && i % 10 === 0) return rejected;
        // windier in winter, so the gaps weigh differently
        return valid(hour.getUTCMonth() < 3 ? 9 : 5 + (i % 4));
      }),
    );

    const sum = result.months.reduce((total, m) => total + (m.energyMwh ?? 0), 0);
    expect(sum).toBeCloseTo(result.grossAepMwh, 6);
  });

  test("scales a month with a gap up to the full month", () => {
    // 1,590 kW every hour, but the first 72 hours of April have no record
    const result = yieldOf(
      hours(year, (i) => {
        const hour = new Date(year.start.getTime() + i * HOUR_MS);
        const gap = hour.getUTCMonth() === 3 && hour.getUTCDate() <= 3;
        return gap ? undefined : valid(AT_8_MS_HUB);
      }),
    );
    const april = result.months[5];

    expect(april?.month).toEqual(new Date("2026-04-01T00:00:00Z"));
    expect(april?.validHours).toBe(720 - 72);
    // 1.59 MWh × 720 h, as if April had no gap
    expect(april?.energyMwh).toBeCloseTo(1_144.8, 1);
  });

  test("has no energy, rather than 0 MWh, for a month without a valid hour", () => {
    const result = yieldOf(
      hours(year, (i) => {
        const hour = new Date(year.start.getTime() + i * HOUR_MS);
        return hour.getUTCMonth() === 3 ? rejected : valid(AT_8_MS_HUB);
      }),
    );

    expect(result.months[5]?.energyMwh).toBeNull();
  });
});

describe("calculateYield rejections", () => {
  test("counts rejected readings per reason, next to the hours without a record", () => {
    const reasons = ["missing", "sentinel", "out_of_range", "unparseable", "unknown_unit"] as const;
    const result = yieldOf(
      hours(year, (i) => {
        if (i < 10) return undefined; // 10 hours without a record
        if (i < 25) return { status: reasons[i % 5]!, windSpeedMs: null }; // 3 of each reason
        if (i < 27) return { status: "sentinel", windSpeedMs: null };
        return valid(AT_8_MS_HUB);
      }),
    );

    expect(result.rejections).toEqual({
      missing: 3,
      sentinel: 5,
      out_of_range: 3,
      unparseable: 3,
      unknown_unit: 3,
    });
    expect(result.coverage.missingHours).toBe(10);
  });
});

describe("sameFingerprint", () => {
  const inputs: YieldFingerprint = {
    mastId: "WIQ-MM-01",
    measurementHeightM: 100,
    turbineId: "WIQ-T-01",
    turbineVersion: 47,
    siteId: "WIQ-S-01",
    siteVersion: 47,
    windowEnd: new Date("2026-11-17T23:00:00Z"),
    readingsSyncedAt: new Date("2026-11-18T00:05:00Z"),
  };

  test("nothing changed: no new result", () => {
    expect(sameFingerprint(inputs, { ...inputs, windowEnd: new Date(inputs.windowEnd) })).toBe(
      true,
    );
  });

  test("a corrected reading in the window: new result", () => {
    const corrected = { ...inputs, readingsSyncedAt: new Date("2026-11-18T00:20:00Z") };
    expect(sameFingerprint(inputs, corrected)).toBe(false);
  });

  test("a new turbine or site version: new result", () => {
    expect(sameFingerprint(inputs, { ...inputs, turbineVersion: 48 })).toBe(false);
    expect(sameFingerprint(inputs, { ...inputs, siteVersion: 48 })).toBe(false);
  });

  test("a new hour, another measurement height or another turbine or site: new result", () => {
    expect(
      sameFingerprint(inputs, { ...inputs, windowEnd: new Date("2026-11-18T00:00:00Z") }),
    ).toBe(false);
    expect(sameFingerprint(inputs, { ...inputs, measurementHeightM: 120 })).toBe(false);
    expect(sameFingerprint(inputs, { ...inputs, turbineId: "WIQ-T-02" })).toBe(false);
    expect(sameFingerprint(inputs, { ...inputs, siteId: "WIQ-S-02" })).toBe(false);
  });

  test("no result yet: new result", () => {
    expect(sameFingerprint(null, inputs)).toBe(false);
  });
});
