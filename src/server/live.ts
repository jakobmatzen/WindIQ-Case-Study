import "server-only";
import { connection } from "next/server";
import { lastSuccessfulSync, syncActivityToken } from "@/db";
import { sourceOutage } from "@/lib/health";
import { maxSyncAgeMinutes } from "./health";

/**
 * The current data version for the dashboard's live refresh. It changes when the worker starts
 * or finishes a run, and when the data turns stale: a stopped worker writes nothing, so the
 * version must flip on time alone for an open page to show the outage. Throws when the
 * database is unreachable; null before the first run.
 */
export async function getDataVersion(): Promise<string | null> {
  await connection();
  const [activity, lastSync] = await Promise.all([
    syncActivityToken(),
    lastSuccessfulSync("measurements"),
  ]);
  if (activity === null) return null;
  const stale = sourceOutage(lastSync, new Date(), maxSyncAgeMinutes()) !== null;
  return `${activity}:${stale ? "stale" : "fresh"}`;
}
