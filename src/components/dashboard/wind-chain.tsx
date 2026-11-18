import type { WindStep } from "@/core/derivation";
import { formatDate, formatDecimal, formatInt } from "@/lib/format";
import { Card } from "./label";

export type WindChainProps = {
  wind: WindStep;
  validHours: number;
  windowStart: Date;
  windowEnd: Date;
  turbineVersion: number;
  siteVersion: number;
};

/** Mean wind at the mast, times the height factor, gives the mean wind at the hub. */
export function WindChain({ wind, ...props }: WindChainProps) {
  const speed = (ms: number | null) => (ms === null ? "–" : `${formatDecimal(ms, 2)} m/s`);
  return (
    <Card className="p-4 sm:p-6" aria-labelledby="wind-chain-title">
      <h2 id="wind-chain-title" className="font-heading text-lg font-semibold">
        Vom Mast zur Nabe
      </h2>
      <p className="mb-4 text-sm text-muted-foreground">
        Mittlerer Wind über {formatInt(props.validHours)} gültige Stunden,{" "}
        {formatDate(props.windowStart)} – {formatDate(props.windowEnd)}
      </p>
      <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-center">
        <Box label={`Mast · ${formatInt(wind.measurementHeightM)} m`} value={speed(wind.mastMs)} />
        <div className="px-2 py-1 text-center font-mono text-sm tabular-nums">
          × {formatDecimal(wind.factor, 3)}
          <span className="block text-[11px] text-muted-foreground">
            ({formatInt(wind.hubHeightM)} / {formatInt(wind.measurementHeightM)}) ^{" "}
            {formatDecimal(wind.shearExponent, 2)}
          </span>
        </div>
        <Box label={`Nabe · ${formatInt(wind.hubHeightM)} m`} value={speed(wind.hubMs)} strong />
      </div>
      <p className="mt-3 text-xs text-muted-foreground">
        α aus Standort v{props.siteVersion}, Nabenhöhe aus Anlage v{props.turbineVersion}
        {wind.mastMs === null && " · mittlerer Wind wird ab der nächsten Berechnung gespeichert"}
      </p>
    </Card>
  );
}

function Box({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <div
      className={
        "flex-1 rounded-lg px-4 py-3 ring-1 " +
        (strong ? "bg-primary/10 ring-primary/30" : "bg-muted/60 ring-border")
      }
    >
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="font-heading text-2xl font-semibold tabular-nums">{value}</p>
    </div>
  );
}
