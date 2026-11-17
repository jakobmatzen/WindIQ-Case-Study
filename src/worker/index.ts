/**
 * Background worker: runs scheduled jobs (e.g. fetching measurements).
 * Runs as its own container next to the web app, exactly one per environment.
 *
 *   local:  bun run worker
 *   docker: bun worker.js  (bundled by `bun run build:worker`)
 */
import { eq } from "drizzle-orm";
import { getDb, schema } from "../db";

const INTERVAL_MS = Number(process.env.SYNC_INTERVAL_MS) || 15 * 60_000;
const HEARTBEAT_FILE = process.env.WORKER_HEARTBEAT_FILE ?? "/tmp/worker-heartbeat";

let stopping = false;

function log(level: "info" | "error", msg: string, extra: Record<string, unknown> = {}) {
  // One JSON object per line: easy to grep and to ship to a log service later.
  console[level](JSON.stringify({ ts: new Date().toISOString(), level, msg, ...extra }));
}

/** Records a sync run in `sync_runs` around the given job function. */
async function runJob(job: string, fn: () => Promise<number>) {
  const db = getDb();
  const [run] = await db
    .insert(schema.syncRuns)
    .values({ job })
    .returning({ id: schema.syncRuns.id });
  if (!run) throw new Error(`could not record sync run for job "${job}"`);
  const started = Date.now();
  try {
    const items = await fn();
    await db
      .update(schema.syncRuns)
      .set({ status: "success", finishedAt: new Date(), itemsProcessed: items })
      .where(eq(schema.syncRuns.id, run.id));
    log("info", "job succeeded", { job, items, durationMs: Date.now() - started });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await db
      .update(schema.syncRuns)
      .set({ status: "error", finishedAt: new Date(), error: message })
      .where(eq(schema.syncRuns.id, run.id));
    log("error", "job failed", { job, error: message, durationMs: Date.now() - started });
  }
}

async function syncMeasurements(): Promise<number> {
  // TODO: fetch new/updated measurements from the WindIQ API and upsert them.
  return 0;
}

async function tick() {
  try {
    await runJob("measurements", syncMeasurements);
  } catch (error) {
    // e.g. DB unreachable: log and try again next tick, never crash the loop.
    log("error", "tick failed", { error: error instanceof Error ? error.message : String(error) });
  }
}

async function heartbeat() {
  await Bun.write(HEARTBEAT_FILE, new Date().toISOString());
}

async function main() {
  log("info", "worker started", { intervalMs: INTERVAL_MS });
  for (const signal of ["SIGTERM", "SIGINT"] as const) {
    process.once(signal, () => {
      log("info", "shutting down", { signal });
      stopping = true;
    });
  }

  const heartbeatTimer = setInterval(() => void heartbeat(), 30_000);
  await heartbeat();

  while (!stopping) {
    await tick();
    // Sleep in small steps so SIGTERM stops the worker quickly.
    const until = Date.now() + INTERVAL_MS;
    while (!stopping && Date.now() < until) await Bun.sleep(1_000);
  }

  clearInterval(heartbeatTimer);
  process.exit(0);
}

void main();
