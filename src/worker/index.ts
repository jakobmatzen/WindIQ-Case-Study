/**
 * Background worker: runs scheduled jobs (e.g. fetching measurements).
 * Runs as its own container next to the web app, exactly one per environment.
 *
 *   local:  bun run worker
 *   docker: bun worker.js  (bundled by `bun run build:worker`)
 *   once:   add `--once` to run a single sync and exit (manual resync, local checks)
 */
import { rollingYear } from "@/core/coverage";
import {
  checkMeasurement,
  compareWithStored,
  newestPerHour,
  nextCorrectionCursor,
  type MeasurementInput,
} from "@/core/measurement";
import { calculateYield, sameFingerprint } from "@/core/yield";
import {
  correctionCursor,
  failSyncRun,
  finishSyncRun,
  insertYieldResult,
  latestYieldResult,
  measurementsInWindow,
  newestMeasurementHour,
  newestReadingSync,
  saveCorrectionCursor,
  saveSiteVersion,
  saveTurbineVersion,
  startSyncRun,
  storedVersions,
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

/** What a job did so far: items processed, and how many of them corrected a stored reading. */
type JobOutcome = { items: number; corrections: number };

/**
 * Records a sync run in `sync_runs` around the given job function. The job fills in `outcome` as
 * it goes, so a run that fails halfway still records what it stored before failing.
 * Returns the outcome, or null when the job failed.
 */
async function runJob(
  job: SyncJob,
  fn: (outcome: JobOutcome) => Promise<void>,
): Promise<JobOutcome | null> {
  const runId = await startSyncRun(job);
  const started = Date.now();
  const outcome: JobOutcome = { items: 0, corrections: 0 };
  try {
    await fn(outcome);
    await finishSyncRun(runId, outcome);
    log("info", "job succeeded", { job, ...outcome, durationMs: Date.now() - started });
    return outcome;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await failSyncRun(runId, message, outcome);
    log("error", "job failed", {
      job,
      ...outcome,
      error: message,
      durationMs: Date.now() - started,
    });
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
 * How far each correction fetch reaches back before the saved cursor. Covers corrections made
 * while an earlier fetch was paging, and readings the source's offset paging skips when a reading
 * on an earlier page is corrected again mid-fetch, as long as that fetch spans less than this.
 * Fetching a reading twice is harmless: its version is not higher the second time.
 */
const CORRECTION_OVERLAP_MS = 60 * 60_000;

/**
 * Brings the stored readings of the mast up to date.
 * Without a correction cursor (first import, or the first run with this feature) it fetches the
 * whole year, which brings every correction made so far, and starts the cursor from the newest
 * `updated_at` it saw. Otherwise, in two passes:
 * 1. New hours: everything from the newest stored hour on (`since`). First, so a correction
 *    fetch that keeps failing cannot hold back new hours.
 * 2. Corrections: everything written at the source since the cursor (`updated_since`).
 * The cursor is saved after every page, so a run that fails halfway resumes where it stopped.
 * A reading is written only when its hour is new or its version is higher than the stored one.
 */
async function syncMeasurements(source: MeasurementSource, outcome: JobOutcome): Promise<void> {
  const mast = await source.fetchMast();
  await upsertMast(mast);

  /** Stores the new and corrected readings of a page; returns all of them, checked. */
  async function store(page: MeasurementInput[]) {
    const checked = page.map(checkMeasurement);
    const readings = newestPerHour(checked);
    const stored = await storedVersions(
      mast.id,
      readings.map((r) => r.hour),
    );
    const { added, corrected } = compareWithStored(readings, stored);
    await upsertMeasurements(mast.id, [...added, ...corrected]);
    outcome.items += added.length + corrected.length;
    outcome.corrections += corrected.length;
    return checked;
  }

  /** Stores every page and moves the correction cursor along with the `updated_at`s seen. */
  async function storeAndAdvance(pages: AsyncIterable<MeasurementInput[]>, from: Date | null) {
    let cursor = from;
    for await (const page of pages) {
      cursor = nextCorrectionCursor(cursor, await store(page), new Date());
      if (cursor) await saveCorrectionCursor(mast.id, cursor);
    }
  }

  const cursor = await correctionCursor(mast.id);
  if (!cursor) {
    await storeAndAdvance(source.fetchMeasurements({}), null);
    return;
  }

  const since = (await newestMeasurementHour(mast.id)) ?? undefined;
  for await (const page of source.fetchMeasurements({ since })) await store(page);

  const updatedSince = new Date(cursor.getTime() - CORRECTION_OVERLAP_MS);
  await storeAndAdvance(source.fetchMeasurements({ updatedSince }), cursor);
}

/**
 * Fetches mast, turbine and site, stores new versions, and calculates the yield of the rolling year.
 * Stores a new result only when something it depends on changed: the readings, the window,
 * h_Mess, or the turbine or site version. Everything it compares comes from the database, so a
 * correction is picked up even when the run right after its sync failed.
 * Counts 1 item when it stored a result, else 0.
 */
async function recalculateYield(
  source: MeasurementSource & SiteDataSource,
  outcome: JobOutcome,
): Promise<void> {
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
  if (!newestHour) return;
  const window = rollingYear(newestHour);
  // Never null here: the newest hour itself lies in the window.
  const readingsSyncedAt = await newestReadingSync(mast.id, window);
  if (!readingsSyncedAt) throw new Error(`no readings for mast ${mast.id} in its own window`);

  const current = {
    mastId: mast.id,
    measurementHeightM: mast.measurementHeightM,
    turbineId: turbine.id,
    turbineVersion: turbine.version,
    siteId: site.id,
    siteVersion: site.version,
    windowEnd: newestHour,
    readingsSyncedAt,
  };
  if (sameFingerprint(await latestYieldResult(mast.id), current)) return;

  const readings = await measurementsInWindow(mast.id, window);
  const result = calculateYield({ readings, window, mast, turbine, site });
  await insertYieldResult(result, readingsSyncedAt);
  log("info", "yield calculated", {
    p50Mwh: Math.round(result.p50Mwh),
    p90Mwh: Math.round(result.p90Mwh),
    coverage: result.coverage.ratio,
    quality: result.quality,
    turbineVersion: turbine.version,
    siteVersion: site.version,
  });
  outcome.items = 1;
}

/** One round of all jobs. Never throws, so the loop survives; returns whether everything succeeded. */
async function tick(): Promise<boolean> {
  try {
    // One source per tick (one token), created on first use inside a job,
    // so missing configuration is recorded as a failed run.
    let windiq: ReturnType<typeof windiqSource> | undefined;
    const source = () => (windiq ??= windiqSource());
    const synced = await runJob("measurements", (outcome) => syncMeasurements(source(), outcome));
    // Runs even when the sync failed: a new turbine or site version still changes the result.
    const calculated = await runJob("yield", (outcome) => recalculateYield(source(), outcome));
    return synced !== null && calculated !== null;
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
