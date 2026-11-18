import { describe, expect, test } from "bun:test";
import { evaluateSyncFreshness, runDisplayStatus, sourceOutage } from "./health";

const now = new Date("2026-11-20T12:00:00Z");

describe("evaluateSyncFreshness", () => {
  test("never synced", () => {
    expect(evaluateSyncFreshness(null, now)).toEqual({ status: "never_synced", ageMinutes: null });
  });

  test("recent sync is ok", () => {
    const last = new Date("2026-11-20T11:30:00Z");
    expect(evaluateSyncFreshness(last, now)).toEqual({ status: "ok", ageMinutes: 30 });
  });

  test("exactly at the limit is still ok", () => {
    const last = new Date("2026-11-20T10:00:00Z");
    expect(evaluateSyncFreshness(last, now, 120).status).toBe("ok");
  });

  test("older than the limit is stale", () => {
    const last = new Date("2026-11-20T09:59:00Z");
    expect(evaluateSyncFreshness(last, now, 120)).toEqual({ status: "stale", ageMinutes: 121 });
  });
});

describe("sourceOutage", () => {
  test("no outage while the last sync is at most 2 hours old", () => {
    expect(sourceOutage(new Date("2026-11-20T10:00:00Z"), now)).toBeNull();
  });

  test("an outage once the last sync is older than 2 hours, in whole hours", () => {
    expect(sourceOutage(new Date("2026-11-20T09:59:00Z"), now)).toEqual({ duration: "2 h" });
    expect(sourceOutage(new Date("2026-11-19T12:00:00Z"), now)).toEqual({ duration: "24 h" });
  });

  test("an outage shorter than an hour, with a lower limit, in minutes instead of 0 h", () => {
    expect(sourceOutage(new Date("2026-11-20T11:15:00Z"), now, 30)).toEqual({
      duration: "45 min",
    });
  });

  test("no outage before the first sync: then there is no result to keep showing", () => {
    expect(sourceOutage(null, now)).toBeNull();
  });
});

describe("runDisplayStatus", () => {
  test("a finished run keeps its status", () => {
    const startedAt = new Date("2026-11-20T08:00:00Z");
    expect(runDisplayStatus({ status: "success", startedAt }, now)).toBe("success");
    expect(runDisplayStatus({ status: "error", startedAt }, now)).toBe("error");
  });

  test("a run started within the limit is still running", () => {
    const startedAt = new Date("2026-11-20T10:00:00Z");
    expect(runDisplayStatus({ status: "running", startedAt }, now, 120)).toBe("running");
  });

  test("a run still open after the limit was aborted (the worker stopped mid-run)", () => {
    const startedAt = new Date("2026-11-20T09:59:00Z");
    expect(runDisplayStatus({ status: "running", startedAt }, now, 120)).toBe("aborted");
  });
});
