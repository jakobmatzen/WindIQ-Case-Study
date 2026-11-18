import "server-only";
import { lastSuccessfulSync } from "@/db";

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
