import "server-only";
import { connection } from "next/server";
import { deriveYield, type YieldDerivation } from "@/core/derivation";
import {
  REJECTION_REASONS,
  type MonthYield,
  type RejectionReason,
  type YieldQuality,
} from "@/core/yield";
import {
  lastSuccessfulSync,
  latestYieldResultDetails,
  listMasts,
  recentSyncRuns,
  yieldHistory,
  type YieldHistoryPoint,
} from "@/db";
import { runDisplayStatus, sourceOutage, type RunDisplayStatus } from "@/lib/health";
import { maxSyncAgeMinutes } from "./health";

export type DashboardDto = {
  siteName: string;
  mastName: string;
  appVersion: string;
  /** Newest hour of the data window: the latest reading the result rests on. */
  dataAsOf: Date;
  calculatedAt: Date;
  /** Set while the worker cannot reach the data source; the last result stays visible. */
  outage: { duration: string } | null;
  quality: YieldQuality;
  p50Mwh: number;
  p90Mwh: number;
  grossAepMwh: number;
  netAepMwh: number;
  uncertainty: number;
  coverage: {
    ratio: number;
    validHours: number;
    rejectedHours: number;
    missingHours: number;
    windowStart: Date;
    windowEnd: Date;
  };
  turbineVersion: number;
  siteVersion: number;
  derivation: YieldDerivation;
  /** Energy and coverage per calendar month; null for a result stored before months were. */
  months: MonthYield[] | null;
  /** Rejected readings per reason; null for a result stored before they were counted. */
  rejections: Record<RejectionReason, number> | null;
  /** P50/P90 of every stored result, oldest first; empty if it cannot be read. */
  history: YieldHistoryPoint[];
  /** The latest worker runs, newest first; null if they cannot be read. */
  runs: SyncRunDto[] | null;
  statusPageUrl: string;
};

/** A worker run as the public page shows it: no raw error text, which may name internal hosts. */
export type SyncRunDto = {
  id: number;
  job: "measurements" | "yield";
  status: RunDisplayStatus;
  startedAt: Date;
  itemsProcessed: number;
  corrections: number;
};

/** About ten days of hourly results. */
const HISTORY_LIMIT = 240;

/** Public uptime page that watches `/api/health` from outside. */
const STATUS_PAGE_URL = "https://stats.uptimerobot.com/tT5SSEWYNn";

const RECENT_RUNS = 12;

/** Logs and swallows a failed secondary read: the result itself is still shown. */
function secondary<T>(what: string, fallback: T) {
  return (error: unknown): T => {
    console.error(`[dashboard] ${what} failed`, error);
    return fallback;
  };
}

/**
 * Everything the dashboard shows, or null before the first calculation.
 * The page never calculates the yield: it shows what the worker stored, even while the API is
 * down. The derivation only re-traces the stored result step by step.
 * The UI shows one mast for now: the first one by id.
 */
export async function getDashboard(): Promise<DashboardDto | null> {
  await connection(); // request time only: the build never touches the database
  const [mast] = await listMasts();
  if (!mast) return null;
  const [details, lastSync, history, runs] = await Promise.all([
    latestYieldResultDetails(mast.id),
    // Outage notice, trend and runs are secondary: if one cannot be read, the result is still shown.
    lastSuccessfulSync("measurements").catch(secondary("last sync lookup", null)),
    yieldHistory(mast.id, HISTORY_LIMIT).catch(secondary("yield history", [])),
    recentSyncRuns(RECENT_RUNS).catch(secondary("recent sync runs", null)),
  ]);
  if (!details) return null;
  const { result, site, turbine } = details;
  const now = new Date();

  return {
    siteName: site.name,
    mastName: details.mastName,
    appVersion: process.env.APP_VERSION ?? "dev",
    dataAsOf: result.windowEnd,
    calculatedAt: result.calculatedAt,
    outage: sourceOutage(lastSync, now, maxSyncAgeMinutes()),
    quality: result.quality,
    p50Mwh: result.p50Mwh,
    p90Mwh: result.p90Mwh,
    grossAepMwh: result.grossAepMwh,
    netAepMwh: result.netAepMwh,
    uncertainty: site.uncertainty,
    coverage: {
      ratio: result.coverageRatio,
      validHours: result.validHours,
      rejectedHours: result.rejectedHours,
      missingHours: result.missingHours,
      windowStart: result.windowStart,
      windowEnd: result.windowEnd,
    },
    turbineVersion: turbine.version,
    siteVersion: site.version,
    derivation: deriveYield({
      meanWindSpeedMs: result.meanWindSpeedMs,
      measurementHeightM: result.measurementHeightM,
      hubHeightM: turbine.hubHeightM,
      shearExponent: site.shearExponent,
      hubHeightFactor: result.hubHeightFactor,
      grossAepMwh: result.grossAepMwh,
      losses: {
        availability: site.lossAvailability,
        electrical: site.lossElectrical,
        wake: site.lossWake,
      },
      uncertainty: site.uncertainty,
      ratedPowerKw: turbine.ratedPowerKw,
    }),
    months: result.months?.map((m) => ({ ...m, month: new Date(m.month) })) ?? null,
    // Stored JSON: a reason added later is missing in older rows and counts as 0.
    rejections: result.rejections
      ? (Object.fromEntries(
          REJECTION_REASONS.map((r) => [r, result.rejections?.[r] ?? 0]),
        ) as Record<RejectionReason, number>)
      : null,
    history,
    runs:
      runs?.map((r) => ({
        id: r.id,
        job: r.job,
        status: runDisplayStatus(r, now, maxSyncAgeMinutes()),
        startedAt: r.startedAt,
        itemsProcessed: r.itemsProcessed,
        corrections: r.corrections,
      })) ?? null,
    statusPageUrl: STATUS_PAGE_URL,
  };
}
