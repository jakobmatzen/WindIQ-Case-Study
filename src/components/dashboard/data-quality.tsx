import { MAX_PLAUSIBLE_WIND_SPEED_MS } from "@/core/measurement";
import { REJECTION_REASONS, type RejectionReason } from "@/core/yield";
import { formatInt } from "@/lib/format";
import { Card } from "./label";

const REASON: Record<RejectionReason, { label: string; note: string }> = {
  missing: { label: "Leer", note: "Datensatz ohne Wert (null)" },
  sentinel: { label: "Fehlerwert −999", note: "Fehlercode des Messmasts" },
  out_of_range: {
    label: "Unplausibel",
    note: `unter 0 oder über ${formatInt(MAX_PLAUSIBLE_WIND_SPEED_MS)} m/s`,
  },
  unparseable: { label: "Nicht lesbar", note: "Text, der keine Zahl ist" },
  unknown_unit: { label: "Unbekannte Einheit", note: "weder m/s noch km/h" },
};

export type DataQualityProps = {
  rejections: Record<RejectionReason, number> | null;
  missingHours: number;
};

/** Hours of the window that did not count, by reason: rejected readings and hours without a record. */
export function DataQuality({ rejections, missingHours }: DataQualityProps) {
  const rows = [
    ...(rejections
      ? REJECTION_REASONS.map((k) => ({ key: k, ...REASON[k], count: rejections[k] }))
      : []),
    {
      key: "no_record",
      label: "Fehlende Stunden",
      note: "kein Datensatz geliefert",
      count: missingHours,
    },
  ];
  const max = Math.max(1, ...rows.map((r) => r.count));
  return (
    <Card className="p-4 sm:p-6" aria-labelledby="quality-title">
      <h2 id="quality-title" className="font-heading text-lg font-semibold">
        Datenqualität
      </h2>
      <p className="mb-4 text-sm text-muted-foreground">
        Nicht verwendete Stunden der letzten 12 Monate nach Grund.
      </p>
      <ul className="flex flex-col gap-3">
        {rows.map((r) => (
          <li key={r.key} className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-1">
            <div>
              <p className="text-sm">{r.label}</p>
              <p className="text-xs text-muted-foreground">{r.note}</p>
            </div>
            <p className="text-right font-mono text-sm tabular-nums">{formatInt(r.count)}</p>
            <div className="col-span-2 h-1.5 rounded-full bg-muted" aria-hidden>
              <div
                className="h-full rounded-full bg-chart-5"
                style={{ width: `${(r.count / max) * 100}%` }}
              />
            </div>
          </li>
        ))}
      </ul>
      {!rejections && (
        <p className="mt-4 text-xs text-muted-foreground">
          Ablehnungsgründe erscheinen mit dem nächsten berechneten Ergebnis.
        </p>
      )}
    </Card>
  );
}
