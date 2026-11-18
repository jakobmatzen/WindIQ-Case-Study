/** A site: how wind and yield are adjusted for the place a turbine stands. Pure, no I/O. */

export type Site = {
  id: string;
  name: string;
  mastId: string;
  /** Power-law exponent α for the height correction. */
  shearExponent: number;
  /** Loss shares, 0.03 = 3 %. */
  losses: { availability: number; electrical: number; wake: number };
  /** Total uncertainty U of the yield estimate as a share. */
  uncertainty: number;
  version: number;
  /** ISO 8601. */
  updatedAt: string;
};
