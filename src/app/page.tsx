import { Suspense } from "react";
import { DataQuality } from "@/components/dashboard/data-quality";
import { KeyFigures } from "@/components/dashboard/key-figures";
import { LossWaterfall } from "@/components/dashboard/loss-waterfall";
import { MonthlyEnergy } from "@/components/dashboard/monthly-energy";
import { SiteRail } from "@/components/dashboard/site-rail";
import { SyncRuns } from "@/components/dashboard/sync-runs";
import { WindChain } from "@/components/dashboard/wind-chain";
import { YieldTrend } from "@/components/dashboard/yield-trend";
import { LiveRefresh } from "@/components/dashboard/live-status";
import { getDashboard } from "@/server/dashboard";
import { getDataVersion } from "@/server/live";

async function Dashboard() {
  const data = await getDashboard();
  if (!data) {
    // No result yet: keep polling, so the first one appears without a reload.
    const dataVersion = await getDataVersion().catch(() => null);
    return (
      <main className="flex flex-1 items-center justify-center px-4 py-16">
        <div className="max-w-sm text-center">
          <h1 className="font-heading text-2xl font-semibold">WindIQ Ertragsrechnung</h1>
          <p className="mt-2 text-muted-foreground">
            Noch kein Ergebnis berechnet. Sobald die ersten Messwerte abgerufen sind, erscheint hier
            der Jahresertrag.
          </p>
          <LiveRefresh dataVersion={dataVersion} />
        </div>
      </main>
    );
  }
  const { derivation: d } = data;

  return (
    <div className="flex flex-1 flex-col lg:flex-row">
      <SiteRail
        siteName={data.siteName}
        mastName={data.mastName}
        appVersion={data.appVersion}
        dataAsOf={data.dataAsOf}
        stale={data.outage !== null}
        dataVersion={data.dataVersion}
        p90Mwh={data.p90Mwh}
        p50Mwh={data.p50Mwh}
        quality={data.quality}
        coverage={data.coverage}
      />
      <main className="flex min-w-0 flex-1 flex-col gap-6 px-4 py-6 sm:px-6 lg:px-10 lg:py-8">
        {data.outage && (
          <p
            role="alert"
            className="rounded-lg bg-warning/15 px-4 py-3 text-sm font-medium text-warning-text ring-1 ring-warning/40"
          >
            Datenquelle seit {data.outage.duration} nicht erreichbar – angezeigt wird das zuletzt
            berechnete Ergebnis.
          </p>
        )}
        <KeyFigures
          grossAepMwh={data.grossAepMwh}
          netAepMwh={data.netAepMwh}
          fullLoadHours={d.fullLoadHours}
          capacityFactor={d.capacityFactor}
        />
        <WindChain
          wind={d.wind}
          validHours={data.coverage.validHours}
          windowStart={data.coverage.windowStart}
          windowEnd={data.coverage.windowEnd}
          turbineVersion={data.turbineVersion}
          siteVersion={data.siteVersion}
        />
        <LossWaterfall
          grossAepMwh={data.grossAepMwh}
          derivation={d}
          uncertainty={data.uncertainty}
          calculatedAt={data.calculatedAt}
          turbineVersion={data.turbineVersion}
          siteVersion={data.siteVersion}
        />
        <YieldTrend history={data.history} />
        <MonthlyEnergy months={data.months} />
        <div className="grid gap-6 xl:grid-cols-2">
          <DataQuality rejections={data.rejections} missingHours={data.coverage.missingHours} />
          <SyncRuns runs={data.runs} statusPageUrl={data.statusPageUrl} />
        </div>
      </main>
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="flex flex-1 flex-col lg:flex-row" aria-busy="true">
      <div className="h-72 bg-navy lg:h-dvh lg:w-[22rem]" />
      <div className="flex flex-1 flex-col gap-6 px-4 py-6 sm:px-6 lg:px-10 lg:py-8">
        <p className="text-sm text-muted-foreground">Lade Ergebnis …</p>
      </div>
    </div>
  );
}

export default function Home() {
  return (
    <Suspense fallback={<DashboardSkeleton />}>
      <Dashboard />
    </Suspense>
  );
}
