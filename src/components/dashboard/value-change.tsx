"use client";
import { useState } from "react";
import { formatInt } from "@/lib/format";

/**
 * A short-lived chip with the difference when a headline value changes after a live refresh
 * ("▲ 27"). Nothing on first render: only a change the visitor witnessed is news.
 */
export function ValueChange({ value }: { value: number }) {
  const [previous, setPrevious] = useState(value);
  const [change, setChange] = useState<{ delta: number; key: number } | null>(null);

  // Adjusting state during render on a prop change, as React recommends over an effect.
  // Compared as shown (whole MWh): a change below rounding is no news and gets no "▲ 0".
  if (value !== previous) {
    setPrevious(value);
    const delta = Math.round(value) - Math.round(previous);
    if (delta !== 0) setChange({ delta, key: (change?.key ?? 0) + 1 });
  }
  if (!change) return null;

  const up = change.delta > 0;
  return (
    <span
      key={change.key}
      onAnimationEnd={() => setChange(null)}
      className={
        "animate-delta-chip rounded-full px-1.5 py-px font-medium tabular-nums motion-reduce:animate-delta-chip-fade " +
        (up
          ? "bg-success-on-navy/15 text-success-on-navy"
          : "bg-warning-on-navy/20 text-warning-on-navy")
      }
    >
      <span aria-hidden>{up ? "▲" : "▼"}</span>
      <span className="sr-only">{up ? "gestiegen um" : "gesunken um"}</span>{" "}
      {formatInt(Math.abs(change.delta))}
    </span>
  );
}
