// Public entry of the db layer. Other layers import from "@/db" only.
export { getDb } from "./client";
export * as schema from "./schema";
export type { SyncJob, SyncRun } from "./schema";
export {
  listMasts,
  measurementsInWindow,
  newestMeasurementHour,
  newestReadingSync,
  upsertMast,
  upsertMeasurements,
} from "./measurements";
export { failSyncRun, finishSyncRun, lastSuccessfulSync, startSyncRun } from "./sync-runs";
export {
  insertYieldResult,
  latestYieldResult,
  saveSiteVersion,
  saveTurbineVersion,
  type StoredYieldResult,
} from "./yields";
