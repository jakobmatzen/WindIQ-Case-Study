import { describe, expect, test } from "bun:test";
import {
  createWindiqSource,
  type ApiMast,
  type ApiMeasurement,
  type ApiMeasurementPage,
} from "./windiq";

const apiReading = (
  timestamp: string,
  wind_speed: ApiMeasurement["wind_speed"] = 5,
): ApiMeasurement => ({
  timestamp,
  wind_speed,
  unit: "m/s",
  wind_direction_deg: 270,
  version: 1,
  updated_at: timestamp,
});

/**
 * A stand-in for the WindIQ API. `pages` maps a cursor ("" = first page) to the page body;
 * `failures` makes a request for that cursor fail with the given statuses first.
 */
function fakeApi(options: {
  pages: Record<string, ApiMeasurementPage>;
  failures?: Record<string, number[]>;
  mast?: ApiMast;
}) {
  const requests: { url: URL; authorization: string | null }[] = [];
  const failures = structuredClone(options.failures ?? {});

  const fetch = async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input));
    const authorization = new Headers(init?.headers).get("authorization");
    requests.push({ url, authorization });

    if (url.pathname === "/auth/token") {
      return Response.json({ access_token: "token-1", token_type: "Bearer", expires_in: 3600 });
    }
    if (url.pathname === "/v1/mast" && options.mast) return Response.json(options.mast);
    if (url.pathname === "/v1/measurements") {
      const cursor = url.searchParams.get("cursor") ?? "";
      const failure = failures[cursor]?.shift();
      if (failure) return Response.json({ detail: "Service Unavailable" }, { status: failure });
      const page = options.pages[cursor];
      if (!page) return Response.json({ detail: "unknown cursor" }, { status: 400 });
      return Response.json(page);
    }
    return Response.json({ detail: "not found" }, { status: 404 });
  };

  const measurementRequests = () => requests.filter((r) => r.url.pathname === "/v1/measurements");
  return { fetch: fetch as typeof globalThis.fetch, requests, measurementRequests };
}

function source(api: ReturnType<typeof fakeApi>) {
  return createWindiqSource({
    baseUrl: "https://windiq.test",
    clientId: "id",
    clientSecret: "secret",
    fetch: api.fetch,
    sleep: async () => {},
  });
}

async function collect<T>(pages: AsyncIterable<T[]>): Promise<T[]> {
  const all: T[] = [];
  for await (const page of pages) all.push(...page);
  return all;
}

describe("WindIQ source: mast", () => {
  test("reads the measurement mast", async () => {
    const api = fakeApi({
      pages: {},
      mast: {
        id: "WIQ-MM-01",
        name: "Messmast Spreewald",
        latitude: 51.8732,
        longitude: 14.0412,
        measurement_height_m: 100.0,
        operator: "WindIQ",
        commissioned_at: "2023-04-01",
      },
    });

    const mast = await source(api).fetchMast();

    expect(mast).toEqual({
      id: "WIQ-MM-01",
      name: "Messmast Spreewald",
      latitude: 51.8732,
      longitude: 14.0412,
      measurementHeightM: 100,
      operator: "WindIQ",
      commissionedAt: "2023-04-01",
    });
  });
});

describe("WindIQ source: measurements", () => {
  test("pages through all readings until next_cursor is null", async () => {
    const api = fakeApi({
      pages: {
        "": { data: [apiReading("2026-01-01T00:00:00Z")], next_cursor: "b2Zmc2V0OjE" },
        b2Zmc2V0OjE: { data: [apiReading("2026-01-01T01:00:00Z", "6.5")], next_cursor: null },
      },
    });

    const readings = await collect(source(api).fetchMeasurements({}));

    expect(readings).toEqual([
      {
        timestamp: "2026-01-01T00:00:00Z",
        windSpeed: 5,
        unit: "m/s",
        windDirectionDeg: 270,
        version: 1,
        updatedAt: "2026-01-01T00:00:00Z",
      },
      {
        timestamp: "2026-01-01T01:00:00Z",
        windSpeed: "6.5",
        unit: "m/s",
        windDirectionDeg: 270,
        version: 1,
        updatedAt: "2026-01-01T01:00:00Z",
      },
    ]);
    expect(api.measurementRequests().map((r) => r.authorization)).toEqual([
      "Bearer token-1",
      "Bearer token-1",
    ]);
  });

  test("asks only for readings since the given hour", async () => {
    const api = fakeApi({ pages: { "": { data: [], next_cursor: null } } });

    await collect(source(api).fetchMeasurements({ since: new Date("2026-11-17T20:00:00Z") }));

    expect(api.measurementRequests()[0]?.url.searchParams.get("since")).toBe(
      "2026-11-17T20:00:00.000Z",
    );
  });

  test("retries a page that fails with 503, using the same cursor", async () => {
    // Seen in the real API: one 503 in the middle of paging through the year.
    const api = fakeApi({
      pages: {
        "": { data: [apiReading("2026-01-01T00:00:00Z")], next_cursor: "page-2" },
        "page-2": { data: [apiReading("2026-01-01T01:00:00Z")], next_cursor: null },
      },
      failures: { "page-2": [503] },
    });

    const readings = await collect(source(api).fetchMeasurements({}));

    expect(readings.map((r) => r.timestamp)).toEqual([
      "2026-01-01T00:00:00Z",
      "2026-01-01T01:00:00Z",
    ]);
    expect(api.measurementRequests().map((r) => r.url.searchParams.get("cursor"))).toEqual([
      null,
      "page-2",
      "page-2",
    ]);
  });

  test("gives up after repeated 503s instead of looping forever", async () => {
    const api = fakeApi({
      pages: { "": { data: [], next_cursor: null } },
      failures: { "": [503, 503, 503, 503, 503] },
    });

    await expect(collect(source(api).fetchMeasurements({}))).rejects.toThrow("HTTP 503");
  });
});
