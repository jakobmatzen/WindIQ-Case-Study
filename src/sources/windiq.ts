import type { Mast } from "@/core/mast";
import type { MeasurementInput } from "@/core/measurement";
import type { Site } from "@/core/site";
import type { Turbine } from "@/core/turbine";
import { MAX_UNCERTAINTY } from "@/core/yield";
import { ResponseShapeError, ShapeReader } from "./response-shape";
import type { MeasurementSource, SiteDataSource } from "./types";

/** Adapter for the WindIQ mock API (docs: <baseUrl>/docs). */

export type WindiqConfig = {
  baseUrl: string;
  clientId: string;
  clientSecret: string;
  fetch?: typeof globalThis.fetch;
  /** Waits between retries; injectable so tests run instantly. */
  sleep?: (ms: number) => Promise<void>;
  /** Time limit per attempt, body included. Default 30 s. */
  timeoutMs?: number;
  /** Called before each wait for a retry, e.g. to log it. */
  onRetry?: (retry: RetryEvent) => void;
  /** Called for each reading skipped because it cannot be stored (no valid hour or version). */
  onSkippedReading?: (problem: string) => void;
};

export type RetryEvent = {
  /** e.g. "GET /v1/measurements" */
  request: string;
  /** The attempt that failed, starting at 1. */
  attempt: number;
  /** Why it failed, e.g. "HTTP 503" or "no answer within 30000 ms". */
  problem: string;
  delayMs: number;
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

/** Not documented by WindIQ (CONTEXT.md, item 7), so chosen defensively. */
const REQUEST_TIMEOUT_MS = 30_000;
/** Attempts per request when the API or the network fails in a way that may pass. */
const MAX_ATTEMPTS = 4;
const RETRY_BASE_DELAY_MS = 1_000;
/** Upper bound for one wait, also when the API asks for a longer one via `Retry-After`. */
const MAX_RETRY_DELAY_MS = 60_000;

/** A failure that may pass on its own: no answer in time, or no connection. */
class TransientError extends Error {}

/** What one HTTP request brought back: the status, and the body text for 2xx. */
type Answer = { status: number; text: string; retryAfterMs: number | null };

const isSuccess = (status: number) => status >= 200 && status < 300;
/** Server errors, rate limiting and request timeouts may pass; other 4xx will not, so they are not retried. */
const isTransient = (status: number) => status >= 500 || status === 429 || status === 408;

export function createWindiqSource(config: WindiqConfig): MeasurementSource & SiteDataSource {
  const fetch = config.fetch ?? globalThis.fetch;
  const sleep = config.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const timeoutMs = config.timeoutMs ?? REQUEST_TIMEOUT_MS;
  const onSkippedReading = config.onSkippedReading ?? (() => {});
  // The pending or finished token request, shared so parallel requests fetch one token, not one each.
  let token: Promise<string> | undefined;

  /** One HTTP request, body included, within the timeout. */
  async function send(url: URL, init: RequestInit): Promise<Answer> {
    try {
      const response = await fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
      const retryAfterMs = parseRetryAfter(response.headers.get("retry-after"), new Date());
      // The body is read inside the timeout too: a stalled body is no answer either.
      if (!isSuccess(response.status)) {
        await response.body?.cancel().catch(() => {});
        return { status: response.status, text: "", retryAfterMs };
      }
      return { status: response.status, text: await response.text(), retryAfterMs };
    } catch (error) {
      if (error instanceof DOMException && error.name === "TimeoutError") {
        throw new TransientError(`no answer within ${timeoutMs} ms`);
      }
      throw new TransientError(`network error (${error instanceof Error ? error.message : error})`);
    }
  }

  /**
   * Sends a request until it gets an answer that is not transient, waiting longer each time.
   * Returns that answer, whatever its status; throws once all attempts failed.
   */
  async function sendWithRetries(label: string, url: URL, init: RequestInit): Promise<Answer> {
    for (let attempt = 1; ; attempt++) {
      let problem: string;
      let retryAfterMs: number | null = null;
      try {
        const answer = await send(url, init);
        if (!isTransient(answer.status)) return answer;
        problem = `HTTP ${answer.status}`;
        retryAfterMs = answer.retryAfterMs;
      } catch (error) {
        if (!(error instanceof TransientError)) throw error;
        problem = error.message;
      }
      if (attempt === MAX_ATTEMPTS) {
        throw new Error(`WindIQ ${label} failed after ${MAX_ATTEMPTS} attempts: ${problem}`);
      }
      // Retry-After may ask for longer than the backoff, never for shorter (e.g. "0").
      const backoffMs = RETRY_BASE_DELAY_MS * 2 ** (attempt - 1);
      const delayMs = Math.min(Math.max(retryAfterMs ?? 0, backoffMs), MAX_RETRY_DELAY_MS);
      config.onRetry?.({ request: label, attempt, problem, delayMs });
      await sleep(delayMs);
    }
  }

  async function requestToken(): Promise<string> {
    const answer = await sendWithRetries(
      "POST /auth/token",
      new URL("/auth/token", config.baseUrl),
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ client_id: config.clientId, client_secret: config.clientSecret }),
      },
    );
    if (!isSuccess(answer.status)) {
      throw new Error(`WindIQ POST /auth/token failed: HTTP ${answer.status}`);
    }
    return ShapeReader.of("/auth/token", parseJson("/auth/token", answer.text)).string(
      "access_token",
    );
  }

  function getToken(): Promise<string> {
    token ??= requestToken().catch((error: unknown) => {
      token = undefined; // a failed request must not block the next attempt
      throw error;
    });
    return token;
  }

  async function get(path: string, params: Record<string, string>): Promise<unknown> {
    const url = new URL(path, config.baseUrl);
    for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
    const label = `GET ${path}`;
    for (let renewedToken = false; ; renewedToken = true) {
      const used = getToken();
      const headers = { authorization: `Bearer ${await used}` };
      const answer = await sendWithRetries(label, url, { headers });
      if (isSuccess(answer.status)) return parseJson(path, answer.text);
      if (answer.status === 401 && !renewedToken) {
        // Token expired: fetch a new one and repeat once. A parallel request may have done so already.
        if (token === used) token = undefined;
        continue;
      }
      throw new Error(`WindIQ ${label} failed: HTTP ${answer.status}`);
    }
  }

  return {
    fetchMast: async () => toMast(await get("/v1/mast", {})),
    fetchTurbine: async () => toTurbine(await get("/v1/turbine", {})),
    fetchSite: async () => toSite(await get("/v1/site", {})),

    async *fetchMeasurements({ since, updatedSince }) {
      let cursor: string | null = null;
      do {
        // The cursor is an offset into the filtered result, so the filter goes along on every page.
        const params: Record<string, string> = { limit: String(PAGE_SIZE) };
        if (since) params.since = since.toISOString();
        if (updatedSince) params.updated_since = updatedSince.toISOString();
        if (cursor) params.cursor = cursor;
        const page = toMeasurementPage(await get("/v1/measurements", params), onSkippedReading);
        yield page.readings;
        cursor = page.nextCursor;
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
  const cutInWindSpeedMs = t.nonNegative("cut_in_wind_speed_ms");
  const cutOutWindSpeedMs = t.positive("cut_out_wind_speed_ms");
  if (cutInWindSpeedMs >= cutOutWindSpeedMs) {
    throw new ResponseShapeError(
      "/v1/turbine",
      "cut_in_wind_speed_ms must be below cut_out_wind_speed_ms",
    );
  }
  return {
    id: t.string("id"),
    name: t.string("name"),
    ratedPowerKw: t.positive("rated_power_kw"),
    hubHeightM: t.positive("hub_height_m"),
    rotorDiameterM: t.positive("rotor_diameter_m"),
    cutInWindSpeedMs,
    cutOutWindSpeedMs,
    powerCurve: t.nonEmptyList("power_curve").map((p) => ({
      windSpeedMs: p.nonNegative("wind_speed_ms"),
      powerKw: p.nonNegative("power_kw"),
    })),
    version: t.integer("version"),
    updatedAt: t.string("updated_at"),
  };
}

function toSite(body: unknown): Site {
  const s = ShapeReader.of("/v1/site", body);
  const losses = s.object("losses");
  const uncertainty = s.share("uncertainty");
  if (uncertainty >= MAX_UNCERTAINTY) {
    throw new ResponseShapeError(
      "/v1/site",
      `uncertainty must be below ${MAX_UNCERTAINTY.toFixed(2)}, or P90 turns negative`,
    );
  }
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
    uncertainty,
    version: s.integer("version"),
    updatedAt: s.string("updated_at"),
  };
}

/**
 * Checks the fields a reading is stored by (hour, version, update time). A reading without them
 * cannot be stored, so it is skipped and reported, not the whole page: otherwise every run would
 * fail on the same page and the sync would stall for good. Wind speed and unit are judged in core,
 * so an odd value is stored as unusable with its raw text.
 */
function toMeasurementPage(
  body: unknown,
  onSkippedReading: (problem: string) => void,
): { readings: MeasurementInput[]; nextCursor: string | null } {
  const page = ShapeReader.of(MEASUREMENTS, body);
  const data = page.raw("data");
  if (!Array.isArray(data)) throw new ResponseShapeError(MEASUREMENTS, "data must be a list");
  const readings: MeasurementInput[] = [];
  for (const [i, item] of data.entries()) {
    try {
      const m = ShapeReader.of(MEASUREMENTS, item, `data[${i}].`);
      readings.push({
        timestamp: m.dateTime("timestamp"),
        windSpeed: windSpeedAsSent(m.raw("wind_speed")),
        unit: unitAsSent(m.raw("unit")),
        windDirectionDeg: directionAsSent(m.raw("wind_direction_deg")),
        version: m.integer("version"),
        updatedAt: m.dateTime("updated_at"),
      });
    } catch (error) {
      if (!(error instanceof ResponseShapeError)) throw error;
      onSkippedReading(error.message);
    }
  }
  // An empty cursor ends paging like null, as `while (cursor)` always treated it.
  const nextCursor = page.raw("next_cursor") === "" ? null : page.nullableString("next_cursor");
  return { readings, nextCursor };
}

const MEASUREMENTS = "/v1/measurements";

/** Core rejects an unknown unit; a missing one is passed on as empty, so it is rejected there too. */
function unitAsSent(value: unknown): string {
  return typeof value === "string" ? value : "";
}

/** Not used for the yield, so anything but a number counts as no direction. */
function directionAsSent(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/** A documented type (number, text, null) as is; anything else as its JSON text. */
function windSpeedAsSent(value: unknown): number | string | null {
  if (value === undefined || value === null) return null;
  if (typeof value === "number" || typeof value === "string") return value;
  return JSON.stringify(value);
}

function parseJson(endpoint: string, text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    throw new ResponseShapeError(endpoint, "response is not valid JSON");
  }
}

/** `Retry-After` in seconds or as an HTTP date, as milliseconds from now; null when absent or unreadable. */
function parseRetryAfter(header: string | null, now: Date): number | null {
  if (header === null) return null;
  if (/^\d+$/.test(header.trim())) return Number(header) * 1_000;
  const at = Date.parse(header);
  return Number.isNaN(at) ? null : Math.max(0, at - now.getTime());
}
