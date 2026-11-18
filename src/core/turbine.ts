/** A wind turbine: hub height and the power curve that turns wind into power. Pure, no I/O. */

export type PowerCurvePoint = {
  /** Wind speed at hub height, m/s. */
  windSpeedMs: number;
  powerKw: number;
};

export type Turbine = {
  id: string;
  name: string;
  ratedPowerKw: number;
  /** Height of the rotor axis above ground (h_Nabe). */
  hubHeightM: number;
  rotorDiameterM: number;
  cutInWindSpeedMs: number;
  cutOutWindSpeedMs: number;
  powerCurve: PowerCurvePoint[];
  version: number;
  /** ISO 8601. */
  updatedAt: string;
};

/**
 * Electrical power at a hub-height wind speed, in kW: linear between the support points of the
 * curve, 0 below cut-in and above cut-out (working assumption, see the guide). Outside the curve's
 * range the nearest support point holds.
 */
export function powerAt(turbine: Turbine, windSpeedMs: number): number {
  if (windSpeedMs < turbine.cutInWindSpeedMs || windSpeedMs > turbine.cutOutWindSpeedMs) return 0;
  const curve = [...turbine.powerCurve].sort((a, b) => a.windSpeedMs - b.windSpeedMs);
  const first = curve[0];
  const last = curve.at(-1);
  if (!first || !last) return 0;
  if (windSpeedMs <= first.windSpeedMs) return first.powerKw;
  if (windSpeedMs >= last.windSpeedMs) return last.powerKw;

  const upper = curve.findIndex((p) => p.windSpeedMs >= windSpeedMs);
  const hi = curve[upper]!;
  const lo = curve[upper - 1]!;
  const share = (windSpeedMs - lo.windSpeedMs) / (hi.windSpeedMs - lo.windSpeedMs);
  return lo.powerKw + share * (hi.powerKw - lo.powerKw);
}
