import { connection } from "next/server";
import { evaluateSyncFreshness } from "@/lib/health";
import { getLastSuccessfulRuns } from "@/server/health";

/**
 * Readiness: is the system actually doing its job?
 * Checks the DB connection and how fresh the last successful run of each worker job is:
 * the measurement sync and the yield calculation.
 * Returns 503 when something is wrong, so external uptime monitors alert.
 */
export async function GET() {
  await connection();
  const maxAge = Number(process.env.HEALTH_MAX_SYNC_AGE_MINUTES) || undefined;

  try {
    const lastRuns = await getLastSuccessfulRuns();
    const now = new Date();
    const sync = evaluateSyncFreshness(lastRuns.measurements, now, maxAge);
    const calculation = evaluateSyncFreshness(lastRuns.yield, now, maxAge);
    const healthy = sync.status === "ok" && calculation.status === "ok";

    return Response.json(
      { status: healthy ? "ok" : "degraded", checks: { database: "ok", sync, yield: calculation } },
      { status: healthy ? 200 : 503, headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("[health] database check failed", error);
    return Response.json(
      { status: "down", checks: { database: "error" } },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
