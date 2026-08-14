import { describe, it, expect } from "vitest";
import {
  MIN_SPLIT,
  MAX_SPLIT,
  clampSplit,
  splitFromPointer,
  compareCaption,
  isTrivialCompare,
  exportMonthStamp,
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

describe("exportMonthStamp", () => {
  it("stamps a single month when nothing is pinned", () => {
    expect(exportMonthStamp({ year: 2024, month: 8 })).toBe("2024-08");
  });

  it("zero-pads the month so the field sorts", () => {
    expect(exportMonthStamp({ year: 2024, month: 1 })).toBe("2024-01");
    expect(exportMonthStamp({ year: 2024, month: 12 })).toBe("2024-12");
  });

  it("names both months and their sides of the divider", () => {
    expect(
      exportMonthStamp({ year: 2024, month: 8 }, { year: 2019, month: 8 })
    ).toBe("compare_2019-08-left_2024-08-right");
  });

  it("keeps the pinned month on the left however the pair is ordered", () => {
    // Pinning a month *later* than the live one is legal — the pinned side is
    // the left side by construction, not the earlier date.
    expect(
      exportMonthStamp({ year: 2019, month: 8 }, { year: 2024, month: 8 })
    ).toBe("compare_2024-08-left_2019-08-right");
  });

  it("stamps one month for a self-comparison, which shows one", () => {
    expect(
      exportMonthStamp({ year: 2020, month: 3 }, { year: 2020, month: 3 })
    ).toBe("2020-03");
  });

  it("never emits a comma, quote, or space into the filename", () => {
    const stamp = exportMonthStamp(
      { year: 2024, month: 8 },
      { year: 2019, month: 8 }
    );
    expect(stamp).toMatch(/^[A-Za-z0-9_-]+$/);
  });
});
