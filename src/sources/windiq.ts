import type { Mast } from "@/core/mast";
import type { MeasurementInput } from "@/core/measurement";
import type { Site } from "@/core/site";
import type { Turbine } from "@/core/turbine";
import { ShapeReader } from "./response-shape";
import type { MeasurementSource, SiteDataSource } from "./types";

/** Adapter for the WindIQ mock API (docs: <baseUrl>/docs). */

export type WindiqConfig = {
  baseUrl: string;
  clientId: string;
  clientSecret: string;
  fetch?: typeof globalThis.fetch;
  /** Waits between retries; injectable so tests run instantly. */
  sleep?: (ms: number) => Promise<void>;
};

/** Response shapes as the WindIQ API documents them (exported for the simulated API in tests). */
export type ApiMeasurement = {
  timestamp: string;
  wind_speed: number | string | null;
  unit: string;
  wind_direction_deg: number | null;
  version: number;
  updated_at: string;
};

export type ApiMast = {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  measurement_height_m: number;
  operator: string;
  commissioned_at: string;
};

export type ApiTurbine = {
  id: string;
  name: string;
  rated_power_kw: number;
  hub_height_m: number;
  rotor_diameter_m: number;
  cut_in_wind_speed_ms: number;
  cut_out_wind_speed_ms: number;
  power_curve: { wind_speed_ms: number; power_kw: number }[];
  version: number;
  updated_at: string;
};

export type ApiSite = {
  id: string;
  name: string;
  mast_id: string;
  shear_exponent: number;
  losses: { availability: number; electrical: number; wake: number };
  uncertainty: number;
  version: number;
  updated_at: string;
};

export type ApiMeasurementPage = { data: ApiMeasurement[]; next_cursor: string | null };

const PAGE_SIZE = 500;

/** Attempts per request when the API answers with a server error (5xx). */
const MAX_ATTEMPTS = 4;
const RETRY_BASE_DELAY_MS = 1_000;

export function createWindiqSource(config: WindiqConfig): MeasurementSource & SiteDataSource {
  const fetch = config.fetch ?? globalThis.fetch;
  const sleep = config.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  let token: string | undefined;

  async function getToken(): Promise<string> {
    if (token) return token;
    const response = await fetch(new URL("/auth/token", config.baseUrl), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ client_id: config.clientId, client_secret: config.clientSecret }),
    });
    if (!response.ok) throw new Error(`WindIQ token request failed: HTTP ${response.status}`);
    const body = (await response.json()) as { access_token: string };
    token = body.access_token;
    return token;
  }

  async function get(path: string, params: Record<string, string>): Promise<unknown> {
    const url = new URL(path, config.baseUrl);
    for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
    for (let attempt = 1; ; attempt++) {
      const response = await fetch(url, {
        headers: { authorization: `Bearer ${await getToken()}` },
      });
      if (response.ok) return response.json();
      if (response.status < 500 || attempt === MAX_ATTEMPTS) {
        throw new Error(`WindIQ GET ${path} failed: HTTP ${response.status}`);
      }
      await sleep(RETRY_BASE_DELAY_MS * 2 ** (attempt - 1));
    }
  }

  return {
    fetchMast: async () => toMast(await get("/v1/mast", {})),
    fetchTurbine: async () => toTurbine(await get("/v1/turbine", {})),
    fetchSite: async () => toSite(await get("/v1/site", {})),

    async *fetchMeasurements({ since }) {
      let cursor: string | null = null;
      do {
        // The cursor is an offset into the filtered result, so the filter goes along on every page.
        const params: Record<string, string> = { limit: String(PAGE_SIZE) };
        if (since) params.since = since.toISOString();
        if (cursor) params.cursor = cursor;
        // Shape of measurement pages is checked with JAK-14; readings are checked in core.
        const page = (await get("/v1/measurements", params)) as ApiMeasurementPage;
        yield page.data.map(toMeasurementInput);
        cursor = page.next_cursor;
      } while (cursor);
    },
  };
}

// Mappers check each field on the way in: a wrong shape fails the run with a clear message
// instead of turning into a NaN result. Field names follow the API types above.

function toMast(body: unknown): Mast {
  const m = ShapeReader.of("/v1/mast", body);
  return {
    id: m.string("id"),
    name: m.string("name"),
    latitude: m.number("latitude"),
    longitude: m.number("longitude"),
    measurementHeightM: m.positive("measurement_height_m"),
    operator: m.string("operator"),
    commissionedAt: m.string("commissioned_at"),
  };
}

function toTurbine(body: unknown): Turbine {
  const t = ShapeReader.of("/v1/turbine", body);
  return {
    id: t.string("id"),
    name: t.string("name"),
    ratedPowerKw: t.positive("rated_power_kw"),
    hubHeightM: t.positive("hub_height_m"),
    rotorDiameterM: t.positive("rotor_diameter_m"),
    cutInWindSpeedMs: t.number("cut_in_wind_speed_ms"),
    cutOutWindSpeedMs: t.number("cut_out_wind_speed_ms"),
    powerCurve: t.nonEmptyList("power_curve").map((p) => ({
      windSpeedMs: p.number("wind_speed_ms"),
      powerKw: p.number("power_kw"),
    })),
    version: t.integer("version"),
    updatedAt: t.string("updated_at"),
  };
}

function toSite(body: unknown): Site {
  const s = ShapeReader.of("/v1/site", body);
  const losses = s.object("losses");
  return {
    id: s.string("id"),
    name: s.string("name"),
    mastId: s.string("mast_id"),
    shearExponent: s.number("shear_exponent"),
    losses: {
      availability: losses.share("availability"),
      electrical: losses.share("electrical"),
      wake: losses.share("wake"),
    },
    uncertainty: s.share("uncertainty"),
    version: s.integer("version"),
    updatedAt: s.string("updated_at"),
  };
}

function toMeasurementInput(m: ApiMeasurement): MeasurementInput {
  return {
    timestamp: m.timestamp,
    windSpeed: m.wind_speed,
    unit: m.unit,
    windDirectionDeg: m.wind_direction_deg,
    version: m.version,
    updatedAt: m.updated_at,
  };
}
