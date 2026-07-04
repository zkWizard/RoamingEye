import { describe, it, expect } from "vitest";
import {
  MIN_SPLIT,
  MAX_SPLIT,
  clampSplit,
  splitFromPointer,
  compareCaption,
  isTrivialCompare,
} from "./compare";

describe("clampSplit", () => {
  it("keeps the divider away from the edges", () => {
    expect(clampSplit(0)).toBe(MIN_SPLIT);
    expect(clampSplit(1)).toBe(MAX_SPLIT);
    expect(clampSplit(0.5)).toBe(0.5);
  });

  it("recovers from garbage input", () => {
    expect(clampSplit(Number.NaN)).toBe(0.5);
    expect(clampSplit(Number.POSITIVE_INFINITY)).toBe(0.5);
  });
});

describe("splitFromPointer", () => {
  it("maps pointer x to a fraction of the viewport", () => {
    expect(splitFromPointer(500, 1000)).toBe(0.5);
    expect(splitFromPointer(-40, 1000)).toBe(MIN_SPLIT);
    expect(splitFromPointer(1200, 1000)).toBe(MAX_SPLIT);
  });

  it("centers on a degenerate viewport", () => {
    expect(splitFromPointer(100, 0)).toBe(0.5);
  });
});

describe("captions", () => {
  it("describes the pinned-vs-live pair", () => {
    expect(
      compareCaption({ year: 2019, month: 8 }, { year: 2024, month: 8 })
    ).toBe("Aug 2019 vs Aug 2024");
  });

  it("flags a self-comparison", () => {
    expect(
      isTrivialCompare({ year: 2020, month: 1 }, { year: 2020, month: 1 })
    ).toBe(true);
    expect(
      isTrivialCompare({ year: 2020, month: 1 }, { year: 2020, month: 2 })
    ).toBe(false);
  });
});
