import {
  date,
  doublePrecision,
  integer,
  pgEnum,
  pgTable,
  primaryKey,
  serial,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import { MEASUREMENT_STATUSES } from "@/core/measurement";

/**
 * Edit/extend the schema here, then run `bun run db:generate --name <change>`
 * to create a new migration in ./drizzle.
 *
 * Every table calls `.enableRLS()` without policies: the app only talks to the DB
 * via Drizzle (role `postgres`, bypasses RLS), so Supabase's public Data API
 * gets no access at all.
 */

export const syncStatus = pgEnum("sync_status", ["running", "success", "error"]);

/** One row per worker sync run. Used for the health check and the operations page. */
export const syncRuns = pgTable("sync_runs", {
  id: serial("id").primaryKey(),
  // TypeScript-only enum: no DB constraint, so adding a job needs no migration.
  job: text("job", { enum: ["measurements"] }).notNull(),
  status: syncStatus("status").notNull().default("running"),
  startedAt: timestamp("started_at", { withTimezone: true }).defaultNow().notNull(),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
  itemsProcessed: integer("items_processed").notNull().default(0),
  error: text("error"),
}).enableRLS();

export type SyncRun = typeof syncRuns.$inferSelect;

/** Worker jobs that record runs in `sync_runs`. */
export type SyncJob = SyncRun["job"];

/** Measurement masts. One row per mast; readings reference it, so more masts need no schema change. */
export const masts = pgTable("masts", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  latitude: doublePrecision("latitude").notNull(),
  longitude: doublePrecision("longitude").notNull(),
  measurementHeightM: doublePrecision("measurement_height_m").notNull(),
  operator: text("operator").notNull(),
  commissionedAt: date("commissioned_at").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}).enableRLS();

export const measurementStatus = pgEnum("measurement_status", MEASUREMENT_STATUSES);

/**
 * Hourly wind readings, checked by core/measurement. One row per mast and hour (UTC);
 * the newest version of a reading wins. The raw value is kept next to the result for traceability.
 */
export const measurements = pgTable(
  "measurements",
  {
    mastId: text("mast_id")
      .notNull()
      .references(() => masts.id),
    hour: timestamp("hour", { withTimezone: true }).notNull(),
    status: measurementStatus("status").notNull(),
    /** m/s at measurement height; null when the reading is rejected. */
    windSpeedMs: doublePrecision("wind_speed_ms"),
    rawValue: text("raw_value"),
    unit: text("unit").notNull(),
    windDirectionDeg: doublePrecision("wind_direction_deg"),
    version: integer("version").notNull(),
    /** `updated_at` of the reading at the source. */
    sourceUpdatedAt: timestamp("source_updated_at", { withTimezone: true }).notNull(),
    syncedAt: timestamp("synced_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [primaryKey({ columns: [t.mastId, t.hour] })],
).enableRLS();
