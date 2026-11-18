import {
  date,
  doublePrecision,
  foreignKey,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  serial,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import { MEASUREMENT_STATUSES } from "@/core/measurement";
import type { PowerCurvePoint } from "@/core/turbine";
import { YIELD_QUALITIES, type RejectionReason } from "@/core/yield";

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
  job: text("job", { enum: ["measurements", "yield"] }).notNull(),
  status: syncStatus("status").notNull().default("running"),
  startedAt: timestamp("started_at", { withTimezone: true }).defaultNow().notNull(),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
  itemsProcessed: integer("items_processed").notNull().default(0),
  /** Readings of this run that replaced an older version of a stored hour. */
  corrections: integer("corrections").notNull().default(0),
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

/**
 * Per mast, where the next correction fetch (`updated_since`) starts: the newest `updated_at` seen
 * at the source. Its own state, not derived from the readings, because new hours fetched by
 * `since` carry recent `updated_at`s too and would push it past corrections not fetched yet.
 */
export const measurementSyncState = pgTable("measurement_sync_state", {
  mastId: text("mast_id")
    .primaryKey()
    .references(() => masts.id),
  correctionsSince: timestamp("corrections_since", { withTimezone: true }).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}).enableRLS();

/**
 * Every turbine version the source has delivered, stored once and never changed,
 * so each yield result can point at exactly the power curve it used.
 */
export const turbineVersions = pgTable(
  "turbine_versions",
  {
    turbineId: text("turbine_id").notNull(),
    version: integer("version").notNull(),
    name: text("name").notNull(),
    ratedPowerKw: doublePrecision("rated_power_kw").notNull(),
    hubHeightM: doublePrecision("hub_height_m").notNull(),
    rotorDiameterM: doublePrecision("rotor_diameter_m").notNull(),
    cutInWindSpeedMs: doublePrecision("cut_in_wind_speed_ms").notNull(),
    cutOutWindSpeedMs: doublePrecision("cut_out_wind_speed_ms").notNull(),
    powerCurve: jsonb("power_curve").$type<PowerCurvePoint[]>().notNull(),
    /** `updated_at` of this version at the source. */
    sourceUpdatedAt: timestamp("source_updated_at", { withTimezone: true }).notNull(),
    fetchedAt: timestamp("fetched_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [primaryKey({ columns: [t.turbineId, t.version] })],
).enableRLS();

/** Every site version the source has delivered (shear, losses, uncertainty), stored once. */
export const siteVersions = pgTable(
  "site_versions",
  {
    siteId: text("site_id").notNull(),
    version: integer("version").notNull(),
    name: text("name").notNull(),
    mastId: text("mast_id").notNull(),
    shearExponent: doublePrecision("shear_exponent").notNull(),
    lossAvailability: doublePrecision("loss_availability").notNull(),
    lossElectrical: doublePrecision("loss_electrical").notNull(),
    lossWake: doublePrecision("loss_wake").notNull(),
    uncertainty: doublePrecision("uncertainty").notNull(),
    sourceUpdatedAt: timestamp("source_updated_at", { withTimezone: true }).notNull(),
    fetchedAt: timestamp("fetched_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [primaryKey({ columns: [t.siteId, t.version] })],
).enableRLS();

/** `MonthYield` as stored in JSON: the month as an ISO string. */
export type StoredMonth = {
  month: string;
  hours: number;
  validHours: number;
  energyMwh: number | null;
};

export const yieldQuality = pgEnum("yield_quality", YIELD_QUALITIES);

/**
 * One row per calculated yield, oldest first. A new row whenever readings, turbine or site change,
 * so the history of P50/P90 stays visible. Each row names the data window and the versions it used.
 */
export const yieldResults = pgTable(
  "yield_results",
  {
    id: serial("id").primaryKey(),
    calculatedAt: timestamp("calculated_at", { withTimezone: true }).defaultNow().notNull(),
    mastId: text("mast_id")
      .notNull()
      .references(() => masts.id),
    /** h_Mess used; the mast itself has no version at the source. */
    measurementHeightM: doublePrecision("measurement_height_m").notNull(),
    turbineId: text("turbine_id").notNull(),
    turbineVersion: integer("turbine_version").notNull(),
    siteId: text("site_id").notNull(),
    siteVersion: integer("site_version").notNull(),
    windowStart: timestamp("window_start", { withTimezone: true }).notNull(),
    windowEnd: timestamp("window_end", { withTimezone: true }).notNull(),
    windowHours: integer("window_hours").notNull(),
    /**
     * Newest `synced_at` of the readings in the window when this result was calculated.
     * A later sync that writes or corrects a reading moves it, so the worker knows to recalculate.
     */
    readingsSyncedAt: timestamp("readings_synced_at", { withTimezone: true }).notNull(),
    validHours: integer("valid_hours").notNull(),
    rejectedHours: integer("rejected_hours").notNull(),
    missingHours: integer("missing_hours").notNull(),
    coverageRatio: doublePrecision("coverage_ratio").notNull(),
    quality: yieldQuality("quality").notNull(),
    /** Mean wind at measurement height over the valid hours, m/s; null for rows stored before. */
    meanWindSpeedMs: doublePrecision("mean_wind_speed_ms"),
    hubHeightFactor: doublePrecision("hub_height_factor").notNull(),
    measuredEnergyMwh: doublePrecision("measured_energy_mwh").notNull(),
    grossAepMwh: doublePrecision("gross_aep_mwh").notNull(),
    lossFactor: doublePrecision("loss_factor").notNull(),
    netAepMwh: doublePrecision("net_aep_mwh").notNull(),
    p50Mwh: doublePrecision("p50_mwh").notNull(),
    p90Mwh: doublePrecision("p90_mwh").notNull(),
    /** The window per calendar month (see `MonthYield`); null for rows stored before. */
    months: jsonb("months").$type<StoredMonth[]>(),
    /** Rejected readings in the window per reason; null for rows stored before. */
    rejections: jsonb("rejections").$type<Record<RejectionReason, number>>(),
  },
  (t) => [
    foreignKey({
      name: "yield_results_turbine_version_fk",
      columns: [t.turbineId, t.turbineVersion],
      foreignColumns: [turbineVersions.turbineId, turbineVersions.version],
    }),
    foreignKey({
      name: "yield_results_site_version_fk",
      columns: [t.siteId, t.siteVersion],
      foreignColumns: [siteVersions.siteId, siteVersions.version],
    }),
    index("yield_results_mast_id_id_idx").on(t.mastId, t.id),
  ],
).enableRLS();
