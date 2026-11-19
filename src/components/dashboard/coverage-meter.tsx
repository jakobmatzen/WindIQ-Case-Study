import { COVERAGE_THRESHOLDS, type YieldQuality } from "@/core/yield";
import { formatPercent } from "@/lib/format";

export const QUALITY_LABEL: Record<YieldQuality, string> = {
  ok: "ausreichend",
  uncertain: "unsicher",
  not_meaningful: "nicht aussagekräftig",
};

/**
 * Fill for a coverage bar, shared by this meter and the monthly strip so a status has one bar color
 * everywhere. Status text on the rail uses the lighter -on-navy tokens instead, since text needs
 * more contrast than a bar that always has its value spelled out next to it.
 */
export const QUALITY_FILL: Record<YieldQuality, string> = {
  ok: "bg-success",
  uncertain: "bg-warning",
  not_meaningful: "bg-destructive",
};

const THRESHOLDS = [COVERAGE_THRESHOLDS.meaningful, COVERAGE_THRESHOLDS.ok];

/**
 * Share of valid hours as a bar on the navy rail, with the two warning thresholds marked,
 * so the level reads at a glance. The level is also spelled out next to it (never color alone).
 */
export function CoverageMeter({ ratio, quality }: { ratio: number; quality: YieldQuality }) {
  return (
    <div>
      <div className="relative">
        <div className="h-2 overflow-hidden rounded-full bg-white/15">
          <div
            className={"h-full rounded-full " + QUALITY_FILL[quality]}
            style={{ width: `${Math.min(1, Math.max(0, ratio)) * 100}%` }}
          />
        </div>
        {THRESHOLDS.map((t) => (
          <div
            key={t}
            className="absolute -top-[3px] h-3.5 w-px bg-white/70"
            style={{ left: `${t * 100}%` }}
            aria-hidden
          />
        ))}
      </div>
      <div className="relative mt-1.5 h-4 text-[11px] text-white/70" aria-hidden>
        {THRESHOLDS.map((t) => (
          <span
            key={t}
            className="absolute -translate-x-1/2 whitespace-nowrap"
            style={{ left: `${t * 100}%` }}
          >
            {formatPercent(t, 0)}
          </span>
        ))}
      </div>
    </div>
  );
}
