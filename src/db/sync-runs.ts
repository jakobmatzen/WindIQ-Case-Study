import { and, desc, eq } from "drizzle-orm";
import { getDb } from "./client";
import { syncRuns, type SyncJob } from "./schema";

/** Repository for `sync_runs`: every worker run is started, then finished or failed. */

export async function startSyncRun(job: SyncJob): Promise<number> {
  const [run] = await getDb().insert(syncRuns).values({ job }).returning({ id: syncRuns.id });
  if (!run) throw new Error(`could not record sync run for job "${job}"`);
  return run.id;
}

export async function finishSyncRun(id: number, itemsProcessed: number): Promise<void> {
  await getDb()
    .update(syncRuns)
    .set({ status: "success", finishedAt: new Date(), itemsProcessed })
    .where(eq(syncRuns.id, id));
}

export async function failSyncRun(id: number, error: string): Promise<void> {
  await getDb()
    .update(syncRuns)
    .set({ status: "error", finishedAt: new Date(), error })
    .where(eq(syncRuns.id, id));
}

/** When the given job last finished successfully, or null if it never did. */
export async function lastSuccessfulSync(job: SyncJob): Promise<Date | null> {
  const [last] = await getDb()
    .select({ finishedAt: syncRuns.finishedAt })
    .from(syncRuns)
    .where(and(eq(syncRuns.job, job), eq(syncRuns.status, "success")))
    .orderBy(desc(syncRuns.finishedAt))
    .limit(1);
  return last?.finishedAt ?? null;
}
