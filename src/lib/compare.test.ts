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
  provenanceMonths,
  resolvePinnedMonth,
} from "./compare";
import {
  LAYERS,
  gibsWmsUrl,
  formatTimelineLabel,
  monthRangeForLayer,
} from "./timeline";

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

describe("provenanceMonths", () => {
  it("names one month when nothing is pinned", () => {
    expect(provenanceMonths(LAYERS.ndvi, { year: 2024, month: 8 })).toBe(
      "Aug 2024"
    );
  });

  it("names both months of a comparison, pinned side first", () => {
    // The globe draws the pinned month left of the divider and the live month
    // right of it. The provenance line is what a reader pastes under the
    // figure, so it has to carry the pair the view is built from.
    expect(
      provenanceMonths(
        LAYERS.ndvi,
        { year: 2024, month: 8 },
        { year: 2019, month: 8 }
      )
    ).toBe("Aug 2019 vs Aug 2024");
  });

  it("dates an annual comparison by year", () => {
    const annual = LAYERS.landcover;
    expect(annual.cadence).toBe("annual");
    expect(
      provenanceMonths(
        annual,
        { year: 2020, month: 1 },
        { year: 2001, month: 1 }
      )
    ).toBe("2001 vs 2020");
  });

  it("collapses a self-comparison to a single month", () => {
    // Enabling compare pins the month already on screen (main.ts), so one
    // image is drawn on both sides of the divider until the user scrubs. One
    // image is one month of provenance.
    const ym = { year: 2024, month: 8 };
    expect(provenanceMonths(LAYERS.ndvi, ym, { ...ym })).toBe("Aug 2024");
  });

  it("dedupes on the built label, so an annual pair within one year is one date", () => {
    // Two distinct YearMonths that an annual product publishes as the same
    // year: reporting "2020 vs 2020" would claim a change-detection pair the
    // catalog cannot separate.
    expect(
      provenanceMonths(
        LAYERS.landcover,
        { year: 2020, month: 1 },
        { year: 2020, month: 7 }
      )
    ).toBe("2020");
  });

  it("agrees with the divider caption for every layer", () => {
    // The line and the on-screen chips must not drift: one authority for how
    // a comparison is dated, read off compareCaption rather than restated.
    for (const layer of Object.values(LAYERS)) {
      const pinned = { year: 2015, month: 3 };
      const live = { year: 2020, month: 9 };
      expect(provenanceMonths(layer, live, pinned)).toBe(
        compareCaption(layer, pinned, live)
      );
      expect(provenanceMonths(layer, live)).toBe(
        formatTimelineLabel(layer, live)
      );
    }
  });
});

describe("resolvePinnedMonth", () => {
  const monthly = monthRangeForLayer(LAYERS.ndvi);
  const annual = monthRangeForLayer(LAYERS.landcover);

  it("returns a dense monthly timeline's month unchanged", () => {
    expect(resolvePinnedMonth(monthly, { year: 2019, month: 8 })).toEqual({
      year: 2019,
      month: 8,
    });
  });

  it("restores every published slot of an annual layer", () => {
    // The regression: slot indices were derived by subtracting calendar
    // indices, so a 24-entry timeline spanning 277 calendar months lost every
    // pin from its third year onward and shared land-cover comparisons came
    // back empty. Assert over the whole catalogued record, not one sample.
    expect(LAYERS.landcover.cadence).toBe("annual");
    expect(annual.length).toBeGreaterThan(2);
    for (const slot of annual) {
      expect(resolvePinnedMonth(annual, slot)).toEqual(slot);
    }
  });

  it("snaps a month an annual product cannot resolve onto its own slot", () => {
    // MCD12Q1 classifies whole years; a July of an annual composite is not an
    // observation the product separates, so it must never reach the pinned
    // side of the divider verbatim.
    expect(resolvePinnedMonth(annual, { year: 2001, month: 7 })).toEqual({
      year: 2001,
      month: 1,
    });
    expect(resolvePinnedMonth(annual, { year: 2001, month: 11 })).toEqual({
      year: 2002,
      month: 1,
    });
  });

  it("declines a pin the layer's record does not cover", () => {
    // Outside the published span the honest answer is no comparison at all —
    // snapping onto an endpoint would invent a view the sender never shared.
    expect(
      resolvePinnedMonth(annual, { year: 1998, month: 1 })
    ).toBeUndefined();
    expect(
      resolvePinnedMonth(annual, { year: 2099, month: 1 })
    ).toBeUndefined();
    expect(
      resolvePinnedMonth(monthly, { year: 1970, month: 1 })
    ).toBeUndefined();
  });

  it("accepts both endpoints of every non-static layer's record", () => {
    for (const layer of Object.values(LAYERS)) {
      if (layer.static) continue;
      const slots = monthRangeForLayer(layer);
      expect(resolvePinnedMonth(slots, slots[0])).toEqual(slots[0]);
      const last = slots[slots.length - 1];
      expect(resolvePinnedMonth(slots, last)).toEqual(last);
    }
  });

  it("resolves to a slot the timeline actually publishes, never a gap", () => {
    // Whatever a link asks for, what comes back is drawable: the app requests
    // the pinned side's imagery for exactly this month.
    for (const pin of [
      { year: 2001, month: 7 },
      { year: 2010, month: 3 },
      { year: 2023, month: 11 },
    ]) {
      const resolved = resolvePinnedMonth(annual, pin);
      expect(resolved).toBeDefined();
      expect(annual).toContainEqual(resolved);
    }
  });

  it("declines an empty timeline", () => {
    expect(resolvePinnedMonth([], { year: 2020, month: 1 })).toBeUndefined();
  });
});
