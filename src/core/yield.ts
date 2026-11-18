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
import { calculateCoverage, HOURS_PER_YEAR, type Coverage, type HourWindow } from "./coverage";
import type { Mast } from "./mast";
import type { MeasurementStatus } from "./measurement";
import type { Site } from "./site";
import { powerAt, type Turbine } from "./turbine";

/** 90 % quantile of the standard normal distribution. */
const Z_90 = 1.282;

export type YieldInput = {
  readings: { hour: Date; status: MeasurementStatus; windSpeedMs: number | null }[];
  window: HourWindow;
  mast: Mast;
  turbine: Turbine;
  site: Site;
};

/**
 * How far the result can be trusted, from data coverage (thresholds from the grilling on 17.11.).
 * The result is shown in every case, with a warning below `ok`.
 */
export const YIELD_QUALITIES = ["ok", "uncertain", "not_meaningful"] as const;
export type YieldQuality = (typeof YIELD_QUALITIES)[number];

const MIN_COVERAGE_OK = 0.9;
const MIN_COVERAGE_MEANINGFUL = 0.7;

function qualityOf(coverageRatio: number): YieldQuality {
  if (coverageRatio >= MIN_COVERAGE_OK) return "ok";
  if (coverageRatio >= MIN_COVERAGE_MEANINGFUL) return "uncertain";
  return "not_meaningful";
}

/** Which master data a result was calculated with, so it stays traceable. */
export type YieldBasis = {
  mastId: string;
  turbineId: string;
  turbineVersion: number;
  siteId: string;
  siteVersion: number;
};

export type YieldResult = {
  basis: YieldBasis;
  coverage: Coverage;
  quality: YieldQuality;
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

  const start = window.start.getTime();
  const end = window.end.getTime();
  let measuredEnergyKwh = 0;
  for (const { hour, status, windSpeedMs } of readings) {
    const t = hour.getTime();
    if (status !== "valid" || windSpeedMs === null || t < start || t > end) continue;
    measuredEnergyKwh += powerAt(turbine, windSpeedMs * hubHeightFactor); // kW × 1 h
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
      turbineId: turbine.id,
      turbineVersion: turbine.version,
      siteId: site.id,
      siteVersion: site.version,
    },
    coverage,
    quality: qualityOf(coverage.ratio),
    hubHeightFactor,
    measuredEnergyMwh,
    grossAepMwh,
    lossFactor,
    netAepMwh,
    p50Mwh: netAepMwh,
    p90Mwh: netAepMwh * (1 - Z_90 * site.uncertainty),
  };
}
