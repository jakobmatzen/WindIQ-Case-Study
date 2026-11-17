/**
 * Checking a single wind reading: is it usable for the yield calculation, and if not, why not?
 * Rules: CONTEXT.md and the guide's "Offene Fragen an WindIQ". Pure, no I/O.
 */

/** A reading as a source adapter delivers it, before any checks. */
export type MeasurementInput = {
  /** Start of the measured hour, ISO 8601 with offset. */
  timestamp: string;
  /** Mean wind speed of the hour at measurement height, as the source sent it. */
  windSpeed: number | string | null;
  unit: string;
  windDirectionDeg: number | null;
  version: number;
  updatedAt: string;
};

/** Why a reading is (not) usable. Everything except `valid` is a rejection reason. */
export const MEASUREMENT_STATUSES = [
  "valid",
  "missing",
  "unparseable",
  "sentinel",
  "unknown_unit",
  "out_of_range",
] as const;

export type MeasurementStatus = (typeof MEASUREMENT_STATUSES)[number];

export type CheckedMeasurement = {
  /** Start of the measured hour, in UTC. */
  hour: Date;
  status: MeasurementStatus;
  /** Wind speed in m/s at measurement height, or null when the reading is rejected. */
  windSpeedMs: number | null;
  /** The wind speed exactly as the source sent it, as text; null when it sent none. */
  rawValue: string | null;
  unit: string;
  windDirectionDeg: number | null;
  version: number;
  updatedAt: Date;
};

/** Error code the mast sends instead of a reading (not in the API docs, seen in real data). */
const SENTINEL = -999;

/** Factor from each accepted unit to m/s. Units are matched exactly as the API spells them. */
const TO_METRES_PER_SECOND: Record<string, number> = { "m/s": 1, "km/h": 1 / 3.6 };

/** Plausible mean wind speed of an hour (working assumption, see the guide). */
export const MAX_PLAUSIBLE_WIND_SPEED_MS = 40;

/** A plain decimal number with a dot, as the API sends it. Anything else is not guessed at. */
const DECIMAL = /^-?\d+(\.\d+)?$/;

function parseWindSpeed(value: number | string): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const text = value.trim();
  return DECIMAL.test(text) ? Number(text) : null;
}

/** Wind speed in m/s, or the reason it cannot be used. */
function evaluate(input: MeasurementInput): {
  status: MeasurementStatus;
  windSpeedMs: number | null;
} {
  if (input.windSpeed === null) return { status: "missing", windSpeedMs: null };
  const value = parseWindSpeed(input.windSpeed);
  if (value === null) return { status: "unparseable", windSpeedMs: null };
  if (value === SENTINEL) return { status: "sentinel", windSpeedMs: null };
  const factor = TO_METRES_PER_SECOND[input.unit];
  if (factor === undefined) return { status: "unknown_unit", windSpeedMs: null };
  const ms = value * factor;
  if (ms < 0 || ms > MAX_PLAUSIBLE_WIND_SPEED_MS)
    return { status: "out_of_range", windSpeedMs: null };
  return { status: "valid", windSpeedMs: ms };
}

export function checkMeasurement(input: MeasurementInput): CheckedMeasurement {
  return {
    hour: new Date(input.timestamp),
    ...evaluate(input),
    rawValue: input.windSpeed === null ? null : String(input.windSpeed),
    unit: input.unit,
    windDirectionDeg: input.windDirectionDeg,
    version: input.version,
    updatedAt: new Date(input.updatedAt),
  };
}
