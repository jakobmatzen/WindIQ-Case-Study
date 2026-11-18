import { describe, expect, test } from "bun:test";
import {
  createWindiqSource,
  type ApiMast,
  type ApiMeasurement,
  type ApiMeasurementPage,
  type ApiSite,
  type ApiTurbine,
  type RetryEvent,
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

type FakeRequest = { url: URL; authorization: string | null; signal?: AbortSignal | null };

/**
 * A stand-in for the WindIQ API. `pages` maps a cursor ("" = first page) to the page body;
 * `failures` makes a request for that cursor fail with the given statuses first.
 * Each token request issues a new token: "token-1", "token-2", …
 * `intercept` answers a request before the regular handling when it returns something:
 * a response, a body that is not JSON, a hang, or a thrown network error.
 */
function fakeApi(options: {
  pages: Record<string, ApiMeasurementPage | unknown>;
  failures?: Record<string, number[]>;
  mast?: ApiMast;
  turbine?: ApiTurbine;
  site?: ApiSite;
  intercept?: (request: FakeRequest) => Response | Promise<Response> | undefined;
}) {
  const requests: FakeRequest[] = [];
  const failures = structuredClone(options.failures ?? {});
  let tokensIssued = 0;

  const fetch = async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input));
    const authorization = new Headers(init?.headers).get("authorization");
    const request = { url, authorization, signal: init?.signal };
    requests.push(request);

    const intercepted = options.intercept?.(request);
    if (intercepted) return intercepted;
    if (url.pathname === "/auth/token") {
      tokensIssued++;
      return Response.json({
        access_token: `token-${tokensIssued}`,
        token_type: "Bearer",
        expires_in: 3600,
      });
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
  const tokenRequests = () => requests.filter((r) => r.url.pathname === "/auth/token");
  return { fetch: fetch as typeof globalThis.fetch, requests, measurementRequests, tokenRequests };
}

function source(
  api: ReturnType<typeof fakeApi>,
  extra: Partial<Parameters<typeof createWindiqSource>[0]> = {},
) {
  return createWindiqSource({
    baseUrl: "https://windiq.test",
    clientId: "id",
    clientSecret: "secret",
    fetch: api.fetch,
    sleep: async () => {},
    ...extra,
  });
}

