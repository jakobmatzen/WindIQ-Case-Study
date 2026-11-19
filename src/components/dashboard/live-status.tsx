"use client";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { formatAgo } from "@/lib/format";

/** How often the page asks whether the worker stored something new. Data arrives hourly. */
const CHECK_EVERY_MS = 30_000;
const CHECK_TIMEOUT_MS = 10_000;

/**
 * The status pill in the rail, and what keeps the page live: it polls `/api/version` and
 * re-renders the page on the server (`router.refresh()`) only when the data version changed,
 * so the page updates without a reload and keeps its scroll position. A failed check changes
 * nothing: the page keeps showing what it has, and "vor …" keeps counting from the last success.
 */
export function LiveStatus({ stale, dataVersion }: { stale: boolean; dataVersion: string | null }) {
  const router = useRouter();
  const known = useRef(dataVersion);
  const [checkedAt, setCheckedAt] = useState(() => Date.now());
  const [now, setNow] = useState(checkedAt);

  // A refresh brings a new prop: the page now shows that version.
  useEffect(() => {
    known.current = dataVersion;
  }, [dataVersion]);

  useEffect(() => {
    let inFlight = false;
    const check = async () => {
      if (inFlight || document.visibilityState !== "visible") return;
      inFlight = true;
      try {
        const res = await fetch("/api/version", {
          cache: "no-store",
          signal: AbortSignal.timeout(CHECK_TIMEOUT_MS),
        });
        if (!res.ok) return;
        const { version } = (await res.json()) as { version: string | null };
        setCheckedAt(Date.now());
        if (version !== known.current) {
          known.current = version;
          router.refresh();
        }
      } catch {
        // Network down or timeout: keep showing the last data.
      } finally {
        inFlight = false;
      }
    };
    const poll = setInterval(check, CHECK_EVERY_MS);
    const tick = setInterval(() => setNow(Date.now()), 1000);
    // Back on the tab: check at once instead of waiting for the next interval.
    document.addEventListener("visibilitychange", check);
    return () => {
      clearInterval(poll);
      clearInterval(tick);
      document.removeEventListener("visibilitychange", check);
    };
  }, [router]);

  const color = stale ? "bg-warning-on-navy" : "bg-success-on-navy";
  return (
    <span
      className={
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium " +
        (stale
          ? "bg-warning-on-navy/20 text-warning-on-navy"
          : "bg-success-on-navy/15 text-success-on-navy")
      }
    >
      <span className="relative inline-flex size-1.5" aria-hidden>
        {/* The pulse says "live"; stale data keeps a still dot. */}
        {!stale && (
          <span
            className={"absolute inset-0 rounded-full motion-safe:animate-live-pulse " + color}
          />
        )}
        <span className={"relative size-1.5 rounded-full " + color} />
      </span>
      {stale ? "Daten veraltet" : "Live"}
      <span className="font-normal tabular-nums opacity-75">
        · {formatAgo((now - checkedAt) / 1000)}
      </span>
    </span>
  );
}
