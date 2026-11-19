"use client";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { formatAgo } from "@/lib/format";

/** How often the page asks whether the worker stored something new. Data arrives hourly. */
const CHECK_EVERY_MS = 30_000;
const CHECK_TIMEOUT_MS = 10_000;
/** Failed checks in a row before the pill admits it cannot reach the server. */
const OFFLINE_AFTER_FAILURES = 2;

/**
 * Keeps the page live: polls `/api/version` and re-renders the page on the server
 * (`router.refresh()`) only when the data version changed, so the page updates without a
 * reload and keeps its scroll position. A failed check never touches the data shown.
 * Pauses while the tab is hidden and checks at once when it comes back.
 */
function useLiveRefresh(dataVersion: string | null) {
  const router = useRouter();
  const known = useRef(dataVersion);
  const [checkedAt, setCheckedAt] = useState(() => Date.now());
  const [failures, setFailures] = useState(0);
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
      // AbortController + timer instead of AbortSignal.timeout, which older Safari lacks.
      const abort = new AbortController();
      const timer = setTimeout(() => abort.abort(), CHECK_TIMEOUT_MS);
      try {
        const res = await fetch("/api/version", { cache: "no-store", signal: abort.signal });
        if (!res.ok) throw new Error(`version check failed: ${res.status}`);
        const { version } = (await res.json()) as { version: string | null };
        setCheckedAt(Date.now());
        setFailures(0);
        if (version !== known.current) {
          known.current = version;
          router.refresh();
        }
      } catch {
        // Database or network down, or timeout: keep showing the last data.
        setFailures((f) => f + 1);
      } finally {
        clearTimeout(timer);
        inFlight = false;
      }
    };
    const poll = setInterval(check, CHECK_EVERY_MS);
    // The "vor …" label ticks only while someone can see it.
    const tick = setInterval(() => {
      if (document.visibilityState === "visible") setNow(Date.now());
    }, 1000);
    const onVisible = () => {
      setNow(Date.now());
      void check();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(poll);
      clearInterval(tick);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [router]);

  return {
    secondsSinceCheck: (now - checkedAt) / 1000,
    offline: failures >= OFFLINE_AFTER_FAILURES,
  };
}

/**
 * The status pill in the rail. "Live · vor 12 s" with a pulsing dot while the data is fresh and
 * the server answers; a still dot when the data is stale or the server cannot be reached.
 */
export function LiveStatus({ stale, dataVersion }: { stale: boolean; dataVersion: string | null }) {
  const { secondsSinceCheck, offline } = useLiveRefresh(dataVersion);
  const live = !stale && !offline;
  const color = live ? "bg-success-on-navy" : "bg-warning-on-navy";
  return (
    <span
      className={
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium " +
        (live
          ? "bg-success-on-navy/15 text-success-on-navy"
          : "bg-warning-on-navy/20 text-warning-on-navy")
      }
    >
      <span className="relative inline-flex size-1.5" aria-hidden>
        {live && (
          <span
            className={"absolute inset-0 rounded-full motion-safe:animate-live-pulse " + color}
          />
        )}
        <span className={"relative size-1.5 rounded-full " + color} />
      </span>
      {/* Stale: no time, the outage notice says how long. Offline: time of the last answer. */}
      {stale ? (
        "Daten veraltet"
      ) : (
        <>
          {offline ? "Keine Verbindung" : "Live"}
          <span className="font-normal tabular-nums opacity-75">
            · {formatAgo(secondsSinceCheck)}
          </span>
        </>
      )}
    </span>
  );
}

/** Polling without the pill, for the page before the first result: it appears on its own. */
export function LiveRefresh({ dataVersion }: { dataVersion: string | null }) {
  useLiveRefresh(dataVersion);
  return null;
}
