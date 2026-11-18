import type { Site } from "../site";
import type { Turbine } from "../turbine";

/** Example turbine from the WindIQ API docs (`GET /v1/turbine`), 3.6 MW, hub at 140 m. */
export const referenceTurbine: Turbine = {
  id: "WIQ-T36",
  name: "Referenzanlage 3,6 MW",
  ratedPowerKw: 3600,
  hubHeightM: 140,
  rotorDiameterM: 136,
  cutInWindSpeedMs: 3,
  cutOutWindSpeedMs: 25,
  powerCurve: [
    0, 0, 0, 55, 180, 385, 680, 1080, 1590, 2180, 2780, 3250, 3520, 3590, 3600, 3600, 3600, 3600,
    3600, 3600, 3600, 3600, 3600, 3600, 3600, 3600,
  ].map((powerKw, windSpeedMs) => ({ windSpeedMs, powerKw })),
  version: 1,
  updatedAt: "2026-09-20T08:00:00Z",
};

/** Example site from the WindIQ API docs (`GET /v1/site`): α 0.2, losses 3/2/5 %, U 10 %. */
export const referenceSite: Site = {
  id: "WIQ-SITE-01",
  name: "Windpark Spreewald",
  mastId: "WIQ-MM-01",
  shearExponent: 0.2,
  losses: { availability: 0.03, electrical: 0.02, wake: 0.05 },
  uncertainty: 0.1,
  version: 1,
  updatedAt: "2026-09-20T08:00:00Z",
};
