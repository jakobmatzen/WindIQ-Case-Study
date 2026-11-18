import { ArrowUpRight } from "lucide-react";
import { formatDayTime, formatInt } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Card, Label } from "./label";

export type SyncRunRow = {
  id: number;
  job: "measurements" | "yield";
  status: "running" | "success" | "error" | "aborted";
  startedAt: Date;
  itemsProcessed: number;
  corrections: number;
};

const JOB = { measurements: "Messwerte", yield: "Ertrag" };
const STATUS = { success: "OK", error: "Fehler", running: "läuft", aborted: "abgebrochen" };

/** The latest worker runs and the link to the external status page. */
export function SyncRuns({
  runs,
  statusPageUrl,
}: {
  runs: SyncRunRow[] | null;
  statusPageUrl: string;
}) {
  return (
    <Card className="p-4 sm:p-6" aria-labelledby="runs-title">
      <div className="mb-4 flex items-baseline justify-between gap-3">
        <h2 id="runs-title" className="font-heading text-lg font-semibold">
          Betrieb
        </h2>
        <a
          href={statusPageUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-0.5 text-sm font-medium text-primary underline-offset-4 hover:underline"
        >
          Statusseite
          <ArrowUpRight className="size-4" strokeWidth={1.75} aria-hidden />
          <span className="sr-only">(öffnet in neuem Tab)</span>
        </a>
      </div>
      {runs === null ? (
        <p className="text-sm text-muted-foreground">Läufe gerade nicht verfügbar.</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left">
              <th className="pb-2 font-normal">
                <Label>Zeit</Label>
              </th>
              <th className="pb-2 font-normal">
                <Label>Job</Label>
              </th>
              <th className="pb-2 font-normal">
                <Label>Status</Label>
              </th>
              <th className="pb-2 text-right font-normal">
                <Label>Werte</Label>
              </th>
              <th className="pb-2 text-right font-normal">
                <Label>
                  <abbr title="Korrekturen" className="no-underline">
                    Korr.
                  </abbr>
                </Label>
              </th>
            </tr>
          </thead>
          <tbody>
            {runs.map((r) => (
              <tr key={r.id} className="border-t border-border">
                <td className="py-1.5 font-mono text-xs tabular-nums">
                  {formatDayTime(r.startedAt)}
                </td>
                <td className="py-1.5">{JOB[r.job]}</td>
                <td
                  className={cn(
                    "py-1.5",
                    (r.status === "error" || r.status === "aborted") && "text-destructive",
                  )}
                >
                  {STATUS[r.status]}
                </td>
                <td className="py-1.5 text-right font-mono tabular-nums">
                  {formatInt(r.itemsProcessed)}
                </td>
                <td className="py-1.5 text-right font-mono tabular-nums">
                  {formatInt(r.corrections)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Card>
  );
}
