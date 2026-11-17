import { describe, expect, test } from "bun:test";
import { calculateCoverage, rollingYear } from "./coverage";

const at = (iso: string) => new Date(iso);

describe("rollingYear", () => {
  test("spans the 8,760 hours up to and including the newest reading", () => {
    // Real API data: the newest hour on 17.11.2026 was 20:00 UTC, the oldest available 21:00 a year before.
    const window = rollingYear(at("2026-11-17T20:00:00Z"));
    expect(window.start.toISOString()).toBe("2025-11-17T21:00:00.000Z");
    expect(window.end.toISOString()).toBe("2026-11-17T20:00:00.000Z");
    expect(window.hours).toBe(8760);
  });
});

describe("calculateCoverage", () => {
  // Four hours: 00:00 valid, 01:00 error code, 02:00 no record at all, 03:00 valid.
  const window = { start: at("2026-01-01T00:00:00Z"), end: at("2026-01-01T03:00:00Z"), hours: 4 };

  test("counts valid, rejected and missing hours", () => {
    const coverage = calculateCoverage(
      [
        { hour: at("2026-01-01T00:00:00Z"), status: "valid" },
        { hour: at("2026-01-01T01:00:00Z"), status: "sentinel" },
        { hour: at("2026-01-01T03:00:00Z"), status: "valid" },
      ],
      window,
    );
    expect(coverage).toMatchObject({
      validHours: 2,
      rejectedHours: 1,
      missingHours: 1,
      ratio: 0.5,
    });
  });

  test("counts the first and last hour, but nothing outside the window", () => {
    const coverage = calculateCoverage(
      [
        { hour: at("2025-12-31T23:00:00Z"), status: "valid" }, // one hour too early
        { hour: at("2026-01-01T00:00:00Z"), status: "valid" }, // first hour
        { hour: at("2026-01-01T03:00:00Z"), status: "out_of_range" }, // last hour
        { hour: at("2026-01-01T04:00:00Z"), status: "valid" }, // one hour too late
      ],
      window,
    );
    expect(coverage).toMatchObject({ validHours: 1, rejectedHours: 1, missingHours: 2 });
  });
});
