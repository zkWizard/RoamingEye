import { describe, it, expect } from "vitest";
import {
  MIN_SPLIT,
  MAX_SPLIT,
  clampSplit,
  splitFromPointer,
  compareCaption,
  isTrivialCompare,
  exportMonthStamp,
  imageryUrlExport,
} from "./compare";
import { LAYERS, gibsWmsUrl, formatTimelineLabel } from "./timeline";

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
      compareCaption(
        LAYERS.ndvi,
        { year: 2019, month: 8 },
        { year: 2024, month: 8 }
      )
    ).toBe("Aug 2019 vs Aug 2024");
  });

  it("dates an annual product by year, not by its placeholder month", () => {
    // monthRangeForLayer enumerates annual layers as {year, month: 1}: the
    // month is a slot, not an observation. Naming it would date each side of
    // a land-cover swipe to a January MCD12Q1 never resolved — and contradict
    // the scrubber, which reads a bare year for the very same view.
    const annual = LAYERS.landcover;
    expect(annual.cadence).toBe("annual");
    expect(
      compareCaption(annual, { year: 2001, month: 1 }, { year: 2020, month: 1 })
    ).toBe("2001 vs 2020");
  });

  it("labels each side exactly as the timeline labels it", () => {
    // Reads the invariant off formatTimelineLabel rather than restating its
    // output, so a cadence added to the catalog cannot drift the two apart.
    for (const layer of Object.values(LAYERS)) {
      const pinned = { year: 2015, month: 3 };
      const live = { year: 2020, month: 9 };
      expect(compareCaption(layer, pinned, live)).toBe(
        `${formatTimelineLabel(layer, pinned)} vs ${formatTimelineLabel(layer, live)}`
      );
    }
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

describe("imageryUrlExport", () => {
  const LIVE = { year: 2024, month: 8 };
  const PINNED = { year: 2019, month: 8 };

  it("copies the live month's URL when nothing is pinned", () => {
    expect(imageryUrlExport(LAYERS.ndvi, LIVE)).toBe(
      gibsWmsUrl(LAYERS.ndvi, LIVE)
    );
  });

  it("copies one URL per month of a comparison, pinned side first", () => {
    expect(imageryUrlExport(LAYERS.ndvi, LIVE, PINNED)).toBe(
      `${gibsWmsUrl(LAYERS.ndvi, PINNED)}\n${gibsWmsUrl(LAYERS.ndvi, LIVE)}`
    );
  });

  it("addresses each line at the month it stands for", () => {
    const lines = imageryUrlExport(LAYERS.sst, LIVE, PINNED).split("\n");
    expect(lines).toHaveLength(2);
    expect(lines[0]).toContain("TIME=2019-08-01");
    expect(lines[1]).toContain("TIME=2024-08-01");
  });

  it("keeps the pinned month first however the pair is ordered", () => {
    // Pinning a month later than the live one is legal; left is the pinned
    // side by construction, not the earlier date (see exportMonthStamp).
    const lines = imageryUrlExport(LAYERS.ndvi, PINNED, LIVE).split("\n");
    expect(lines[0]).toContain("TIME=2024-08-01");
    expect(lines[1]).toContain("TIME=2019-08-01");
  });

  it("copies one URL for a self-comparison, which draws one image", () => {
    expect(imageryUrlExport(LAYERS.ndvi, LIVE, { ...LIVE })).toBe(
      gibsWmsUrl(LAYERS.ndvi, LIVE)
    );
  });

  it("copies one URL for a static layer, whose months are the same image", () => {
    // `terrain` carries no TIME param, so two months are one GetMap request.
    expect(imageryUrlExport(LAYERS.terrain, LIVE, PINNED)).toBe(
      gibsWmsUrl(LAYERS.terrain, LIVE)
    );
  });

  it("emits only whole GetMap URLs, one per line", () => {
    for (const line of imageryUrlExport(LAYERS.ndvi, LIVE, PINNED).split(
      "\n"
    )) {
      expect(line).toMatch(/^https:\/\/gibs\.earthdata\.nasa\.gov\/wms\//);
      expect(line).toContain("REQUEST=GetMap");
    }
  });
});
