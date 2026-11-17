import "server-only";
import { and, desc, eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import type { SyncJob } from "@/db/schema";

/** When the given worker job last finished successfully, or null if it never did. */
export async function getLastSuccessfulSync(job: SyncJob): Promise<Date | null> {
  const [last] = await getDb()
    .select({ finishedAt: schema.syncRuns.finishedAt })
    .from(schema.syncRuns)
    .where(and(eq(schema.syncRuns.job, job), eq(schema.syncRuns.status, "success")))
    .orderBy(desc(schema.syncRuns.finishedAt))
    .limit(1);
  return last?.finishedAt ?? null;
}
