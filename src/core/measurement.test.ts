import { describe, expect, test } from "bun:test";
import fixture from "./__fixtures__/windiq-measurements.json";
import {
  checkMeasurement,
  compareWithStored,
  newestPerHour,
  nextCorrectionCursor,
  type MeasurementInput,
} from "./measurement";

/** A reading as the source adapter hands it over; overrides pick the case under test. */
function reading(overrides: Partial<MeasurementInput> = {}): MeasurementInput {
  return {
    timestamp: "2025-11-17T21:00:00Z",
    windSpeed: 5.98,
    unit: "m/s",
    windDirectionDeg: 266,
    version: 1,
    updatedAt: "2025-11-17T21:06:22Z",
    ...overrides,
  };
}

describe("checkMeasurement", () => {
  test("accepts a wind speed in m/s as it is", () => {
    const checked = checkMeasurement(reading());
    expect(checked.status).toBe("valid");
    expect(checked.windSpeedMs).toBe(5.98);
  });

  test("rejects an empty wind speed as missing", () => {
    const checked = checkMeasurement(reading({ windSpeed: null }));
    expect(checked.status).toBe("missing");
    expect(checked.windSpeedMs).toBeNull();
  });

  test("accepts a wind speed sent as numeric text", () => {
    const checked = checkMeasurement(reading({ windSpeed: "6.69" }));
    expect(checked.status).toBe("valid");
    expect(checked.windSpeedMs).toBe(6.69);
  });

  test.each(["n/a", "", "  ", "6,69", "7.1 m/s"])("rejects text %p as unparseable", (text) => {
    const checked = checkMeasurement(reading({ windSpeed: text }));
    expect(checked.status).toBe("unparseable");
    expect(checked.windSpeedMs).toBeNull();
  });

  test.each([-999, "-999", "-999.0"])("rejects the error code %p as sentinel", (value) => {
    const checked = checkMeasurement(reading({ windSpeed: value }));
    expect(checked.status).toBe("sentinel");
    expect(checked.windSpeedMs).toBeNull();
  });

  test("converts km/h to m/s", () => {
    const checked = checkMeasurement(reading({ windSpeed: 18, unit: "km/h" }));
    expect(checked.status).toBe("valid");
    expect(checked.windSpeedMs).toBeCloseTo(5, 10);
  });

  test.each(["kn", "mph", "", "M/S"])("rejects the unit %p as unknown", (unit) => {
    const checked = checkMeasurement(reading({ unit }));
    expect(checked.status).toBe("unknown_unit");
    expect(checked.windSpeedMs).toBeNull();
  });

  test.each([0, 40])("accepts %p m/s at the edge of the plausible range", (value) => {
    expect(checkMeasurement(reading({ windSpeed: value })).status).toBe("valid");
  });

  test.each([-0.1, 40.01, 83.07])("rejects %p m/s as out of range", (value) => {
    const checked = checkMeasurement(reading({ windSpeed: value }));
    expect(checked.status).toBe("out_of_range");
    expect(checked.windSpeedMs).toBeNull();
  });

  test("applies the range after converting km/h", () => {
    // 150 km/h ≈ 41.7 m/s, above the limit although the raw number is not.
    expect(checkMeasurement(reading({ windSpeed: 150, unit: "km/h" })).status).toBe("out_of_range");
  });

  test.each([
    ["2026-07-19T02:00:00+02:00", "2026-07-19T00:00:00.000Z"],
    ["2026-07-19T00:00:00+00:00", "2026-07-19T00:00:00.000Z"],
    ["2026-07-19T00:00:00Z", "2026-07-19T00:00:00.000Z"],
  ])("normalises the hour %p to UTC", (timestamp, utc) => {
    expect(checkMeasurement(reading({ timestamp })).hour.toISOString()).toBe(utc);
  });

  test("keeps the raw reading next to the result, for traceability", () => {
    const checked = checkMeasurement(
      reading({
        windSpeed: "18.43",
        unit: "km/h",
        version: 2,
        updatedAt: "2025-12-11T08:00:00+01:00",
      }),
    );
    expect(checked).toMatchObject({
      rawValue: "18.43",
      unit: "km/h",
      version: 2,
      windDirectionDeg: 266,
    });
    expect(checked.updatedAt.toISOString()).toBe("2025-12-11T07:00:00.000Z");
  });
});

