import "server-only";
import { connection } from "next/server";
import type { YieldQuality } from "@/core/yield";
import { latestYieldResult, listMasts } from "@/db";

export type YieldDto = {
  mastName: string;
  calculatedAt: Date;
  p50Mwh: number;
  p90Mwh: number;
  grossAepMwh: number;
  netAepMwh: number;
  quality: YieldQuality;
  coverage: {
    ratio: number;
    validHours: number;
    rejectedHours: number;
    missingHours: number;
    windowStart: Date;
    windowEnd: Date;
  };
  turbineVersion: number;
  siteVersion: number;
};

/**
 * The latest stored yield result, or null before the first calculation.
 * The page never calculates: it shows what the worker stored, even while the API is down.
 * The UI shows one mast for now: the first one by id.
 */
export async function getLatestYield(): Promise<YieldDto | null> {
  await connection(); // request time only: the build never touches the database
  const [mast] = await listMasts();
  if (!mast) return null;
  const result = await latestYieldResult(mast.id);
  if (!result) return null;
  return {
    mastName: mast.name,
    calculatedAt: result.calculatedAt,
    p50Mwh: result.p50Mwh,
    p90Mwh: result.p90Mwh,
    grossAepMwh: result.grossAepMwh,
    netAepMwh: result.netAepMwh,
    quality: result.quality,
    coverage: {
      ratio: result.coverageRatio,
      validHours: result.validHours,
      rejectedHours: result.rejectedHours,
      missingHours: result.missingHours,
      windowStart: result.windowStart,
      windowEnd: result.windowEnd,
    },
    turbineVersion: result.turbineVersion,
    siteVersion: result.siteVersion,
  };
}
