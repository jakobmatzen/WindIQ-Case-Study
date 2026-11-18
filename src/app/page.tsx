import { Suspense } from "react";
import { COVERAGE_THRESHOLDS, type YieldQuality } from "@/core/yield";
import { getSourceOutage } from "@/server/health";
import { getLatestYield } from "@/server/yield";

// Interim page until the dashboard (JAK-15): the latest yield result, without design.

const percent = new Intl.NumberFormat("de-DE", {
  style: "percent",
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});
const count = new Intl.NumberFormat("de-DE");
const mwh = new Intl.NumberFormat("de-DE", { maximumFractionDigits: 0 });
const dateTime = new Intl.DateTimeFormat("de-DE", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Europe/Berlin",
});

const wholePercent = new Intl.NumberFormat("de-DE", { style: "percent" });

const QUALITY_WARNING: Record<YieldQuality, string | null> = {
  ok: null,
  uncertain: `Unsicher: weniger als ${wholePercent.format(COVERAGE_THRESHOLDS.ok)} der Stunden haben einen gültigen Messwert.`,
  not_meaningful: `Nicht aussagekräftig: weniger als ${wholePercent.format(COVERAGE_THRESHOLDS.meaningful)} der Stunden haben einen gültigen Messwert.`,
};

async function LatestYield() {
  const result = await getLatestYield();
  if (!result) return <p className="text-muted-foreground">Noch kein Ergebnis berechnet.</p>;
  const warning = QUALITY_WARNING[result.quality];
  const { coverage } = result;

  return (
    <section className="flex flex-col gap-6">
      <p className="text-sm text-muted-foreground">{result.mastName}</p>

      <dl className="grid grid-cols-2 gap-4">
        <div>
          <dt className="text-sm text-muted-foreground">P50</dt>
          <dd className="text-4xl font-semibold tabular-nums">{mwh.format(result.p50Mwh)} MWh/a</dd>
        </div>
        <div>
          <dt className="text-sm text-muted-foreground">P90</dt>
          <dd className="text-4xl font-semibold tabular-nums">{mwh.format(result.p90Mwh)} MWh/a</dd>
        </div>
      </dl>

      {warning && (
        <p role="alert" className="text-sm font-medium text-destructive">
          {warning}
        </p>
      )}

      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm text-muted-foreground">
        <dt>AEP brutto</dt>
        <dd className="tabular-nums">{mwh.format(result.grossAepMwh)} MWh/a</dd>
        <dt>AEP netto</dt>
        <dd className="tabular-nums">{mwh.format(result.netAepMwh)} MWh/a</dd>
        <dt>Datenabdeckung</dt>
        <dd className="tabular-nums">{percent.format(coverage.ratio)}</dd>
        <dt>Gültige Stunden</dt>
        <dd className="tabular-nums">{count.format(coverage.validHours)}</dd>
        <dt>Verworfene Stunden</dt>
        <dd className="tabular-nums">{count.format(coverage.rejectedHours)}</dd>
        <dt>Fehlende Stunden</dt>
        <dd className="tabular-nums">{count.format(coverage.missingHours)}</dd>
        <dt>Zeitraum</dt>
        <dd>
          {dateTime.format(coverage.windowStart)} – {dateTime.format(coverage.windowEnd)}
        </dd>
        <dt>Anlage / Standort</dt>
        <dd>
          Version {result.turbineVersion} / Version {result.siteVersion}
        </dd>
        <dt>Berechnet</dt>
        <dd>{dateTime.format(result.calculatedAt)}</dd>
      </dl>
    </section>
  );
}

/** Shown while the worker cannot reach the data source; the last result stays visible below. */
async function OutageBanner() {
  const outage = await getSourceOutage();
  if (!outage) return null;
  return (
    <p
      role="alert"
      className="rounded-md border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm font-medium text-destructive"
    >
      Datenquelle seit {outage.hours} h nicht erreichbar – angezeigt wird das zuletzt berechnete
      Ergebnis.
    </p>
  );
}

export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-8 px-4 py-16">
      <h1 className="text-2xl font-semibold tracking-tight">WindIQ Ertragsrechnung</h1>
      <Suspense>
        <OutageBanner />
      </Suspense>
      <Suspense fallback={<p className="text-muted-foreground">Lade Ergebnis …</p>}>
        <LatestYield />
      </Suspense>
    </main>
  );
}
