import "server-only";
import { connection } from "next/server";
import { sourceOutage } from "@/lib/health";
import { lastSuccessfulSync } from "@/db";

/** The age limit for the last successful run, shared by `/api/health` and the outage banner. */
export function maxSyncAgeMinutes(): number | undefined {
  return Number(process.env.HEALTH_MAX_SYNC_AGE_MINUTES) || undefined;
}

/** When the measurement sync and the yield calculation last succeeded (null if never). */
export async function getLastSuccessfulRuns(): Promise<{
  measurements: Date | null;
  yield: Date | null;
}> {
  const [measurements, calculation] = await Promise.all([
    lastSuccessfulSync("measurements"),
    lastSuccessfulSync("yield"),
  ]);
  return { measurements, yield: calculation };
}

/** How long the data source has been unreachable, or null while the sync works. */
export async function getSourceOutage(): Promise<{ duration: string } | null> {
  await connection(); // request time only: the build never touches the database
  return sourceOutage(await lastSuccessfulSync("measurements"), new Date(), maxSyncAgeMinutes());
}
