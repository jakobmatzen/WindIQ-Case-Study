import { and, between, desc, eq, lte, sql } from "drizzle-orm";
import type { HourWindow } from "@/core/coverage";
import type { Mast } from "@/core/mast";
import type { CheckedMeasurement, MeasurementStatus } from "@/core/measurement";
import { getDb } from "./client";
import { masts, measurements } from "./schema";

/** Repository for masts and their hourly readings. */

// Hours from the future are stored but never count as "newest": one bad timestamp must not
// push the next `since` and the coverage window into the future.
const notInFuture = lte(measurements.hour, sql`now()`);

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
        status: sql`excluded.status`,
        windSpeedMs: sql`excluded.wind_speed_ms`,
        rawValue: sql`excluded.raw_value`,
        unit: sql`excluded.unit`,
        windDirectionDeg: sql`excluded.wind_direction_deg`,
        version: sql`excluded.version`,
        sourceUpdatedAt: sql`excluded.source_updated_at`,
        syncedAt: sql`now()`,
      },
      setWhere: sql`excluded.version > ${measurements.version}`,
    })
    .returning({ hour: measurements.hour });
  return written.length;
}

/** Mast whose readings reach furthest, with that newest hour. The UI shows this one mast for now. */
export async function currentMast(): Promise<{
  mastId: string;
  name: string;
  newestHour: Date;
} | null> {
  const [row] = await getDb()
    .select({
      mastId: measurements.mastId,
      name: masts.name,
      newestHour: sql<Date>`max(${measurements.hour})`.mapWith(measurements.hour),
    })
    .from(measurements)
    .innerJoin(masts, eq(masts.id, measurements.mastId))
    .where(notInFuture)
    .groupBy(measurements.mastId, masts.name)
    .orderBy(desc(sql`max(${measurements.hour})`))
    .limit(1);
  return row ?? null;
}

/** Hour and status of every stored reading of a mast inside the window. */
export async function measurementStatuses(
  mastId: string,
  window: HourWindow,
): Promise<{ hour: Date; status: MeasurementStatus }[]> {
  return getDb()
    .select({ hour: measurements.hour, status: measurements.status })
    .from(measurements)
    .where(
      and(eq(measurements.mastId, mastId), between(measurements.hour, window.start, window.end)),
    );
}
