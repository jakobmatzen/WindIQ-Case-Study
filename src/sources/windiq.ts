import type { Mast } from "@/core/mast";
import type { MeasurementInput } from "@/core/measurement";
import type { MeasurementSource } from "./types";

/** Adapter for the WindIQ mock API (docs: <baseUrl>/docs). */

export type WindiqConfig = {
  baseUrl: string;
  clientId: string;
  clientSecret: string;
  fetch?: typeof globalThis.fetch;
  /** Waits between retries; injectable so tests run instantly. */
  sleep?: (ms: number) => Promise<void>;
};

type ApiMeasurement = {
  timestamp: string;
  wind_speed: number | string | null;
  unit: string;
  wind_direction_deg: number | null;
  version: number;
  updated_at: string;
};

type ApiMast = {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  measurement_height_m: number;
  operator: string;
  commissioned_at: string;
};

type ApiMeasurementPage = { data: ApiMeasurement[]; next_cursor: string | null };

const PAGE_SIZE = 500;

/** Attempts per request when the API answers with a server error (5xx). */
const MAX_ATTEMPTS = 4;
const RETRY_BASE_DELAY_MS = 1_000;

export function createWindiqSource(config: WindiqConfig): MeasurementSource {
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

  async function get<T>(path: string, params: Record<string, string>): Promise<T> {
    const url = new URL(path, config.baseUrl);
    for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
    for (let attempt = 1; ; attempt++) {
      const response = await fetch(url, {
        headers: { authorization: `Bearer ${await getToken()}` },
      });
      if (response.ok) return (await response.json()) as T;
      if (response.status < 500 || attempt === MAX_ATTEMPTS) {
        throw new Error(`WindIQ GET ${path} failed: HTTP ${response.status}`);
      }
      await sleep(RETRY_BASE_DELAY_MS * 2 ** (attempt - 1));
    }
  }

  return {
    async fetchMast() {
      const m: ApiMast = await get("/v1/mast", {});
      return toMast(m);
    },

    async *fetchMeasurements({ since }) {
      let cursor: string | null = null;
      do {
        // The cursor is an offset into the filtered result, so the filter goes along on every page.
        const params: Record<string, string> = { limit: String(PAGE_SIZE) };
        if (since) params.since = since.toISOString();
        if (cursor) params.cursor = cursor;
        const page: ApiMeasurementPage = await get("/v1/measurements", params);
        yield page.data.map(toMeasurementInput);
        cursor = page.next_cursor;
      } while (cursor);
    },
  };
}

function toMast(m: ApiMast): Mast {
  return {
    id: m.id,
    name: m.name,
    latitude: m.latitude,
    longitude: m.longitude,
    measurementHeightM: m.measurement_height_m,
    operator: m.operator,
    commissionedAt: m.commissioned_at,
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
