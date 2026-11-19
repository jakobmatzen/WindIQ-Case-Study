import { describe, expect, test } from "bun:test";
import { formatAgo } from "./format";

describe("formatAgo", () => {
  test("under 5 seconds is 'gerade eben', so the pill does not flicker through 0–4 s", () => {
    expect(formatAgo(0)).toBe("gerade eben");
    expect(formatAgo(4.9)).toBe("gerade eben");
  });

  test("seconds up to a minute, in whole seconds", () => {
    expect(formatAgo(5)).toBe("vor 5 s");
    expect(formatAgo(59.9)).toBe("vor 59 s");
  });

  test("minutes from one minute on, rounded down", () => {
    expect(formatAgo(60)).toBe("vor 1 min");
    expect(formatAgo(3599)).toBe("vor 59 min");
  });

  test("hours from one hour on, rounded down", () => {
    expect(formatAgo(3600)).toBe("vor 1 h");
    expect(formatAgo(26 * 3600)).toBe("vor 26 h");
  });

  test("a negative age (clock skew) counts as just now", () => {
    expect(formatAgo(-3)).toBe("gerade eben");
  });
});
