import { formatInt, formatPercent } from "@/lib/format";
import { Card, Label } from "./label";

export type KeyFiguresProps = {
  grossAepMwh: number;
  netAepMwh: number;
  fullLoadHours: number;
  capacityFactor: number;
};

/** The secondary figures next to P50/P90: gross and net AEP, full-load hours, capacity factor. */
export function KeyFigures(props: KeyFiguresProps) {
  const figures = [
    { label: "AEP brutto", value: formatInt(props.grossAepMwh), unit: "MWh/a" },
    { label: "AEP netto", value: formatInt(props.netAepMwh), unit: "MWh/a" },
    { label: "Volllaststunden", value: formatInt(props.fullLoadHours), unit: "h/a" },
    { label: "Kapazitätsfaktor", value: formatPercent(props.capacityFactor) },
  ];
  return (
    <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {figures.map((f) => (
        <Card key={f.label} className="p-4">
          <dt>
            <Label>{f.label}</Label>
          </dt>
          <dd className="mt-1 font-heading text-xl font-semibold tabular-nums sm:text-2xl">
            {f.value}
            {f.unit && (
              <span className="ml-1 text-xs font-medium text-muted-foreground">{f.unit}</span>
            )}
          </dd>
        </Card>
      ))}
    </dl>
  );
}
