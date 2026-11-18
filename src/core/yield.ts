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
  HOUR_MS,
  HOURS_PER_YEAR,
  isInWindow,
  type Coverage,
  type HourWindow,
} from "./coverage";
import type { Mast } from "./mast";
import { MEASUREMENT_STATUSES, type MeasurementStatus } from "./measurement";
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
 * "Annahmen"). The result is shown in every case, with a warning below `ok`.
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

/** Why a reading was not used: every status except `valid`. */
export type RejectionReason = Exclude<MeasurementStatus, "valid">;

export const REJECTION_REASONS = MEASUREMENT_STATUSES.filter(
  (s): s is RejectionReason => s !== "valid",
);

/** One calendar month (UTC) of the window; the first and last month are usually partial. */
export type MonthYield = {
  /** First hour of the calendar month, UTC (not of its part inside the window). */
  month: Date;
  /** Hours of this month inside the window. */
  hours: number;
  validHours: number;
  /**
   * Gross energy of the month, MWh: its valid hours scaled up to all its hours in the window,
   * then all months scaled together so they add up to gross AEP. Null without a valid hour.
   */
  energyMwh: number | null;
};

export type YieldResult = {
  basis: YieldBasis;
  coverage: Coverage;
  quality: YieldQuality;
  /** Mean wind speed at measurement height over the valid hours, m/s (null without valid hours). */
  meanWindSpeedMs: number | null;
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
  /** The window split into calendar months, oldest first. */
  months: MonthYield[];
  /** Rejected readings in the window per reason. Hours without a record are in `coverage`. */
  rejections: Record<RejectionReason, number>;
};

function monthStart(hour: Date): Date {
  return new Date(Date.UTC(hour.getUTCFullYear(), hour.getUTCMonth(), 1));
}

/** Whether only part of the calendar month lies inside the window (the first and last month). */
export function isPartialMonth(m: Pick<MonthYield, "month" | "hours">): boolean {
  const next = Date.UTC(m.month.getUTCFullYear(), m.month.getUTCMonth() + 1, 1);
  return m.hours < (next - m.month.getTime()) / HOUR_MS;
}

/** The calendar months the window touches, with how many of their hours lie inside it. */
function monthsOf(window: HourWindow): MonthYield[] {
  const months: MonthYield[] = [];
  let month = monthStart(window.start);
  while (month.getTime() <= window.end.getTime()) {
    const next = new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth() + 1, 1));
    const from = Math.max(month.getTime(), window.start.getTime());
    const to = Math.min(next.getTime(), window.end.getTime() + HOUR_MS);
    months.push({ month, hours: (to - from) / HOUR_MS, validHours: 0, energyMwh: null });
    month = next;
  }
  return months;
}

/**
 * Fills in each month's gross energy from its measured energy. Each month is scaled up by its own
 * coverage, so a gap does not make it look smaller; then all months are scaled by one common
 * factor so they add up to gross AEP, which is extrapolated over the whole year at once.
 */
function scaleMonths(months: MonthYield[], measuredKwh: number[], grossAepMwh: number): void {
  const fullMonth = months.map((m, i) =>
    m.validHours === 0 ? null : ((measuredKwh[i] ?? 0) / 1000) * (m.hours / m.validHours),
  );
  const total = fullMonth.reduce<number>((sum, e) => sum + (e ?? 0), 0);
  months.forEach((m, i) => {
    const e = fullMonth[i] ?? null;
    m.energyMwh = e === null ? null : total === 0 ? 0 : (e * grossAepMwh) / total;
  });
}

export function calculateYield({ readings, window, mast, turbine, site }: YieldInput): YieldResult {
  const coverage = calculateCoverage(readings, window);
  const hubHeightFactor = (turbine.hubHeightM / mast.measurementHeightM) ** site.shearExponent;
  const months = monthsOf(window);
  const monthIndex = new Map(months.map((m, i) => [m.month.getTime(), i]));
  const monthKwh = months.map(() => 0);

  const rejections = Object.fromEntries(REJECTION_REASONS.map((r) => [r, 0])) as Record<
    RejectionReason,
    number
  >;

  let measuredEnergyKwh = 0;
  let windSumMs = 0;
  for (const { hour, status, windSpeedMs } of readings) {
    if (status !== "valid" && isInWindow(hour, window)) rejections[status]++;
    // The same hours calculateCoverage counts as valid, so energy and validHours always match.
    if (status !== "valid" || windSpeedMs === null || !isInWindow(hour, window)) continue;
    const kwh = powerAt(turbine, windSpeedMs * hubHeightFactor); // kW × 1 h
    measuredEnergyKwh += kwh;
    windSumMs += windSpeedMs;
    const i = monthIndex.get(monthStart(hour).getTime());
    if (i !== undefined) {
      monthKwh[i] = (monthKwh[i] ?? 0) + kwh;
      months[i]!.validHours++;
    }
  }
  const measuredEnergyMwh = measuredEnergyKwh / 1000;

  const grossAepMwh =
    coverage.validHours === 0 ? 0 : (measuredEnergyMwh * HOURS_PER_YEAR) / coverage.validHours;
  scaleMonths(months, monthKwh, grossAepMwh);
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
    meanWindSpeedMs: coverage.validHours === 0 ? null : windSumMs / coverage.validHours,
    hubHeightFactor,
    measuredEnergyMwh,
    grossAepMwh,
    lossFactor,
    netAepMwh,
    p50Mwh: netAepMwh,
    p90Mwh: netAepMwh * (1 - Z_90 * site.uncertainty),
    months,
    rejections,
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
