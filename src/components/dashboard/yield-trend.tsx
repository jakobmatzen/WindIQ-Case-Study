import { formatDayTime, formatInt } from "@/lib/format";
import { ChartTip } from "./chart-tip";
import { Card } from "./label";

export type YieldTrendPoint = {
  id: number;
  calculatedAt: Date;
  windowEnd: Date;
  p50Mwh: number;
  p90Mwh: number;
  turbineVersion: number;
  siteVersion: number;
};

const SERIES = [
  { key: "p50Mwh", label: "P50", stroke: "var(--primary)", dot: "bg-primary" },
  { key: "p90Mwh", label: "P90", stroke: "var(--chart-3)", dot: "bg-chart-3" },
] as const;

/**
 * P50 and P90 of every stored result over time, as steps: a value holds until the next result.
 * Each result owns the slice of the chart nearest to it, so hovering or tapping anywhere shows
 * the closest result, even when the points sit close together.
 */
export function YieldTrend({ history }: { history: YieldTrendPoint[] }) {
  return (
    <Card className="p-4 sm:p-6" aria-labelledby="trend-title">
      <h2 id="trend-title" className="font-heading text-lg font-semibold">
        Verlauf P50 und P90
      </h2>
      <p className="mb-4 text-sm text-muted-foreground">
        Ein Punkt je neu berechnetem Ergebnis ({formatInt(history.length)} bisher).
      </p>
      {history.length === 0 ? (
        <p className="text-sm text-muted-foreground">Verlauf gerade nicht verfügbar.</p>
      ) : (
        <Chart history={history} />
      )}
    </Card>
  );
}

function Chart({ history }: { history: YieldTrendPoint[] }) {
  const values = history.flatMap((h) => [h.p50Mwh, h.p90Mwh]);
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const pad = (hi - lo) * 0.08 || hi * 0.01 || 1;
  const min = lo - pad;
  const max = hi + pad;
  const t0 = history[0]!.calculatedAt.getTime();
  const span = history.at(-1)!.calculatedAt.getTime() - t0;
  // A single result sits on the right edge, where the newest result always is.
  const xs = history.map((h) =>
    span === 0 ? 100 : ((h.calculatedAt.getTime() - t0) / span) * 100,
  );
  const y = (v: number) => ((max - v) / (max - min)) * 100;
  const path = (key: (typeof SERIES)[number]["key"]) =>
    history
      .map((h, i) => (i === 0 ? `M ${xs[i]} ${y(h[key])}` : `H ${xs[i]} V ${y(h[key])}`))
      .join(" ") + " H 100";
  const first = history[0]!;
  const last = history.at(-1)!;

  return (
    <div className="grid grid-cols-[3.25rem_1fr_4.75rem] gap-x-2">
      <p className="sr-only">
        {history.length === 1
          ? `Ergebnis vom ${formatDayTime(last.calculatedAt)}: P50 ${formatInt(last.p50Mwh)}, P90 ${formatInt(last.p90Mwh)} MWh/a.`
          : `Vom ${formatDayTime(first.calculatedAt)} bis ${formatDayTime(last.calculatedAt)}: P50 von ${formatInt(first.p50Mwh)} auf ${formatInt(last.p50Mwh)}, P90 von ${formatInt(first.p90Mwh)} auf ${formatInt(last.p90Mwh)} MWh/a, zwischen ${formatInt(lo)} und ${formatInt(hi)}.`}
      </p>
      <div className="flex flex-col justify-between py-0.5 text-right font-mono text-[11px] text-muted-foreground tabular-nums">
        <span>{formatInt(max)}</span>
        <span>{formatInt(min)}</span>
      </div>
      {/* Points: pointer and touch only; screen readers and keyboards get the summary below. */}
      <div className="relative h-44 border-b border-l border-border" aria-hidden>
        <svg
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          className="absolute inset-0 size-full overflow-visible"
          aria-hidden
        >
          {SERIES.map((s) => (
            <path
              key={s.key}
              d={path(s.key)}
              fill="none"
              stroke={s.stroke}
              strokeWidth={2}
              vectorEffect="non-scaling-stroke"
            />
          ))}
        </svg>
        {history.map((h, i) => {
          const left = i === 0 ? 0 : (xs[i - 1]! + xs[i]!) / 2;
          const right = i === history.length - 1 ? 100 : (xs[i]! + xs[i + 1]!) / 2;
          const width = Math.max(right - left, 0.0001);
          const dotLeft = `${((xs[i]! - left) / width) * 100}%`;
          return (
            <ChartTip
              key={h.id}
              label={`Ergebnis vom ${formatDayTime(h.calculatedAt)}: P50 ${formatInt(h.p50Mwh)}, P90 ${formatInt(h.p90Mwh)} MWh/a`}
              className="absolute inset-y-0"
              focusable={false}
              style={{ left: `${left}%`, width: `${width}%` }}
              content={<PointTip point={h} />}
            >
              <span
                className="absolute inset-y-0 w-px bg-foreground/15 opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-data-popup-open:opacity-100"
                style={{ left: dotLeft }}
              />
              {SERIES.map((s) => (
                <span
                  key={s.key}
                  className={
                    "absolute size-2.5 -translate-1/2 rounded-full ring-2 ring-card transition-[scale] duration-150 ease-out motion-safe:group-hover:scale-150 motion-safe:group-data-popup-open:scale-150 " +
                    s.dot
                  }
                  style={{ left: dotLeft, top: `${y(h[s.key])}%` }}
                />
              ))}
            </ChartTip>
          );
        })}
      </div>
      <div className="relative text-xs">
        {SERIES.map((s) => (
          <span
            key={s.key}
            className="absolute -translate-y-1/2 font-medium whitespace-nowrap"
            style={{ top: `${y(last[s.key])}%` }}
          >
            {s.label} <span className="font-mono tabular-nums">{formatInt(last[s.key])}</span>
          </span>
        ))}
      </div>
      <span />
      <div className="mt-1 flex justify-between gap-2 font-mono text-[10px] text-muted-foreground tabular-nums sm:text-[11px]">
        <span>{axisTime(first.calculatedAt)}</span>
        {history.length > 1 && <span className="text-right">{axisTime(last.calculatedAt)}</span>}
      </div>
    </div>
  );
}

/** 18.11. 21:09: short enough that both ends fit next to each other on the phone. */
const axisTime = (date: Date) => formatDayTime(date).replace(",", "");

function PointTip({ point }: { point: YieldTrendPoint }) {
  return (
    <div className="flex min-w-36 flex-col gap-1">
      <p className="font-medium">{formatDayTime(point.calculatedAt)}</p>
      {SERIES.map((s) => (
        <p key={s.key} className="flex items-center gap-2">
          <span className={"size-2 rounded-full " + s.dot} />
          <span className="flex-1">{s.label}</span>
          <span className="font-mono tabular-nums">{formatInt(point[s.key])} MWh/a</span>
        </p>
      ))}
      <p className="text-white/70">
        Daten bis {formatDayTime(point.windowEnd)} · Anlage v{point.turbineVersion} · Standort v
        {point.siteVersion}
      </p>
    </div>
  );
}
