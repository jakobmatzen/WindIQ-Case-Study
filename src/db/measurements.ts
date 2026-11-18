import { and, asc, between, desc, eq, lte, sql } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import type { HourWindow } from "@/core/coverage";
import type { Mast } from "@/core/mast";
import type { CheckedMeasurement, MeasurementStatus } from "@/core/measurement";
import { getDb } from "./client";
import { masts, measurements } from "./schema";

/** Repository for masts and their hourly readings. */

// Hours from the future are stored but never count as "newest": one bad timestamp must not
// push the next `since` and the coverage window into the future.
const notInFuture = lte(measurements.hour, sql`now()`);

/** The incoming value of a column inside ON CONFLICT DO UPDATE, named from the schema. */
const excluded = (column: AnyPgColumn) => sql.raw(`excluded."${column.name}"`);

export async function upsertMast(mast: Mast): Promise<void> {
  const values = { ...mast, updatedAt: new Date() };
  await getDb().insert(masts).values(values).onConflictDoUpdate({ target: masts.id, set: values });
}

/** The newest hour stored for a mast, or null before the first import. */
export async function newestMeasurementHour(mastId: string): Promise<Date | null> {
  const [row] = await getDb()
    .select({ hour: measurements.hour })
    .from(measurements)
    .where(and(eq(measurements.mastId, mastId), notInFuture))
    .orderBy(desc(measurements.hour))
    .limit(1);
  return row?.hour ?? null;
}

/**
 * Inserts checked readings, or updates the stored hour when the incoming version is newer.
 * Same or older versions leave the row alone. Returns the number of readings actually written.
 */
export async function upsertMeasurements(
  mastId: string,
  readings: CheckedMeasurement[],
): Promise<number> {
  if (readings.length === 0) return 0;
  const rows = readings.map((r) => ({
    mastId,
    hour: r.hour,
    status: r.status,
    windSpeedMs: r.windSpeedMs,
    rawValue: r.rawValue,
    unit: r.unit,
    windDirectionDeg: r.windDirectionDeg,
    version: r.version,
    sourceUpdatedAt: r.updatedAt,
  }));
  const written = await getDb()
    .insert(measurements)
    .values(rows)
    .onConflictDoUpdate({
      target: [measurements.mastId, measurements.hour],
      set: {
        status: excluded(measurements.status),
        windSpeedMs: excluded(measurements.windSpeedMs),
        rawValue: excluded(measurements.rawValue),
        unit: excluded(measurements.unit),
        windDirectionDeg: excluded(measurements.windDirectionDeg),
        version: excluded(measurements.version),
        sourceUpdatedAt: excluded(measurements.sourceUpdatedAt),
        syncedAt: sql`now()`,
      },
      setWhere: sql`${excluded(measurements.version)} > ${measurements.version}`,
    })
    .returning({ hour: measurements.hour });

  return written.length;
}

/** All masts, by id. */
export async function listMasts(): Promise<{ id: string; name: string }[]> {
  return getDb().select({ id: masts.id, name: masts.name }).from(masts).orderBy(asc(masts.id));
}

/** Hour, status and wind speed of every stored reading of a mast inside the window. */
export async function measurementsInWindow(
  mastId: string,
  window: HourWindow,
): Promise<{ hour: Date; status: MeasurementStatus; windSpeedMs: number | null }[]> {
  return getDb()
    .select({
      hour: measurements.hour,
      status: measurements.status,
      windSpeedMs: measurements.windSpeedMs,
    })
    .from(measurements)
    .where(
      and(eq(measurements.mastId, mastId), between(measurements.hour, window.start, window.end)),
    );
}
