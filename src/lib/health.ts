export type HealthStatus = "ok" | "stale" | "never_synced";

/** Default: the sync runs every 15 minutes, so > 2 h without a successful run means something is wrong. */
export const DEFAULT_MAX_SYNC_AGE_MINUTES = 120;

export function evaluateSyncFreshness(
  lastSuccessAt: Date | null,
  now: Date,
  maxAgeMinutes = DEFAULT_MAX_SYNC_AGE_MINUTES,
): { status: HealthStatus; ageMinutes: number | null } {
  if (!lastSuccessAt) return { status: "never_synced", ageMinutes: null };
  const ageMinutes = Math.floor((now.getTime() - lastSuccessAt.getTime()) / 60_000);
  return { status: ageMinutes > maxAgeMinutes ? "stale" : "ok", ageMinutes };
}

/**
 * Whether the page should say that the data source is unreachable: the last successful sync is
 * older than the limit. Null when it is fresh, or before the first sync (nothing shown yet).
 */
export function sourceOutage(
  lastSuccessAt: Date | null,
  now: Date,
  maxAgeMinutes = DEFAULT_MAX_SYNC_AGE_MINUTES,
): { duration: string } | null {
  const { status, ageMinutes } = evaluateSyncFreshness(lastSuccessAt, now, maxAgeMinutes);
  if (status !== "stale" || ageMinutes === null) return null;
  // Whole hours, or minutes below an hour (only with a limit under 60), never "0 h".
  const duration = ageMinutes < 60 ? `${ageMinutes} min` : `${Math.floor(ageMinutes / 60)} h`;
  return { duration };
}

export type RunDisplayStatus = "running" | "success" | "error" | "aborted";

/**
 * How a worker run is shown. A run that is still open after the limit was cut off (the worker
 * stopped mid-run, e.g. on a deploy) and never finished, so it is shown as aborted, not running.
 */
export function runDisplayStatus(
  run: { status: "running" | "success" | "error"; startedAt: Date },
  now: Date,
  maxAgeMinutes = DEFAULT_MAX_SYNC_AGE_MINUTES,
): RunDisplayStatus {
  if (run.status !== "running") return run.status;
  const ageMinutes = (now.getTime() - run.startedAt.getTime()) / 60_000;
  return ageMinutes > maxAgeMinutes ? "aborted" : "running";
}
