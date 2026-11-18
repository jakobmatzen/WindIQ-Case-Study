/**
 * The calculation chain behind a stored yield result, step by step with real numbers, so a
 * consultant can follow it: wind at the mast → height factor → wind at the hub → gross AEP →
 * each loss on its own → net AEP (= P50) → P90.
 *
 * Pure, no I/O. Uses the same formulas as `calculateYield`.
 */
import { HOURS_PER_YEAR } from "./coverage";
import type { Site } from "./site";
import { Z_90 } from "./yield";

export type LossKey = keyof Site["losses"];

/** Order in which the losses are applied (and shown). */
const LOSS_ORDER: LossKey[] = ["availability", "electrical", "wake"];

export type DerivationInput = {
  /** Mean wind at measurement height, m/s; null for results stored before it was recorded. */
  meanWindSpeedMs: number | null;
  measurementHeightM: number;
  hubHeightM: number;
  shearExponent: number;
  hubHeightFactor: number;
  grossAepMwh: number;
  losses: Site["losses"];
  uncertainty: number;
  ratedPowerKw: number;
};

export type LossStep = {
  key: LossKey;
  /** Share taken off, 0.03 = 3 %. */
  share: number;
  lossMwh: number;
  /** AEP left after this loss. */
  remainingMwh: number;
};

export type WindStep = {
  /** Mean wind at measurement height, m/s (null if not recorded). */
  mastMs: number | null;
  measurementHeightM: number;
  hubHeightM: number;
  shearExponent: number;
  /** (h_hub / h_mast) ^ α */
  factor: number;
  /** Mean wind at hub height, m/s (null if not recorded). */
  hubMs: number | null;
};

export type YieldDerivation = {
  wind: WindStep;
  losses: LossStep[];
  netAepMwh: number;
  /** 1.282 × U × P50: what comes off P50 to reach P90. */
  p90ReductionMwh: number;
  p90Mwh: number;
  /** Net AEP / rated power: hours at full power that would produce the year's energy. */
  fullLoadHours: number;
  /** Full-load hours / 8,760 h, between 0 and 1. */
  capacityFactor: number;
};

export function deriveYield(input: DerivationInput): YieldDerivation {
  let remainingMwh = input.grossAepMwh;
  const losses = LOSS_ORDER.map((key) => {
    const share = input.losses[key];
    const lossMwh = remainingMwh * share;
    remainingMwh -= lossMwh;
    return { key, share, lossMwh, remainingMwh };
  });
  const netAepMwh = remainingMwh;
  const p90ReductionMwh = netAepMwh * Z_90 * input.uncertainty;

  const mastMs = input.meanWindSpeedMs;
  const wind: WindStep = {
    mastMs,
    measurementHeightM: input.measurementHeightM,
    hubHeightM: input.hubHeightM,
    shearExponent: input.shearExponent,
    factor: input.hubHeightFactor,
    hubMs: mastMs === null ? null : mastMs * input.hubHeightFactor,
  };

  const fullLoadHours = (netAepMwh * 1000) / input.ratedPowerKw;

  return {
    wind,
    losses,
    netAepMwh,
    p90ReductionMwh,
    p90Mwh: netAepMwh - p90ReductionMwh,
    fullLoadHours,
    capacityFactor: fullLoadHours / HOURS_PER_YEAR,
  };
}
