import "server-only";
import { connection } from "next/server";
import { deriveYield, type YieldDerivation } from "@/core/derivation";
import type { YieldQuality } from "@/core/yield";
import { lastSuccessfulSync, latestYieldResultDetails, listMasts } from "@/db";
import { sourceOutage } from "@/lib/health";
import { version as appVersion } from "../../package.json";
import { maxSyncAgeMinutes } from "./health";

export type DashboardDto = {
  siteName: string;
  mastName: string;
  appVersion: string;
  /** Newest hour of the data window: the latest reading the result rests on. */
  dataAsOf: Date;
  calculatedAt: Date;
  /** Set while the worker cannot reach the data source; the last result stays visible. */
  outage: { duration: string } | null;
  quality: YieldQuality;
  p50Mwh: number;
  p90Mwh: number;
  grossAepMwh: number;
  netAepMwh: number;
  uncertainty: number;
  coverage: {
    ratio: number;
    validHours: number;
    rejectedHours: number;
    missingHours: number;
    windowStart: Date;
    windowEnd: Date;
  };
  turbine: { name: string; version: number; ratedPowerKw: number };
  siteVersion: number;
  derivation: YieldDerivation;
};

/**
 * Everything the dashboard shows, or null before the first calculation.
 * The page never calculates the yield: it shows what the worker stored, even while the API is
 * down. The derivation only re-traces the stored result step by step.
 * The UI shows one mast for now: the first one by id.
 */
export async function getDashboard(): Promise<DashboardDto | null> {
  await connection(); // request time only: the build never touches the database
  const [mast] = await listMasts();
  if (!mast) return null;
  const [details, lastSync] = await Promise.all([
    latestYieldResultDetails(mast.id),
    lastSuccessfulSync("measurements"),
  ]);
  if (!details) return null;
  const { result, site, turbine } = details;

  return {
    siteName: site.name,
    mastName: details.mastName,
    appVersion,
    dataAsOf: result.windowEnd,
    calculatedAt: result.calculatedAt,
    outage: sourceOutage(lastSync, new Date(), maxSyncAgeMinutes()),
    quality: result.quality,
    p50Mwh: result.p50Mwh,
    p90Mwh: result.p90Mwh,
    grossAepMwh: result.grossAepMwh,
    netAepMwh: result.netAepMwh,
    uncertainty: site.uncertainty,
    coverage: {
      ratio: result.coverageRatio,
      validHours: result.validHours,
      rejectedHours: result.rejectedHours,
      missingHours: result.missingHours,
      windowStart: result.windowStart,
      windowEnd: result.windowEnd,
    },
    turbine: { name: turbine.name, version: turbine.version, ratedPowerKw: turbine.ratedPowerKw },
    siteVersion: site.version,
    derivation: deriveYield({
      meanWindSpeedMs: result.meanWindSpeedMs,
      measurementHeightM: result.measurementHeightM,
      hubHeightM: turbine.hubHeightM,
      shearExponent: site.shearExponent,
      hubHeightFactor: result.hubHeightFactor,
      grossAepMwh: result.grossAepMwh,
      losses: {
        availability: site.lossAvailability,
        electrical: site.lossElectrical,
        wake: site.lossWake,
      },
      uncertainty: site.uncertainty,
      ratedPowerKw: turbine.ratedPowerKw,
    }),
  };
}
