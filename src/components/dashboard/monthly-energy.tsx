import { isPartialMonth, qualityOf, type MonthYield } from "@/core/yield";
import {
  formatInt,
  formatMonth,
  formatMonthLetter,
  formatMonthLong,
  formatPercent,
} from "@/lib/format";
import { cn } from "@/lib/utils";
import { ChartTip } from "./chart-tip";
import { QUALITY_FILL } from "./coverage-meter";
import { Card } from "./label";

const coverageOf = (m: MonthYield) => (m.hours === 0 ? 0 : m.validHours / m.hours);

/** Same thresholds and colors as the yield quality, so a month reads like the whole year would. */
const coverageColor = (ratio: number) => QUALITY_FILL[qualityOf(ratio)];

/**
 * Gross energy per calendar month, each scaled up to its hours in the window, so the bars add up
 * to gross AEP. The coverage of each month sits right below its bar, so a gap is visible where it is.
 */
export function MonthlyEnergy({ months }: { months: MonthYield[] | null }) {
  return (
    <Card className="p-4 sm:p-6" aria-labelledby="months-title">
      <h2 id="months-title" className="font-heading text-lg font-semibold">
        Energie je Monat
      </h2>
      <p className="mb-4 text-sm text-muted-foreground">
        Brutto, jeder Monat auf volle Stunden hochgerechnet. Summe = AEP brutto.
      </p>
      {months ? (
        <Bars months={months} />
      ) : (
        <p className="text-sm text-muted-foreground">
          Erscheint mit dem nächsten berechneten Ergebnis.
        </p>
      )}
    </Card>
  );
}

function Bars({ months }: { months: MonthYield[] }) {
  const max = Math.max(1, ...months.map((m) => m.energyMwh ?? 0));
  return (
    <>
      <ol
        className="grid gap-0.5 sm:gap-1.5"
        style={{ gridTemplateColumns: `repeat(${months.length}, minmax(0, 1fr))` }}
      >
        {months.map((m) => {
          const partial = isPartialMonth(m);
          const coverage = coverageOf(m);
          return (
            <li key={m.month.toISOString()}>
              <ChartTip
                label={`${formatMonthLong(m.month)}: ${m.energyMwh === null ? "keine gültigen Werte" : `${formatInt(m.energyMwh)} MWh`}, Abdeckung ${formatPercent(coverage)}`}
                className="flex w-full flex-col"
                content={<MonthTip month={m} partial={partial} coverage={coverage} />}
              >
                <span className="flex h-40 flex-col justify-end">
                  <span
                    className={cn(
                      "rounded-t transition-opacity duration-150 group-hover:opacity-80 group-data-popup-open:opacity-80",
                      partial ? "bg-primary/40" : "bg-primary",
                    )}
                    style={{ height: `${((m.energyMwh ?? 0) / max) * 100}%` }}
                  />
                </span>
                <span className="pt-1 text-center text-[11px] text-muted-foreground">
                  <span className="sm:hidden">{formatMonthLetter(m.month)}</span>
                  <span className="hidden sm:inline">{formatMonth(m.month)}</span>
                </span>
                <span className={cn("mt-2 h-2 w-full rounded-sm", coverageColor(coverage))} />
                <span className="mt-1 hidden text-center font-mono text-[10px] text-muted-foreground tabular-nums sm:block">
                  {Math.floor(coverage * 100)} %
                </span>
              </ChartTip>
            </li>
          );
        })}
      </ol>
      <p className="mt-3 text-xs text-muted-foreground">
        Untere Leiste: Datenabdeckung je Monat. Helle Balken: Monat nur teilweise im Zeitraum.
      </p>
    </>
  );
}

function MonthTip({
  month: m,
  partial,
  coverage,
}: {
  month: MonthYield;
  partial: boolean;
  coverage: number;
}) {
  return (
    <div className="flex min-w-40 flex-col gap-1">
      <p className="font-medium">
        {formatMonthLong(m.month)}
        {partial && <span className="font-normal text-white/70"> · teilweise</span>}
      </p>
      <p className="flex justify-between gap-4">
        <span>Energie brutto</span>
        <span className="font-mono tabular-nums">
          {m.energyMwh === null ? "–" : `${formatInt(m.energyMwh)} MWh`}
        </span>
      </p>
      <p className="flex justify-between gap-4">
        <span className="flex items-center gap-1.5">
          <span className={cn("size-2 rounded-sm", coverageColor(coverage))} />
          Abdeckung
        </span>
        <span className="font-mono tabular-nums">{formatPercent(coverage)}</span>
      </p>
      <p className="text-white/70">
        {formatInt(m.validHours)} von {formatInt(m.hours)} h gültig
      </p>
    </div>
  );
}
