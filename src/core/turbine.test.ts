import { describe, expect, test } from "bun:test";
import { referenceTurbine } from "./__fixtures__/reference-turbine";
import { powerAt } from "./turbine";

describe("powerAt", () => {
  test("reads a support point of the power curve", () => {
    expect(powerAt(referenceTurbine, 8)).toBe(1590);
  });

  test("interpolates linearly between support points", () => {
    expect(powerAt(referenceTurbine, 5.5)).toBe(532.5);
    expect(powerAt(referenceTurbine, 9.25)).toBe(2330);
  });

  test("is 0 below cut-in, even where the curve would interpolate above 0", () => {
    expect(powerAt(referenceTurbine, 2.9)).toBe(0);
    expect(powerAt(referenceTurbine, 0)).toBe(0);
  });

  test("produces power from cut-in up to and including cut-out", () => {
    expect(powerAt(referenceTurbine, 3)).toBe(55);
    expect(powerAt(referenceTurbine, 25)).toBe(3600);
  });

  test("is 0 above cut-out (the turbine shuts down)", () => {
    expect(powerAt(referenceTurbine, 25.1)).toBe(0);
    expect(powerAt(referenceTurbine, 30)).toBe(0);
  });

  test("is 0 between cut-in and a curve that starts above it (no support point there)", () => {
    const startsAt3 = {
      ...referenceTurbine,
      cutInWindSpeedMs: 2.5,
      powerCurve: referenceTurbine.powerCurve.filter((p) => p.windSpeedMs >= 3),
    };
    expect(powerAt(startsAt3, 2.8)).toBe(0);
    expect(powerAt(startsAt3, 3)).toBe(55);
  });

  test("works on a curve the source sent unsorted", () => {
    const shuffled = {
      ...referenceTurbine,
      powerCurve: [...referenceTurbine.powerCurve].reverse(),
    };
    expect(powerAt(shuffled, 5.5)).toBe(532.5);
  });
});