describe("checkMeasurement on real WindIQ data", () => {
  // 31 readings from a full API export (17.11.2026), picked to cover every case.
  // Expected rejections were labelled by hand from the raw values.
  const checked = fixture.map((r) =>
    checkMeasurement({
      timestamp: r.timestamp,
      windSpeed: r.wind_speed,
      unit: r.unit,
      windDirectionDeg: r.wind_direction_deg,
      version: r.version,
      updatedAt: r.updated_at,
    }),
  );
  const rejected = (status: string) =>
    checked.filter((c) => c.status === status).map((c) => c.hour.toISOString());

  test("rejects exactly the empty readings, error codes and spikes", () => {
    expect(rejected("missing")).toEqual([
      "2025-12-01T22:00:00.000Z",
      "2025-12-28T08:00:00.000Z",
      "2026-01-03T01:00:00.000Z",
    ]);
    expect(rejected("sentinel")).toEqual([
      "2025-11-21T17:00:00.000Z",
      "2025-11-22T02:00:00.000Z",
      "2025-11-24T14:00:00.000Z",
    ]);
    expect(rejected("out_of_range")).toEqual([
      "2025-12-07T15:00:00.000Z",
      "2025-12-21T23:00:00.000Z",
      "2026-02-09T14:00:00.000Z",
    ]);
    expect(rejected("valid")).toHaveLength(22);
  });

  test("converts the real km/h readings", () => {
    const kmh = checked.find((c) => c.hour.toISOString() === "2025-12-09T18:00:00.000Z");
    expect(kmh?.windSpeedMs).toBeCloseTo(5.119, 3); // 18.43 km/h
  });

  test("puts the summer readings sent as +02:00 on the right UTC hour", () => {
    const summer = checked.find((c) => c.hour.toISOString() === "2026-07-19T00:00:00.000Z");
    expect(summer?.windSpeedMs).toBe(1.05);
  });
});

describe("newestPerHour", () => {
  test("keeps one reading per UTC hour, the highest version", () => {
    const readings = [
      checkMeasurement(reading({ timestamp: "2026-03-02T20:00:00Z", windSpeed: 4.8, version: 1 })),
      checkMeasurement(
        reading({ timestamp: "2026-03-02T22:00:00+02:00", windSpeed: 5.1, version: 2 }),
      ),
      checkMeasurement(reading({ timestamp: "2026-03-02T21:00:00Z", windSpeed: 3, version: 1 })),
    ];
    expect(newestPerHour(readings).map((r) => [r.hour.toISOString(), r.windSpeedMs])).toEqual([
      ["2026-03-02T20:00:00.000Z", 5.1],
      ["2026-03-02T21:00:00.000Z", 3],
    ]);
  });

  test("collapses the same hour sent once as Z and once as +00:00", () => {
    // Seen 19 times in the real API export: identical readings, two spellings of UTC.
    const readings = [
      checkMeasurement(reading({ timestamp: "2026-03-02T20:00:00Z" })),
      checkMeasurement(reading({ timestamp: "2026-03-02T20:00:00+00:00" })),
    ];
    expect(newestPerHour(readings)).toHaveLength(1);
  });
});

describe("compareWithStored", () => {
  const hour = "2026-03-02T20:00:00Z";
  const stored = (version: number) => new Map([[new Date(hour).getTime(), version]]);

  test("a newer version replaces the stored one and counts as a correction", () => {
    const v2 = checkMeasurement(reading({ timestamp: hour, windSpeed: 6.4, version: 2 }));

    const result = compareWithStored([v2], stored(1));

    expect(result.corrected).toEqual([v2]);
    expect(result.added).toEqual([]);
  });

  test("an older or equal version does not replace the stored one", () => {
    const v1 = checkMeasurement(reading({ timestamp: hour, version: 1 }));
    const v2 = checkMeasurement(reading({ timestamp: hour, version: 2 }));

    expect(compareWithStored([v1], stored(2))).toEqual({ added: [], corrected: [] });
    expect(compareWithStored([v2], stored(2))).toEqual({ added: [], corrected: [] });
  });

  test("an hour not stored yet is added, not counted as a correction", () => {
    const fresh = checkMeasurement(reading({ timestamp: "2026-03-02T21:00:00Z" }));

    expect(compareWithStored([fresh], stored(1))).toEqual({ added: [fresh], corrected: [] });
  });
});

describe("nextCorrectionCursor", () => {
  const now = new Date("2026-11-18T12:00:00Z");
  const updated = (updatedAt: string) => checkMeasurement(reading({ updatedAt }));

  test("moves to the newest updated_at of the page", () => {
    const page = [updated("2026-11-18T10:00:00Z"), updated("2026-11-18T11:30:00Z")];

    expect(nextCorrectionCursor(new Date("2026-11-18T09:00:00Z"), page, now)).toEqual(
      new Date("2026-11-18T11:30:00Z"),
    );
  });

  test("never moves back", () => {
    const current = new Date("2026-11-18T11:00:00Z");

    expect(nextCorrectionCursor(current, [updated("2026-11-17T08:00:00Z")], now)).toEqual(current);
    expect(nextCorrectionCursor(current, [], now)).toEqual(current);
  });

  test("never moves past now, so one bad updated_at cannot skip later corrections", () => {
    const page = [updated("2030-01-01T00:00:00Z")];

    expect(nextCorrectionCursor(new Date("2026-11-18T09:00:00Z"), page, now)).toEqual(now);
  });

  test("ignores an updated_at that is not a date", () => {
    const current = new Date("2026-11-18T09:00:00Z");

    expect(nextCorrectionCursor(current, [updated("yesterday")], now)).toEqual(current);
  });

  test("starts from the page when there is no cursor yet, or stays empty", () => {
    expect(nextCorrectionCursor(null, [updated("2026-11-18T10:00:00Z")], now)).toEqual(
      new Date("2026-11-18T10:00:00Z"),
    );
    expect(nextCorrectionCursor(null, [], now)).toBeNull();
  });
});
