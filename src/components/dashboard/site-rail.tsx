import { COVERAGE_THRESHOLDS, type YieldQuality } from "@/core/yield";
import { formatDateTime, formatInt, formatPercent } from "@/lib/format";
import { CoverageMeter, QUALITY_LABEL } from "./coverage-meter";
import { Label } from "./label";
import { LiveStatus } from "./live-status";
import { ValueChange } from "./value-change";

export type SiteRailProps = {
  siteName: string;
  mastName: string;
  appVersion: string;
  dataAsOf: Date;
  stale: boolean;
  /** Version of the data shown, for the live refresh. */
  dataVersion: string | null;
  p90Mwh: number;
  p50Mwh: number;
  quality: YieldQuality;
  coverage: { ratio: number; validHours: number; rejectedHours: number; missingHours: number };
};

const QUALITY_WARNING: Record<YieldQuality, string | null> = {
  ok: null,
  uncertain: `Unsicher: weniger als ${formatPercent(COVERAGE_THRESHOLDS.ok, 0)} der Stunden haben einen gültigen Messwert.`,
  not_meaningful: `Nicht aussagekräftig: weniger als ${formatPercent(COVERAGE_THRESHOLDS.meaningful, 0)} der Stunden haben einen gültigen Messwert.`,
};

/**
 * The navy rail: where and how current, then the two numbers most people come for
 * (P90 for the bank, P50 for project developers) and how far they can be trusted.
 * A top band on the phone, a sticky sidebar from `lg` on.
 */
export function SiteRail(props: SiteRailProps) {
  const warning = QUALITY_WARNING[props.quality];
  return (
    <aside className="flex flex-col gap-6 bg-navy px-4 py-6 text-white sm:px-6 lg:sticky lg:top-0 lg:h-dvh lg:w-[22rem] lg:shrink-0 lg:overflow-y-auto lg:py-8">
      <header>
        <Label className="text-white/75">{props.mastName}</Label>
        <h1 className="mt-1 font-heading text-2xl font-semibold tracking-tight text-balance">
          {props.siteName}
        </h1>
        {/* Separate lines: the pill's width changes with its ticking time, and a shared
            wrapping row would make "Datenstand" jump. */}
        <div className="mt-3 flex flex-col items-start gap-2 text-xs text-white/75">
          <LiveStatus stale={props.stale} dataVersion={props.dataVersion} />
          <span>Datenstand {formatDateTime(props.dataAsOf)}</span>
        </div>
      </header>

      <dl className="grid grid-cols-2 gap-4 lg:grid-cols-1 lg:gap-6">
        <Headline label="P90 · Bank" labelClass="text-cta" value={props.p90Mwh} />
        <Headline label="P50 · Projektierende" labelClass="text-white/75" value={props.p50Mwh} />
      </dl>

      <div>
        <div className="mb-2 flex items-baseline justify-between gap-3">
          <Label className="text-white/75">Datenabdeckung</Label>
          <span className="text-sm tabular-nums">
            {formatPercent(props.coverage.ratio)} · {QUALITY_LABEL[props.quality]}
          </span>
        </div>
        <CoverageMeter ratio={props.coverage.ratio} quality={props.quality} />
        <p className="text-xs text-white/75 tabular-nums">
          {formatInt(props.coverage.validHours)} gültig · {formatInt(props.coverage.rejectedHours)}{" "}
          verworfen · {formatInt(props.coverage.missingHours)} fehlend
        </p>
        {warning && (
          <p
            role="alert"
            className={
              "mt-3 text-sm font-medium " +
              (props.quality === "uncertain" ? "text-warning-on-navy" : "text-danger-on-navy")
            }
          >
            {warning}
          </p>
        )}
      </div>

      <p className="font-mono text-xs text-white/50 lg:mt-auto">{props.appVersion}</p>
    </aside>
  );
}

function Headline({
  label,
  labelClass,
  value,
}: {
  label: string;
  labelClass: string;
  value: number;
}) {
  return (
    <div>
      <dt>
        <Label className={labelClass}>{label}</Label>
      </dt>
      <dd>
        <span className="block font-heading text-3xl font-semibold tabular-nums lg:text-5xl">
          {formatInt(value)}
        </span>
        <span className="flex items-center gap-2 text-xs text-white/70">
          MWh/a
          <ValueChange value={value} />
        </span>
      </dd>
    </div>
  );
}
