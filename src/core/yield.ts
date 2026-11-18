/**
 * Annual energy production (AEP), P50 and P90 from checked readings, as the case study defines it:
 *
 *   v_hub  = v_mast × (h_hub / h_mast) ^ α
 *   gross  = Σ power(v_hub) × 1 h over the valid hours, extrapolated to a full year
 *   net    = gross × (1 − availability) × (1 − electrical) × (1 − wake)  = P50
 *   P90    = P50 × (1 − 1.282 × U)
 *
 * Pure, no I/O.
 */
import {
  calculateCoverage,
  HOURS_PER_YEAR,
  isInWindow,
  type Coverage,
  type HourWindow,
} from "./coverage";
import type { Mast } from "./mast";
import type { MeasurementStatus } from "./measurement";
import type { Site } from "./site";
import { powerAt, type Turbine } from "./turbine";

/** 90 % quantile of the standard normal distribution. */
export const Z_90 = 1.282;

/** From this uncertainty on, P90 = P50 × (1 − 1.282 × U) is 0 or negative (≈ 0.78). */
export const MAX_UNCERTAINTY = 1 / Z_90;

export type YieldInput = {
  readings: { hour: Date; status: MeasurementStatus; windSpeedMs: number | null }[];
  window: HourWindow;
  mast: Mast;
  turbine: Turbine;
  site: Site;
};

/**
 * How far the result can be trusted, from data coverage (thresholds: JAK-12 and the guide's
 * "Offene Fragen an WindIQ"). The result is shown in every case, with a warning below `ok`.
 */
export const YIELD_QUALITIES = ["ok", "uncertain", "not_meaningful"] as const;
export type YieldQuality = (typeof YIELD_QUALITIES)[number];

/** Lowest data coverage (share of hours) for each quality; below `meaningful` it is not. */
export const COVERAGE_THRESHOLDS = { ok: 0.9, meaningful: 0.7 } as const;

function qualityOf(coverageRatio: number): YieldQuality {
  if (coverageRatio >= COVERAGE_THRESHOLDS.ok) return "ok";
  if (coverageRatio >= COVERAGE_THRESHOLDS.meaningful) return "uncertain";
  return "not_meaningful";
}

/** Which master data a result was calculated with, so it stays traceable. */
export type YieldBasis = {
  mastId: string;
  /** h_Mess used; the mast itself has no version at the source. */
  measurementHeightM: number;
  turbineId: string;
  turbineVersion: number;
  siteId: string;
  siteVersion: number;
};

export type YieldResult = {
  basis: YieldBasis;
  coverage: Coverage;
  quality: YieldQuality;
  /** Mean wind speed at measurement height over the valid hours, m/s (0 without valid hours). */
  meanWindSpeedMs: number;
  /** Factor from wind at measurement height to wind at hub height. */
  hubHeightFactor: number;
  /** Energy of the valid hours as measured, before extrapolation and losses. */
  measuredEnergyMwh: number;
  /** Gross AEP: measured energy extrapolated to a full year (8,760 h). */
  grossAepMwh: number;
  /** Share of gross AEP left after all losses. */
  lossFactor: number;
  netAepMwh: number;
  p50Mwh: number;
  p90Mwh: number;
};

export function calculateYield({ readings, window, mast, turbine, site }: YieldInput): YieldResult {
  const coverage = calculateCoverage(readings, window);
  const hubHeightFactor = (turbine.hubHeightM / mast.measurementHeightM) ** site.shearExponent;

  let measuredEnergyKwh = 0;
  let windSumMs = 0;
  for (const { hour, status, windSpeedMs } of readings) {
    // The same hours calculateCoverage counts as valid, so energy and validHours always match.
    if (status !== "valid" || windSpeedMs === null || !isInWindow(hour, window)) continue;
    measuredEnergyKwh += powerAt(turbine, windSpeedMs * hubHeightFactor); // kW × 1 h
    windSumMs += windSpeedMs;
  }
  const measuredEnergyMwh = measuredEnergyKwh / 1000;

  const grossAepMwh =
    coverage.validHours === 0 ? 0 : (measuredEnergyMwh * HOURS_PER_YEAR) / coverage.validHours;
  const { availability, electrical, wake } = site.losses;
  const lossFactor = (1 - availability) * (1 - electrical) * (1 - wake);
  const netAepMwh = grossAepMwh * lossFactor;

  return {
    basis: {
      mastId: mast.id,
      measurementHeightM: mast.measurementHeightM,
      turbineId: turbine.id,
      turbineVersion: turbine.version,
      siteId: site.id,
      siteVersion: site.version,
    },
    coverage,
    quality: qualityOf(coverage.ratio),
    meanWindSpeedMs: coverage.validHours === 0 ? 0 : windSumMs / coverage.validHours,
    hubHeightFactor,
    measuredEnergyMwh,
    grossAepMwh,
    lossFactor,
    netAepMwh,
    p50Mwh: netAepMwh,
    p90Mwh: netAepMwh * (1 - Z_90 * site.uncertainty),
  };
}

/** Everything a stored result depends on besides the formulas: equal fingerprints, equal result. */
export type YieldFingerprint = YieldBasis & {
  /** Newest hour of the window. */
  windowEnd: Date;
  /** Newest write or correction of a reading inside the window. */
  readingsSyncedAt: Date;
};

/**
 * Whether a new calculation would rest on the same inputs as the previous result. Only if not
 * is a new result stored, so the history shows real changes instead of identical rows.
 */
export function sameFingerprint(
  previous: YieldFingerprint | null,
  current: YieldFingerprint,
): boolean {
  return (
    previous !== null &&
    previous.mastId === current.mastId &&
    previous.measurementHeightM === current.measurementHeightM &&
    previous.turbineId === current.turbineId &&
    previous.turbineVersion === current.turbineVersion &&
    previous.siteId === current.siteId &&
    previous.siteVersion === current.siteVersion &&
    previous.windowEnd.getTime() === current.windowEnd.getTime() &&
    previous.readingsSyncedAt.getTime() === current.readingsSyncedAt.getTime()
  );
}
