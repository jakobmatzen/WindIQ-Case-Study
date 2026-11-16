import { integer, pgEnum, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

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
  job: text("job").notNull(),
  status: syncStatus("status").notNull().default("running"),
  startedAt: timestamp("started_at", { withTimezone: true }).defaultNow().notNull(),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
  itemsProcessed: integer("items_processed").notNull().default(0),
  error: text("error"),
}).enableRLS();

export type SyncRun = typeof syncRuns.$inferSelect;
