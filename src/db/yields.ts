import { and, desc, eq } from "drizzle-orm";
import type { Site } from "@/core/site";
import type { Turbine } from "@/core/turbine";
import type { YieldResult } from "@/core/yield";
import { getDb } from "./client";
import { masts, siteVersions, turbineVersions, yieldResults } from "./schema";

/** Repository for turbine and site snapshots and the yield results calculated from them. */

export type StoredYieldResult = typeof yieldResults.$inferSelect;

/** Stores this turbine version unless it is already stored. Versions are never overwritten. */
export async function saveTurbineVersion(turbine: Turbine): Promise<void> {
  await getDb()
    .insert(turbineVersions)
    .values({
      turbineId: turbine.id,
      version: turbine.version,
      name: turbine.name,
      ratedPowerKw: turbine.ratedPowerKw,
      hubHeightM: turbine.hubHeightM,
      rotorDiameterM: turbine.rotorDiameterM,
      cutInWindSpeedMs: turbine.cutInWindSpeedMs,
      cutOutWindSpeedMs: turbine.cutOutWindSpeedMs,
      powerCurve: turbine.powerCurve,
      sourceUpdatedAt: new Date(turbine.updatedAt),
    })
    .onConflictDoNothing();
}

/** Stores this site version unless it is already stored. Versions are never overwritten. */
export async function saveSiteVersion(site: Site): Promise<void> {
  await getDb()
    .insert(siteVersions)
    .values({
      siteId: site.id,
      version: site.version,
      name: site.name,
      mastId: site.mastId,
      shearExponent: site.shearExponent,
      lossAvailability: site.losses.availability,
      lossElectrical: site.losses.electrical,
      lossWake: site.losses.wake,
      uncertainty: site.uncertainty,
      sourceUpdatedAt: new Date(site.updatedAt),
    })
    .onConflictDoNothing();
}

/** Stores a result; `readingsSyncedAt` is the newest sync of the readings it was calculated from. */
export async function insertYieldResult(
  result: YieldResult,
  readingsSyncedAt: Date,
): Promise<void> {
  const { basis, coverage } = result;
  await getDb()
    .insert(yieldResults)
    .values({
      mastId: basis.mastId,
      measurementHeightM: basis.measurementHeightM,
      turbineId: basis.turbineId,
      turbineVersion: basis.turbineVersion,
      siteId: basis.siteId,
      siteVersion: basis.siteVersion,
      windowStart: coverage.window.start,
      windowEnd: coverage.window.end,
      windowHours: coverage.window.hours,
      readingsSyncedAt,
      validHours: coverage.validHours,
      rejectedHours: coverage.rejectedHours,
      missingHours: coverage.missingHours,
      coverageRatio: coverage.ratio,
      quality: result.quality,
      meanWindSpeedMs: result.meanWindSpeedMs,
      hubHeightFactor: result.hubHeightFactor,
      measuredEnergyMwh: result.measuredEnergyMwh,
      grossAepMwh: result.grossAepMwh,
      lossFactor: result.lossFactor,
      netAepMwh: result.netAepMwh,
      p50Mwh: result.p50Mwh,
      p90Mwh: result.p90Mwh,
      months: result.months.map((m) => ({ ...m, month: m.month.toISOString() })),
      rejections: result.rejections,
    });
}

/** The newest yield result of a mast, or null before the first calculation. */
export async function latestYieldResult(mastId: string): Promise<StoredYieldResult | null> {
  const [row] = await getDb()
    .select()
    .from(yieldResults)
    .where(eq(yieldResults.mastId, mastId))
    .orderBy(desc(yieldResults.id))
    .limit(1);
  return row ?? null;
}

/** The newest result of a mast with the mast, turbine and site versions it was calculated with. */
export type YieldResultDetails = {
  result: StoredYieldResult;
  mastName: string;
  site: typeof siteVersions.$inferSelect;
  turbine: typeof turbineVersions.$inferSelect;
};

/** The newest yield result of a mast with its master data, or null before the first calculation. */
export async function latestYieldResultDetails(mastId: string): Promise<YieldResultDetails | null> {
  const [row] = await getDb()
    .select({
      result: yieldResults,
      mastName: masts.name,
      site: siteVersions,
      turbine: turbineVersions,
    })
    .from(yieldResults)
    .innerJoin(masts, eq(masts.id, yieldResults.mastId))
    .innerJoin(
      siteVersions,
      and(
        eq(siteVersions.siteId, yieldResults.siteId),
        eq(siteVersions.version, yieldResults.siteVersion),
      ),
    )
    .innerJoin(
      turbineVersions,
      and(
        eq(turbineVersions.turbineId, yieldResults.turbineId),
        eq(turbineVersions.version, yieldResults.turbineVersion),
      ),
    )
    .where(eq(yieldResults.mastId, mastId))
    .orderBy(desc(yieldResults.id))
    .limit(1);
  return row ?? null;
}

/** P50/P90 of a stored result at the time it was calculated, for the trend chart. */
export type YieldHistoryPoint = Pick<
  StoredYieldResult,
  "id" | "calculatedAt" | "windowEnd" | "p50Mwh" | "p90Mwh" | "turbineVersion" | "siteVersion"
>;

/**
 * The newest `limit` stored results of a mast, oldest first. A new hour of readings already makes a
 * new result, so there are about 24 a day: the limit keeps query and chart small.
 */
export async function yieldHistory(mastId: string, limit: number): Promise<YieldHistoryPoint[]> {
  const rows = await getDb()
    .select({
      id: yieldResults.id,
      calculatedAt: yieldResults.calculatedAt,
      windowEnd: yieldResults.windowEnd,
      p50Mwh: yieldResults.p50Mwh,
      p90Mwh: yieldResults.p90Mwh,
      turbineVersion: yieldResults.turbineVersion,
      siteVersion: yieldResults.siteVersion,
    })
    .from(yieldResults)
    .where(eq(yieldResults.mastId, mastId))
    .orderBy(desc(yieldResults.id))
    .limit(limit);
  return rows.reverse();
}
