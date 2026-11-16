export type HealthStatus = "ok" | "stale" | "never_synced";

/** Default: sync runs hourly, so > 2 h without a successful run means something is wrong. */
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
