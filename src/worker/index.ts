/**
 * Background worker: runs scheduled jobs (e.g. fetching measurements).
 * Runs as its own container next to the web app, exactly one per environment.
 *
 *   local:  bun run worker
 *   docker: bun worker.js  (bundled by `bun run build:worker`)
 *   once:   add `--once` to run a single sync and exit (manual resync, local checks)
 */
import { rollingYear } from "@/core/coverage";
import { checkMeasurement, newestPerHour } from "@/core/measurement";
import { calculateYield } from "@/core/yield";
import {
  failSyncRun,
  finishSyncRun,
  insertYieldResult,
  latestYieldResult,
  measurementsInWindow,
  newestMeasurementHour,
  saveSiteVersion,
  saveTurbineVersion,
  startSyncRun,
  upsertMast,
  upsertMeasurements,
  type SyncJob,
} from "@/db";
import type { MeasurementSource, SiteDataSource } from "@/sources/types";
import { createWindiqSource } from "@/sources/windiq";

const INTERVAL_MS = Number(process.env.SYNC_INTERVAL_MS) || 15 * 60_000;
const HEARTBEAT_FILE = process.env.WORKER_HEARTBEAT_FILE ?? "/tmp/worker-heartbeat";

let stopping = false;

function log(level: "info" | "error", msg: string, extra: Record<string, unknown> = {}) {
  // One JSON object per line: easy to grep and to ship to a log service later.
  console[level](JSON.stringify({ ts: new Date().toISOString(), level, msg, ...extra }));
}

/**
 * Records a sync run in `sync_runs` around the given job function.
 * Returns the number of items it processed, or null when it failed.
 */
async function runJob(job: SyncJob, fn: () => Promise<number>): Promise<number | null> {
  const runId = await startSyncRun(job);
  const started = Date.now();
  try {
    const items = await fn();
    await finishSyncRun(runId, items);
    log("info", "job succeeded", { job, items, durationMs: Date.now() - started });
    return items;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await failSyncRun(runId, message);
    log("error", "job failed", { job, error: message, durationMs: Date.now() - started });
    return null;
  }
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set`);
  return value;
}

function windiqSource(): MeasurementSource & SiteDataSource {
  return createWindiqSource({
    baseUrl: requireEnv("WINDIQ_API_BASE_URL"),
    clientId: requireEnv("WINDIQ_CLIENT_ID"),
    clientSecret: requireEnv("WINDIQ_CLIENT_SECRET"),
  });
}

/**
 * First run: imports the whole year the source offers. Later runs: everything from the newest
 * stored hour on (that hour included, so a newer version of it is picked up too).
 * Returns the number of readings written.
 */
async function syncMeasurements(source: MeasurementSource): Promise<number> {
  const mast = await source.fetchMast();
  await upsertMast(mast);

  const since = (await newestMeasurementHour(mast.id)) ?? undefined;
  let written = 0;
  for await (const page of source.fetchMeasurements({ since })) {
    written += await upsertMeasurements(mast.id, newestPerHour(page.map(checkMeasurement)));
  }
  return written;
}

/**
 * Fetches mast, turbine and site, stores new versions, and calculates the yield of the rolling year.
 * Stores a new result only when something it depends on changed: the readings, the window,
 * h_Mess, or the turbine or site version. Returns 1 when it stored a result, else 0.
 */
async function recalculateYield(
  source: MeasurementSource & SiteDataSource,
  readingsChanged: boolean,
): Promise<number> {
  const [mast, turbine, site] = await Promise.all([
    source.fetchMast(),
    source.fetchTurbine(),
    source.fetchSite(),
  ]);
  if (site.mastId !== mast.id) {
    throw new Error(`site ${site.id} belongs to mast ${site.mastId}, not to mast ${mast.id}`);
  }
  await upsertMast(mast);
  await saveTurbineVersion(turbine);
  await saveSiteVersion(site);

  const newestHour = await newestMeasurementHour(mast.id);
  if (!newestHour) return 0;

  const previous = await latestYieldResult(mast.id);
  const unchanged =
    previous !== null &&
    !readingsChanged &&
    previous.windowEnd.getTime() === newestHour.getTime() &&
    previous.measurementHeightM === mast.measurementHeightM &&
    previous.turbineId === turbine.id &&
    previous.turbineVersion === turbine.version &&
    previous.siteId === site.id &&
    previous.siteVersion === site.version;
  if (unchanged) return 0;

  const window = rollingYear(newestHour);
  const readings = await measurementsInWindow(mast.id, window);
  const result = calculateYield({ readings, window, mast, turbine, site });
  await insertYieldResult(result, mast.measurementHeightM);
  log("info", "yield calculated", {
    p50Mwh: Math.round(result.p50Mwh),
    p90Mwh: Math.round(result.p90Mwh),
    coverage: result.coverage.ratio,
    quality: result.quality,
    turbineVersion: turbine.version,
    siteVersion: site.version,
  });
  return 1;
}

/** One round of all jobs. Never throws, so the loop survives; returns whether everything succeeded. */
async function tick(): Promise<boolean> {
  try {
    // The source is created inside each job, so missing configuration is recorded as a failed run.
    const written = await runJob("measurements", () => syncMeasurements(windiqSource()));
    // Runs even when the sync failed: a new turbine or site version still changes the result.
    const calculated = await runJob("yield", () =>
      recalculateYield(windiqSource(), written !== null && written > 0),
    );
    return written !== null && calculated !== null;
  } catch (error) {
    // e.g. DB unreachable: log and try again next tick, never crash the loop.
    log("error", "tick failed", { error: error instanceof Error ? error.message : String(error) });
    return false;
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

if (process.argv.includes("--once")) {
  process.exit((await tick()) ? 0 : 1);
} else {
  void main();
}
