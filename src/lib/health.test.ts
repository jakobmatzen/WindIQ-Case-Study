import { describe, expect, test } from "bun:test";
import { evaluateSyncFreshness } from "./health";

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
