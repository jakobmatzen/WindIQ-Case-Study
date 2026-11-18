import type { LossKey, YieldDerivation } from "@/core/derivation";
import { formatInt, formatPercent } from "@/lib/format";
import { Card } from "./label";

export type LossWaterfallProps = {
  grossAepMwh: number;
  derivation: YieldDerivation;
  uncertainty: number;
  turbineVersion: number;
  siteVersion: number;
};

const LOSS_LABEL: Record<LossKey, string> = {
  availability: "Verfügbarkeit",
  electrical: "Elektrische Verluste",
  wake: "Abschattung",
};

type Row = {
  label: string;
  note: string;
  /** Bar from `from` to `to` MWh/a, scaled to gross AEP. */
  from: number;
  to: number;
  kind: "total" | "loss" | "result";
};

/**
 * Gross AEP, each loss on its own, net AEP (= P50), the uncertainty deduction and P90, as a
 * waterfall. Every bar has its number and source version next to it, so nothing is color only.
 */
export function LossWaterfall({ grossAepMwh, derivation: d, ...props }: LossWaterfallProps) {
  const rows: Row[] = [
    {
      label: "AEP brutto",
      note: `Kennlinie Anlage v${props.turbineVersion}, auf 8.760 h hochgerechnet`,
      from: 0,
      to: grossAepMwh,
      kind: "total",
    },
    ...d.losses.map((l) => ({
      label: LOSS_LABEL[l.key],
      note: `− ${formatPercent(l.share)} · Standort v${props.siteVersion}`,
      from: l.remainingMwh,
      to: l.remainingMwh + l.lossMwh,
      kind: "loss" as const,
    })),
    {
      label: "AEP netto = P50",
      note: "nach allen Verlusten",
      from: 0,
      to: d.netAepMwh,
      kind: "total",
    },
    {
      label: "Unsicherheit",
      note: `− 1,282 × ${formatPercent(props.uncertainty)} · Standort v${props.siteVersion}`,
      from: d.p90Mwh,
      to: d.netAepMwh,
      kind: "loss",
    },
    { label: "P90", note: "für die Bank", from: 0, to: d.p90Mwh, kind: "result" },
  ];
  const scale = (mwh: number) => (grossAepMwh > 0 ? (mwh / grossAepMwh) * 100 : 0);

  return (
    <Card className="p-4 sm:p-6" aria-labelledby="waterfall-title">
      <h2 id="waterfall-title" className="font-heading text-lg font-semibold">
        Von brutto zu P90
      </h2>
      <p className="mb-5 text-sm text-muted-foreground">
        Jeder Abzug einzeln, mit der verwendeten Version.
      </p>
      <ol className="flex flex-col gap-4">
        {rows.map((row) => (
          <li
            key={row.label}
            className="grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-1.5 sm:grid-cols-[13rem_1fr_6.5rem]"
          >
            <div className="min-w-0">
              <p className={"text-sm " + (row.kind === "loss" ? "" : "font-semibold")}>
                {row.label}
              </p>
              <p className="text-xs text-muted-foreground">{row.note}</p>
            </div>
            <p className="text-right font-mono text-sm tabular-nums sm:order-last">
              {row.kind === "loss" ? "− " : ""}
              {formatInt(row.to - row.from)}
              <span className="ml-1 text-xs text-muted-foreground sm:hidden">MWh/a</span>
            </p>
            <div className="relative col-span-2 h-5 rounded bg-muted/70 sm:col-span-1" aria-hidden>
              <div
                className={
                  "absolute inset-y-0 rounded " +
                  (row.kind === "loss"
                    ? "bg-destructive/25"
                    : row.kind === "result"
                      ? "bg-cta"
                      : "bg-primary")
                }
                style={{ left: `${scale(row.from)}%`, width: `${scale(row.to - row.from)}%` }}
              />
            </div>
          </li>
        ))}
      </ol>
      <p className="mt-5 text-xs text-muted-foreground sm:text-right">Alle Werte in MWh/a</p>
    </Card>
  );
}