const mastBody: ApiMast = {
  id: "WIQ-MM-01",
  name: "Messmast Spreewald",
  latitude: 51.8732,
  longitude: 14.0412,
  measurement_height_m: 100,
  operator: "WindIQ",
  commissioned_at: "2023-04-01",
};

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

  test("fetches a new token once when the API rejects the current one (401)", async () => {
    // The token expired between two requests: the API rejects token-1, accepts token-2.
    const api = fakeApi({
      pages: {},
      mast: mastBody,
      intercept: ({ authorization }) =>
        authorization === "Bearer token-1"
          ? Response.json({ detail: "token expired" }, { status: 401 })
          : undefined,
    });

    const mast = await source(api).fetchMast();

    expect(mast.id).toBe("WIQ-MM-01");
    expect(api.tokenRequests()).toHaveLength(2);
    expect(
      api.requests.filter((r) => r.url.pathname === "/v1/mast").map((r) => r.authorization),
    ).toEqual(["Bearer token-1", "Bearer token-2"]);
  });

  test("gives up when the new token is rejected too", async () => {
    const api = fakeApi({
      pages: {},
      mast: mastBody,
      intercept: ({ url }) =>
        url.pathname === "/v1/mast"
          ? Response.json({ detail: "forbidden" }, { status: 401 })
          : undefined,
    });

    await expect(source(api).fetchMast()).rejects.toThrow("HTTP 401");
    expect(api.tokenRequests()).toHaveLength(2);
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

  test("asks for corrections updated since a given time, on every page", async () => {
    const api = fakeApi({
      pages: {
        "": { data: [apiReading("2026-01-01T00:00:00Z")], next_cursor: "b2Zmc2V0OjE" },
        b2Zmc2V0OjE: { data: [apiReading("2026-01-01T01:00:00Z")], next_cursor: null },
      },
    });

    await collect(
      source(api).fetchMeasurements({ updatedSince: new Date("2026-11-18T09:30:00Z") }),
    );

    expect(api.measurementRequests().map((r) => r.url.searchParams.get("updated_since"))).toEqual([
      "2026-11-18T09:30:00.000Z",
      "2026-11-18T09:30:00.000Z",
    ]);
    expect(api.measurementRequests()[0]?.url.searchParams.has("since")).toBe(false);
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

  test("rejects a measurement page without a list of readings", async () => {
    const api = fakeApi({ pages: { "": { data: "none", next_cursor: null } } });

    await expect(collect(source(api).fetchMeasurements({}))).rejects.toThrow(
      "WindIQ /v1/measurements: data must be a list",
    );
  });

  test("rejects a measurement page whose cursor is not text", async () => {
    const api = fakeApi({ pages: { "": { data: [], next_cursor: 42 } } });

    await expect(collect(source(api).fetchMeasurements({}))).rejects.toThrow(
      "WindIQ /v1/measurements: next_cursor must be a non-empty string or null",
    );
  });

  test("rejects a reading whose timestamp is not a date", async () => {
    const api = fakeApi({
      pages: { "": { data: [apiReading("yesterday")], next_cursor: null } },
    });

    await expect(collect(source(api).fetchMeasurements({}))).rejects.toThrow(
      "WindIQ /v1/measurements: data[0].timestamp must be a date and time",
    );
  });

  test("rejects a reading whose timestamp has no time zone", async () => {
    // Without an offset the hour depends on the server's time zone: duplicate or missing hours.
    const api = fakeApi({
      pages: { "": { data: [apiReading("2026-01-01T00:00:00")], next_cursor: null } },
    });

    await expect(collect(source(api).fetchMeasurements({}))).rejects.toThrow(
      "WindIQ /v1/measurements: data[0].timestamp must be a date and time",
    );
  });

  test("passes on a wind direction of an unexpected type as missing", async () => {
    // The direction is not used for the yield, so an odd value must not stop the sync.
    const reading = { ...apiReading("2026-01-01T00:00:00Z"), wind_direction_deg: "266" };
    const api = fakeApi({ pages: { "": { data: [reading], next_cursor: null } } });

    const [input] = await collect(source(api).fetchMeasurements({}));

    expect(input?.windDirectionDeg).toBeNull();
  });

  test("rejects a reading without a whole-number version", async () => {
    const reading = { ...apiReading("2026-01-01T00:00:00Z"), version: "2" };
    const api = fakeApi({ pages: { "": { data: [reading], next_cursor: null } } });

    await expect(collect(source(api).fetchMeasurements({}))).rejects.toThrow(
      "WindIQ /v1/measurements: data[0].version must be a number",
    );
  });

  test("passes on a wind speed of an unexpected type as text, for core to reject", async () => {
    // One odd value must not stop the sync: it is stored as unusable, with its raw value.
    const reading = { ...apiReading("2026-01-01T00:00:00Z"), wind_speed: true };
    const api = fakeApi({ pages: { "": { data: [reading], next_cursor: null } } });

    const [input] = await collect(source(api).fetchMeasurements({}));

    expect(input?.windSpeed).toBe("true");
  });

  test("rejects a body that is not JSON, e.g. an error page from a proxy", async () => {
    const api = fakeApi({
      pages: {},
      intercept: ({ url }) =>
        url.pathname === "/v1/mast" ? new Response("<html>Bad Gateway</html>") : undefined,
    });

    await expect(source(api).fetchMast()).rejects.toThrow(
      "WindIQ /v1/mast: response is not valid JSON",
    );
  });

  test("rejects a token response without a token", async () => {
    const api = fakeApi({
      pages: {},
      mast,
      intercept: ({ url }) =>
        url.pathname === "/auth/token" ? Response.json({ token_type: "Bearer" }) : undefined,
    });

    await expect(source(api).fetchMast()).rejects.toThrow(
      "WindIQ /auth/token: access_token must be a non-empty string",
    );
  });

  test("rejects a body that is not an object", async () => {
    const api = fakeApi({ pages: {}, site: null as unknown as ApiSite });

    await expect(source(api).fetchSite()).rejects.toThrow("WindIQ /v1/site: expected an object");
  });
});

/** A request that never answers; it ends only when the caller aborts it. */
function hang(signal: AbortSignal | null | undefined): Promise<Response> {
  return new Promise((_, reject) => {
    signal?.addEventListener("abort", () => reject(signal.reason));
  });
}

describe("WindIQ source: outages", () => {
  test("aborts a request that takes too long and tries again", async () => {
    let mastRequests = 0;
    const api = fakeApi({
      pages: {},
      mast: mastBody,
      intercept: ({ url, signal }) =>
        url.pathname === "/v1/mast" && ++mastRequests === 1 ? hang(signal) : undefined,
    });

    const mast = await source(api, { timeoutMs: 10 }).fetchMast();

    expect(mast.id).toBe("WIQ-MM-01");
    expect(mastRequests).toBe(2);
  });

  test("names the timeout when every attempt hangs", async () => {
    const api = fakeApi({
      pages: {},
      mast: mastBody,
      intercept: ({ url, signal }) => (url.pathname === "/v1/mast" ? hang(signal) : undefined),
    });

    await expect(source(api, { timeoutMs: 10 }).fetchMast()).rejects.toThrow(
      "WindIQ GET /v1/mast failed after 4 attempts: no answer within 10 ms",
    );
  });

  test("waits longer after each failed attempt", async () => {
    const delays: number[] = [];
    const api = fakeApi({
      pages: { "": { data: [], next_cursor: null } },
      failures: { "": [503, 502, 500] },
    });

    await collect(source(api, { sleep: async (ms) => void delays.push(ms) }).fetchMeasurements({}));

    expect(delays).toEqual([1_000, 2_000, 4_000]);
  });

  test("retries when rate limited (429), waiting as long as Retry-After asks", async () => {
    const delays: number[] = [];
    let mastRequests = 0;
    const api = fakeApi({
      pages: {},
      mast: mastBody,
      intercept: ({ url }) =>
        url.pathname === "/v1/mast" && ++mastRequests === 1
          ? new Response(null, { status: 429, headers: { "retry-after": "7" } })
          : undefined,
    });

    const mast = await source(api, { sleep: async (ms) => void delays.push(ms) }).fetchMast();

    expect(mast.id).toBe("WIQ-MM-01");
    expect(delays).toEqual([7_000]);
  });

  test("never waits longer than a minute, whatever Retry-After asks", async () => {
    const delays: number[] = [];
    let mastRequests = 0;
    const api = fakeApi({
      pages: {},
      mast: mastBody,
      intercept: ({ url }) =>
        url.pathname === "/v1/mast" && ++mastRequests === 1
          ? new Response(null, { status: 429, headers: { "retry-after": "3600" } })
          : undefined,
    });

    await source(api, { sleep: async (ms) => void delays.push(ms) }).fetchMast();

    expect(delays).toEqual([60_000]);
  });

  test("never waits less than the backoff, even when Retry-After says 0", async () => {
    const delays: number[] = [];
    let mastRequests = 0;
    const api = fakeApi({
      pages: {},
      mast: mastBody,
      intercept: ({ url }) =>
        url.pathname === "/v1/mast" && ++mastRequests === 1
          ? new Response(null, { status: 429, headers: { "retry-after": "0" } })
          : undefined,
    });

    await source(api, { sleep: async (ms) => void delays.push(ms) }).fetchMast();

    expect(delays).toEqual([1_000]);
  });

  test("retries after a network error", async () => {
    let mastRequests = 0;
    const api = fakeApi({
      pages: {},
      mast: mastBody,
      intercept: ({ url }) => {
        if (url.pathname === "/v1/mast" && ++mastRequests === 1)
          throw new TypeError("fetch failed");
        return undefined;
      },
    });

    const mast = await source(api).fetchMast();

    expect(mast.id).toBe("WIQ-MM-01");
  });

  test("reports every retry, so the worker can log it", async () => {
    const retries: RetryEvent[] = [];
    const api = fakeApi({
      pages: { "": { data: [], next_cursor: null } },
      failures: { "": [503] },
    });

    await collect(source(api, { onRetry: (r) => void retries.push(r) }).fetchMeasurements({}));

    expect(retries).toEqual([
      { request: "GET /v1/measurements", attempt: 1, problem: "HTTP 503", delayMs: 1_000 },
    ]);
  });

  test("does not retry a client error such as 404", async () => {
    const api = fakeApi({ pages: {} }); // no mast configured: the API answers 404

    await expect(source(api).fetchMast()).rejects.toThrow("WindIQ GET /v1/mast failed: HTTP 404");
    expect(api.requests.filter((r) => r.url.pathname === "/v1/mast")).toHaveLength(1);
  });

  test("fails the run when the token request keeps failing", async () => {
    const api = fakeApi({
      pages: {},
      mast: mastBody,
      intercept: ({ url }) =>
        url.pathname === "/auth/token" ? new Response(null, { status: 503 }) : undefined,
    });

    await expect(source(api).fetchMast()).rejects.toThrow(
      "WindIQ POST /auth/token failed after 4 attempts: HTTP 503",
    );
  });
});
