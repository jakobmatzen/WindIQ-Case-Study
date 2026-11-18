import { describe, expect, test } from "bun:test";
import {
  createWindiqSource,
  type ApiMast,
  type ApiMeasurement,
  type ApiMeasurementPage,
  type ApiSite,
  type ApiTurbine,
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
  turbine?: ApiTurbine;
  site?: ApiSite;
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
    if (url.pathname === "/v1/mast" && options.mast !== undefined)
      return Response.json(options.mast);
    if (url.pathname === "/v1/turbine" && options.turbine !== undefined)
      return Response.json(options.turbine);
    if (url.pathname === "/v1/site" && options.site !== undefined)
      return Response.json(options.site);
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

describe("WindIQ source: token", () => {
  test("shares one token between requests started at the same time", async () => {
    const api = fakeApi({
      pages: { "": { data: [], next_cursor: null } },
      mast: {
        id: "WIQ-MM-01",
        name: "Messmast Spreewald",
        latitude: 51.8732,
        longitude: 14.0412,
        measurement_height_m: 100,
        operator: "WindIQ",
        commissioned_at: "2023-04-01",
      },
    });
    const windiq = source(api);

    await Promise.all([windiq.fetchMast(), windiq.fetchMast(), windiq.fetchMast()]);

    expect(api.requests.filter((r) => r.url.pathname === "/auth/token")).toHaveLength(1);
  });
});

describe("WindIQ source: turbine and site", () => {
  test("reads the turbine with its power curve and version", async () => {
    const api = fakeApi({
      pages: {},
      turbine: {
        id: "WIQ-T36",
        name: "Referenzanlage 3,6 MW",
        rated_power_kw: 3600,
        hub_height_m: 140,
        rotor_diameter_m: 136,
        cut_in_wind_speed_ms: 3.0,
        cut_out_wind_speed_ms: 25.0,
        power_curve: [
          { wind_speed_ms: 3.0, power_kw: 55.0 },
          { wind_speed_ms: 4.0, power_kw: 180.0 },
        ],
        version: 47,
        updated_at: "2026-11-10T08:00:00Z",
      },
    });

    const turbine = await source(api).fetchTurbine();

    expect(turbine).toEqual({
      id: "WIQ-T36",
      name: "Referenzanlage 3,6 MW",
      ratedPowerKw: 3600,
      hubHeightM: 140,
      rotorDiameterM: 136,
      cutInWindSpeedMs: 3,
      cutOutWindSpeedMs: 25,
      powerCurve: [
        { windSpeedMs: 3, powerKw: 55 },
        { windSpeedMs: 4, powerKw: 180 },
      ],
      version: 47,
      updatedAt: "2026-11-10T08:00:00Z",
    });
  });

  test("reads the site with losses, uncertainty and version", async () => {
    const api = fakeApi({
      pages: {},
      site: {
        id: "WIQ-SITE-01",
        name: "Windpark Spreewald",
        mast_id: "WIQ-MM-01",
        shear_exponent: 0.2,
        losses: { availability: 0.03, electrical: 0.02, wake: 0.05 },
        uncertainty: 0.1,
        version: 12,
        updated_at: "2026-11-10T08:00:00Z",
      },
    });

    const site = await source(api).fetchSite();

    expect(site).toEqual({
      id: "WIQ-SITE-01",
      name: "Windpark Spreewald",
      mastId: "WIQ-MM-01",
      shearExponent: 0.2,
      losses: { availability: 0.03, electrical: 0.02, wake: 0.05 },
      uncertainty: 0.1,
      version: 12,
      updatedAt: "2026-11-10T08:00:00Z",
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

describe("WindIQ source: responses with an unexpected shape", () => {
  const mast: ApiMast = {
    id: "WIQ-MM-01",
    name: "Messmast Spreewald",
    latitude: 51.8732,
    longitude: 14.0412,
    measurement_height_m: 100,
    operator: "WindIQ",
    commissioned_at: "2023-04-01",
  };
  const turbine: ApiTurbine = {
    id: "WIQ-T36",
    name: "Referenzanlage 3,6 MW",
    rated_power_kw: 3600,
    hub_height_m: 140,
    rotor_diameter_m: 136,
    cut_in_wind_speed_ms: 3,
    cut_out_wind_speed_ms: 25,
    power_curve: [{ wind_speed_ms: 3, power_kw: 55 }],
    version: 47,
    updated_at: "2026-11-10T08:00:00Z",
  };
  const site: ApiSite = {
    id: "WIQ-SITE-01",
    name: "Windpark Spreewald",
    mast_id: "WIQ-MM-01",
    shear_exponent: 0.2,
    losses: { availability: 0.03, electrical: 0.02, wake: 0.05 },
    uncertainty: 0.1,
    version: 12,
    updated_at: "2026-11-10T08:00:00Z",
  };
  /** Sends a body the API types do not allow. */
  const broken = <T>(body: T, change: Record<string, unknown>) => ({ ...body, ...change }) as T;

  test("rejects a site whose uncertainty is not a number", async () => {
    const api = fakeApi({ pages: {}, site: broken(site, { uncertainty: "0.1" }) });

    await expect(source(api).fetchSite()).rejects.toThrow(
      "WindIQ /v1/site: uncertainty must be a number",
    );
  });

  test("rejects a site with a loss given in percent instead of as a share", async () => {
    const api = fakeApi({
      pages: {},
      site: broken(site, { losses: { availability: 3, electrical: 0.02, wake: 0.05 } }),
    });

    await expect(source(api).fetchSite()).rejects.toThrow(
      "WindIQ /v1/site: losses.availability must be a share between 0 and 1",
    );
  });

  test("rejects a turbine without a power curve", async () => {
    const api = fakeApi({ pages: {}, turbine: broken(turbine, { power_curve: undefined }) });

    await expect(source(api).fetchTurbine()).rejects.toThrow(
      "WindIQ /v1/turbine: power_curve must be a non-empty list",
    );
  });

  test("rejects a turbine whose power curve has a broken support point", async () => {
    const api = fakeApi({
      pages: {},
      turbine: broken(turbine, { power_curve: [{ wind_speed_ms: 3, power_kw: null }] }),
    });

    await expect(source(api).fetchTurbine()).rejects.toThrow(
      "WindIQ /v1/turbine: power_curve[0].power_kw must be a number",
    );
  });

  test("rejects a mast without a measurement height", async () => {
    const api = fakeApi({ pages: {}, mast: broken(mast, { measurement_height_m: 0 }) });

    await expect(source(api).fetchMast()).rejects.toThrow(
      "WindIQ /v1/mast: measurement_height_m must be greater than 0",
    );
  });

  test("rejects an uncertainty so high that P90 would be negative", async () => {
    const api = fakeApi({ pages: {}, site: broken(site, { uncertainty: 0.8 }) });

    await expect(source(api).fetchSite()).rejects.toThrow(
      "WindIQ /v1/site: uncertainty must be below 0.78, or P90 turns negative",
    );
  });

  test("rejects a turbine whose cut-in is above its cut-out", async () => {
    const api = fakeApi({
      pages: {},
      turbine: broken(turbine, { cut_in_wind_speed_ms: 25, cut_out_wind_speed_ms: 3 }),
    });

    await expect(source(api).fetchTurbine()).rejects.toThrow(
      "WindIQ /v1/turbine: cut_in_wind_speed_ms must be below cut_out_wind_speed_ms",
    );
  });

  test("rejects a power curve with negative power", async () => {
    const api = fakeApi({
      pages: {},
      turbine: broken(turbine, { power_curve: [{ wind_speed_ms: 3, power_kw: -50 }] }),
    });

    await expect(source(api).fetchTurbine()).rejects.toThrow(
      "WindIQ /v1/turbine: power_curve[0].power_kw must be 0 or more",
    );
  });

  test("rejects a body that is not an object", async () => {
    const api = fakeApi({ pages: {}, site: null as unknown as ApiSite });

    await expect(source(api).fetchSite()).rejects.toThrow("WindIQ /v1/site: expected an object");
  });
});
