import { and, desc, eq } from "drizzle-orm";
import { getDb } from "./client";
import { syncRuns, type SyncJob, type SyncRun } from "./schema";

/** Repository for `sync_runs`: every worker run is started, then finished or failed. */

export async function startSyncRun(job: SyncJob): Promise<number> {
  const [run] = await getDb().insert(syncRuns).values({ job }).returning({ id: syncRuns.id });
  if (!run) throw new Error(`could not record sync run for job "${job}"`);
  return run.id;
}

/** What a run stored: items processed, and how many of them corrected a stored reading. */
export type SyncRunCounts = { items: number; corrections: number };

export async function finishSyncRun(id: number, counts: SyncRunCounts): Promise<void> {
  await getDb()
    .update(syncRuns)
    .set({
      status: "success",
      finishedAt: new Date(),
      itemsProcessed: counts.items,
      corrections: counts.corrections,
    })
    .where(eq(syncRuns.id, id));
}

/** Marks a run failed, keeping what it stored before the failure. */
export async function failSyncRun(id: number, error: string, counts: SyncRunCounts): Promise<void> {
  await getDb()
    .update(syncRuns)
    .set({
      status: "error",
      finishedAt: new Date(),
      error,
      itemsProcessed: counts.items,
      corrections: counts.corrections,
    })
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

/** The newest runs of all jobs, newest first. */
export async function recentSyncRuns(limit: number): Promise<SyncRun[]> {
  return getDb().select().from(syncRuns).orderBy(desc(syncRuns.startedAt)).limit(limit);
}
