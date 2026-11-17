import "server-only";
import { connection } from "next/server";
import { calculateCoverage, rollingYear, type Coverage } from "@/core/coverage";
import { listMasts, measurementStatuses, newestMeasurementHour } from "@/db";

export type CoverageDto = Coverage & { mastName: string };

/**
 * Data coverage of the last 12 months, or null before the first import.
 * The UI shows one mast for now: the first one by id.
 */
export async function getDataCoverage(): Promise<CoverageDto | null> {
  await connection(); // request time only: the build never touches the database
  const [mast] = await listMasts();
  if (!mast) return null;
  const newestHour = await newestMeasurementHour(mast.id);
  if (!newestHour) return null;
  const window = rollingYear(newestHour);
  const coverage = calculateCoverage(await measurementStatuses(mast.id, window), window);
  return { mastName: mast.name, ...coverage };
}
