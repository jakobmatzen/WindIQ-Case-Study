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
): { hours: number } | null {
  const { status, ageMinutes } = evaluateSyncFreshness(lastSuccessAt, now, maxAgeMinutes);
  return status === "stale" && ageMinutes !== null ? { hours: Math.floor(ageMinutes / 60) } : null;
}
