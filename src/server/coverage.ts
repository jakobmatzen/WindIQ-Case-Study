import "server-only";
import { connection } from "next/server";
import { calculateCoverage, rollingYear } from "@/core/coverage";
import { currentMast, measurementStatuses } from "@/db";

export type CoverageDto = {
  mastName: string;
  windowStart: Date;
  windowEnd: Date;
  validHours: number;
  rejectedHours: number;
  missingHours: number;
  ratio: number;
};

/** Data coverage of the last 12 months for the current mast, or null before the first import. */
export async function getDataCoverage(): Promise<CoverageDto | null> {
  await connection(); // request time only: the build never touches the database
  const mast = await currentMast();
  if (!mast) return null;
  const window = rollingYear(mast.newestHour);
  const coverage = calculateCoverage(await measurementStatuses(mast.mastId, window), window);
  return {
    mastName: mast.name,
    windowStart: window.start,
    windowEnd: window.end,
    validHours: coverage.validHours,
    rejectedHours: coverage.rejectedHours,
    missingHours: coverage.missingHours,
    ratio: coverage.ratio,
  };
}
