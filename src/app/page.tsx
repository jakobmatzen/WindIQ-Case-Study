import { Suspense } from "react";
import { getDataCoverage } from "@/server/coverage";

// Interim page until the dashboard: shows that live readings arrive and how complete they are.

const percent = new Intl.NumberFormat("de-DE", {
  style: "percent",
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});
const count = new Intl.NumberFormat("de-DE");
const dateTime = new Intl.DateTimeFormat("de-DE", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Europe/Berlin",
});

async function DataCoverage() {
  const coverage = await getDataCoverage();
  if (!coverage) return <p className="text-muted-foreground">Noch keine Messwerte importiert.</p>;

  return (
    <section className="flex flex-col gap-2">
      <p className="text-sm text-muted-foreground">{coverage.mastName}</p>
      <h2 className="text-lg font-medium">Datenabdeckung der letzten 12 Monate</h2>
      <p className="text-4xl font-semibold tabular-nums">{percent.format(coverage.ratio)}</p>
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm text-muted-foreground">
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
      </dl>
    </section>
  );
}

export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-8 px-4 py-16">
      <h1 className="text-2xl font-semibold tracking-tight">WindIQ Ertragsrechnung</h1>
      <Suspense fallback={<p className="text-muted-foreground">Lade Datenabdeckung …</p>}>
        <DataCoverage />
      </Suspense>
    </main>
  );
}
