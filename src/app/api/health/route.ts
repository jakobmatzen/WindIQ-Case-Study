import { connection } from "next/server";
import { and, desc, eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { evaluateSyncFreshness } from "@/lib/health";

/**
 * Readiness: is the system actually doing its job?
 * Checks the DB connection and how fresh the last successful sync is.
 * Returns 503 when something is wrong, so external uptime monitors alert.
 */
export async function GET() {
  await connection();
  const maxAge = Number(process.env.HEALTH_MAX_SYNC_AGE_MINUTES) || undefined;

  try {
    const [last] = await getDb()
      .select({ finishedAt: schema.syncRuns.finishedAt })
      .from(schema.syncRuns)
      .where(and(eq(schema.syncRuns.job, "measurements"), eq(schema.syncRuns.status, "success")))
      .orderBy(desc(schema.syncRuns.finishedAt))
      .limit(1);

    const sync = evaluateSyncFreshness(last?.finishedAt ?? null, new Date(), maxAge);
    const healthy = sync.status === "ok";

    return Response.json(
      { status: healthy ? "ok" : "degraded", checks: { database: "ok", sync } },
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
