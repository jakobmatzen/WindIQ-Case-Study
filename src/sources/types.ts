import type { Mast } from "@/core/mast";
import type { MeasurementInput } from "@/core/measurement";
import type { Site } from "@/core/site";
import type { Turbine } from "@/core/turbine";

/**
 * A source of wind readings for one measurement mast. The worker depends on this interface only,
 * so another mast or a LiDAR is a new adapter, not a change to the sync.
 */
export interface MeasurementSource {
  /** The mast these readings come from. */
  fetchMast(): Promise<Mast>;
  /**
   * Readings in pages. `since` limits them to hours at or after it, oldest hour first.
   * `updatedSince` limits them to readings written or corrected at or after it, ordered by
   * that time, so stopping after any page loses nothing that a later fetch would not bring.
   */
  fetchMeasurements(query: {
    since?: Date;
    updatedSince?: Date;
  }): AsyncIterable<MeasurementInput[]>;
}

/**
 * Master data for the yield calculation: the turbine and its site, each versioned at the source.
 * Separate from `MeasurementSource`, because another mast or a LiDAR brings readings, not turbines.
 */
export interface SiteDataSource {
  fetchTurbine(): Promise<Turbine>;
  fetchSite(): Promise<Site>;
}
