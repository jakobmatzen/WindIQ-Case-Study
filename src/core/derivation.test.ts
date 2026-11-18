import { describe, expect, test } from "bun:test";
import { referenceSite, referenceTurbine } from "./__fixtures__/reference-turbine";
import { rollingYear } from "./coverage";
import { deriveYield, type DerivationInput } from "./derivation";
import type { Mast } from "./mast";
import { calculateYield } from "./yield";

/** API docs example: 100 m mast, 140 m hub, α 0.2, losses 3/2/5 %, U 10 %, 3.6 MW. */
const input: DerivationInput = {
  meanWindSpeedMs: 6.4,
  measurementHeightM: 100,
  hubHeightM: 140,
  shearExponent: 0.2,
  hubHeightFactor: 1.06961,
  grossAepMwh: 10_000,
  losses: { availability: 0.03, electrical: 0.02, wake: 0.05 },
  uncertainty: 0.1,
  ratedPowerKw: 3600,
};

describe("deriveYield", () => {
  test("takes each loss off what the previous one left, then P90 off net", () => {
    const d = deriveYield(input);

    expect(d.losses.map((l) => l.key)).toEqual(["availability", "electrical", "wake"]);
    expect(d.losses[0]!.lossMwh).toBeCloseTo(300, 6);
    expect(d.losses[0]!.remainingMwh).toBeCloseTo(9_700, 6);
    expect(d.losses[1]!.lossMwh).toBeCloseTo(194, 6);
    expect(d.losses[1]!.remainingMwh).toBeCloseTo(9_506, 6);
    expect(d.losses[2]!.lossMwh).toBeCloseTo(475.3, 6);
    // 0.97 × 0.98 × 0.95 ≈ 90.3 % of gross
    expect(d.netAepMwh).toBeCloseTo(9_030.7, 6);
    // 1.282 × 10 % of P50 comes off: P90 ≈ 87.2 % of P50
    expect(d.p90ReductionMwh).toBeCloseTo(1_157.735_74, 4);
    expect(d.p90Mwh).toBeCloseTo(7_872.964_26, 4);
  });

  test("carries the mean wind from the mast to the hub with the height factor", () => {
    expect(deriveYield(input).wind).toEqual({
      mastMs: 6.4,
      measurementHeightM: 100,
      hubHeightM: 140,
      shearExponent: 0.2,
      factor: 1.06961,
      hubMs: expect.closeTo(6.845_504, 6),
    });
  });

  test("turns net AEP into full-load hours and capacity factor of the rated power", () => {
    const d = deriveYield(input);

    // 9,030.7 MWh / 3.6 MW
    expect(d.fullLoadHours).toBeCloseTo(2_508.527_8, 3);
    // 2,508.53 h / 8,760 h
    expect(d.capacityFactor).toBeCloseTo(0.286_362, 6);
  });

  test("leaves the wind at mast and hub empty for results stored without it", () => {
    const { wind } = deriveYield({ ...input, meanWindSpeedMs: null });

    expect(wind.mastMs).toBeNull();
    expect(wind.hubMs).toBeNull();
    expect(wind.factor).toBe(1.06961);
  });

  test("re-traces exactly the net AEP and P90 that calculateYield stored", () => {
    const window = rollingYear(new Date("2026-11-17T23:00:00Z"));
    const readings = Array.from({ length: window.hours }, (_, i) => ({
      hour: new Date(window.start.getTime() + i * 3_600_000),
      status: "valid" as const,
      windSpeedMs: 3 + (i % 12),
    }));
    const mast: Mast = {
      id: "WIQ-MM-01",
      name: "Messmast Spreewald",
      latitude: 51.9,
      longitude: 14.1,
      measurementHeightM: 100,
      operator: "WindIQ",
      commissionedAt: "2025-01-01",
    };
    const stored = calculateYield({
      readings,
      window,
      mast,
      turbine: referenceTurbine,
      site: referenceSite,
    });

    const d = deriveYield({
      meanWindSpeedMs: stored.meanWindSpeedMs,
      measurementHeightM: stored.basis.measurementHeightM,
      hubHeightM: referenceTurbine.hubHeightM,
      shearExponent: referenceSite.shearExponent,
      hubHeightFactor: stored.hubHeightFactor,
      grossAepMwh: stored.grossAepMwh,
      losses: referenceSite.losses,
      uncertainty: referenceSite.uncertainty,
      ratedPowerKw: referenceTurbine.ratedPowerKw,
    });

    expect(d.netAepMwh).toBeCloseTo(stored.netAepMwh, 6);
    expect(d.p90Mwh).toBeCloseTo(stored.p90Mwh, 6);
  });
});
