/** A measurement mast: where and at which height the wind is measured. */
export type Mast = {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  /** Height of the wind measurement above ground (h_Mess). */
  measurementHeightM: number;
  operator: string;
  /** Date the mast went into operation, YYYY-MM-DD. */
  commissionedAt: string;
};
