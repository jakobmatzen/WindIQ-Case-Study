import "server-only";
import { lastSuccessfulSync } from "@/db";

/** The age limit for the last successful run, shared by `/api/health` and the dashboard's outage notice. */
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
