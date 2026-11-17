import "server-only";
import { lastSuccessfulSync } from "@/db";

/** When the measurement sync last finished successfully, or null if it never did. */
export async function getLastMeasurementSync(): Promise<Date | null> {
  return lastSuccessfulSync("measurements");
}
