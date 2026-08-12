import { describe, it, expect } from "vitest";
import {
  ymToIndex,
  indexToYm,
  addMonths,
  compareYm,
  formatYm,
  buildMonthRange,
  isAvailable,
  isUnpublished,
  ymEqual,
  fractionToIndex,
  indexToFraction,
  gibsWmsUrl,
  clampIndexToLayer,
  monthRangeForLayer,
  nearestMonthIndex,
  formatTimelineLabel,
  LAYERS,
  DATA_LATEST,
} from "./timeline";

describe("year/month arithmetic", () => {
  it("round-trips index <-> year/month", () => {
    for (const ym of [
      { year: 2000, month: 1 },
      { year: 2021, month: 6 },
      { year: 2026, month: 12 },
    ]) {
      expect(indexToYm(ymToIndex(ym))).toEqual(ym);
    }
  });

  it("addMonths crosses year boundaries both ways", () => {
    expect(addMonths({ year: 2025, month: 11 }, 3)).toEqual({
      year: 2026,
      month: 2,
    });
    expect(addMonths({ year: 2026, month: 1 }, -2)).toEqual({
      year: 2025,
      month: 11,
    });
  });

  it("compareYm orders chronologically", () => {
    expect(
      compareYm({ year: 2021, month: 6 }, { year: 2021, month: 7 })
    ).toBeLessThan(0);
    expect(
      compareYm({ year: 2022, month: 1 }, { year: 2021, month: 12 })
    ).toBeGreaterThan(0);
    expect(compareYm({ year: 2024, month: 4 }, { year: 2024, month: 4 })).toBe(
      0
    );
  });

  it("formats a label", () => {
    expect(formatYm({ year: 2026, month: 6 })).toBe("Jun 2026");
  });
});

describe("buildMonthRange", () => {
  it("returns `count` months ending at `end`, oldest first", () => {
    const range = buildMonthRange({ year: 2026, month: 5 }, 60);
    expect(range).toHaveLength(60);
    expect(range[0]).toEqual({ year: 2021, month: 6 });
    expect(range[range.length - 1]).toEqual({ year: 2026, month: 5 });
  });

  it("is strictly consecutive", () => {
    const range = buildMonthRange({ year: 2023, month: 3 }, 5);
    for (let i = 1; i < range.length; i++) {
      expect(ymToIndex(range[i]) - ymToIndex(range[i - 1])).toBe(1);
    }
  });
});

describe("isAvailable", () => {
  it("respects the layer start and the global latest", () => {
    expect(isAvailable(LAYERS.ndvi, { year: 1999, month: 12 })).toBe(false);
    expect(isAvailable(LAYERS.ndvi, LAYERS.ndvi.start)).toBe(true);
    expect(isAvailable(LAYERS.ndvi, DATA_LATEST)).toBe(true);
    expect(isAvailable(LAYERS.ndvi, addMonths(DATA_LATEST, 1))).toBe(false);
  });
});

describe("slider position mapping", () => {
  it("maps endpoints", () => {
    expect(fractionToIndex(0, 60)).toBe(0);
    expect(fractionToIndex(1, 60)).toBe(59);
    expect(indexToFraction(0, 60)).toBe(0);
    expect(indexToFraction(59, 60)).toBe(1);
  });

  it("snaps to the nearest index and clamps out-of-range input", () => {
    expect(fractionToIndex(0.5, 61)).toBe(30);
    expect(fractionToIndex(-0.2, 60)).toBe(0);
    expect(fractionToIndex(1.5, 60)).toBe(59);
  });

  it("round-trips index -> fraction -> index", () => {
    const count = 60;
    for (const i of [0, 7, 30, 59]) {
      expect(fractionToIndex(indexToFraction(i, count), count)).toBe(i);
    }
  });
});

describe("clampIndexToLayer", () => {
  const months = buildMonthRange({ year: 2026, month: 5 }, 60); // Jun 2021 → May 2026

  it("keeps the index for a layer that covers the latest month", () => {
    expect(clampIndexToLayer(months, 59, LAYERS.ndvi)).toBe(59);
  });

  it("snaps back to a covered month for a lagging layer", () => {
    const idx = clampIndexToLayer(months, 59, LAYERS.precip); // latest 2026-01
    expect(months[idx]).toEqual({ year: 2026, month: 1 });
  });

  it("leaves earlier indices untouched", () => {
    expect(clampIndexToLayer(months, 10, LAYERS.precip)).toBe(10);
  });
});

describe("gibsWmsUrl", () => {
  it("targets GIBS WMS with the layer and month", () => {
    const url = gibsWmsUrl(LAYERS.ndvi, { year: 2021, month: 6 });
    expect(url).toContain("gibs.earthdata.nasa.gov/wms/epsg4326/best/wms.cgi");
    expect(url).toContain("LAYERS=MODIS_Terra_L3_NDVI_Monthly");
    expect(url).toContain("TIME=2021-06-01");
    expect(url).toContain("REQUEST=GetMap");
  });

  it("zero-pads single-digit months", () => {
    const url = gibsWmsUrl(LAYERS.snow, { year: 2024, month: 1 });
    expect(url).toContain("TIME=2024-01-01");
  });

  it("honours custom dimensions", () => {
    const url = gibsWmsUrl(
      LAYERS.ndvi,
      { year: 2021, month: 6 },
      { width: 1024, height: 512 }
    );
    expect(url).toContain("WIDTH=1024");
    expect(url).toContain("HEIGHT=512");
  });
});

describe("monthRangeForLayer", () => {
  it("spans the layer's full record, start to latest", () => {
    const range = monthRangeForLayer(LAYERS.ndvi); // 2000-03 → DATA_LATEST
    expect(range[0]).toEqual({ year: 2000, month: 3 });
    expect(range[range.length - 1]).toEqual(DATA_LATEST);
    expect(range.length).toBeGreaterThan(300); // 26+ years of months
  });

  it("respects a layer's own latest month", () => {
    const range = monthRangeForLayer(LAYERS.airtemp); // 1980-01 → 2026-03
    expect(range[0]).toEqual({ year: 1980, month: 1 });
    expect(range[range.length - 1]).toEqual({ year: 2026, month: 3 });
    expect(range.length).toBe((2026 - 1980) * 12 + 3);
  });

  it("is consecutive for a layer with no declared distribution gaps", () => {
    // Was asserted on sst, whose record is not in fact contiguous: GIBS
    // advertises it as five disjoint ranges. lst declares no gaps, so it is
    // the honest fixture for the consecutive case; the layers that do declare
    // gaps assert their own discontinuities below.
    expect(LAYERS.lst.unpublished).toBeUndefined();
    const range = monthRangeForLayer(LAYERS.lst);
    for (let i = 1; i < range.length; i++) {
      expect(ymToIndex(range[i])).toBe(ymToIndex(range[i - 1]) + 1);
    }
  });
});

describe("MOD13A3 distribution gap (NDVI/EVI, April 2025)", () => {
  // GIBS advertises the vegetation-index time dimension as two disjoint
  // ranges — 2000-03/2025-03 and 2025-05/2026-06 — so April 2025 was never
  // distributed and its tile 404s. The gap is a property of the product, not
  // of the surface: nothing was observed to be missing that month.
  const GAP = { year: 2025, month: 4 };

  it("declares the gap on both MOD13A3 layers, and on no other product", () => {
    expect(LAYERS.ndvi.unpublished).toEqual([GAP]);
    // NDVI and EVI are two fields of the same granule, so the gap is shared.
    expect(LAYERS.evi.unpublished).toEqual(LAYERS.ndvi.unpublished);
    // Other products declare their own gaps; none of them is this month.
    const alsoDeclaring = Object.values(LAYERS)
      .filter((layer) => layer.unpublished?.length)
      .filter((layer) => layer.id !== "ndvi" && layer.id !== "evi");
    expect(alsoDeclaring.map((layer) => layer.id)).toEqual(["sst"]);
    for (const layer of alsoDeclaring) {
      expect(isUnpublished(layer, GAP)).toBe(false);
    }
  });

  it("reports the gap month as unavailable, inside the record", () => {
    expect(isUnpublished(LAYERS.ndvi, GAP)).toBe(true);
    expect(isAvailable(LAYERS.ndvi, GAP)).toBe(false);
    // It is genuinely interior: the months on either side are published.
    expect(isAvailable(LAYERS.ndvi, { year: 2025, month: 3 })).toBe(true);
    expect(isAvailable(LAYERS.ndvi, { year: 2025, month: 5 })).toBe(true);
    expect(compareYm(GAP, LAYERS.ndvi.start)).toBeGreaterThan(0);
    expect(compareYm(GAP, DATA_LATEST)).toBeLessThan(0);
  });

  it("drops the gap from the enumerated record, leaving the rest intact", () => {
    const range = monthRangeForLayer(LAYERS.ndvi);
    expect(range.some((ym) => ymEqual(ym, GAP))).toBe(false);
    expect(range[0]).toEqual({ year: 2000, month: 3 });
    expect(range[range.length - 1]).toEqual(DATA_LATEST);
    // Exactly one month short of the contiguous span it would otherwise be.
    const span = ymToIndex(DATA_LATEST) - ymToIndex(LAYERS.ndvi.start) + 1;
    expect(range.length).toBe(span - 1);
  });

  it("leaves the record's only discontinuity at the declared gap", () => {
    const range = monthRangeForLayer(LAYERS.evi);
    const breaks = range
      .slice(1)
      .filter((ym, i) => ymToIndex(ym) !== ymToIndex(range[i]) + 1);
    expect(breaks).toEqual([{ year: 2025, month: 5 }]);
  });

  it("keeps a layer with no declared gap contiguous", () => {
    expect(LAYERS.lst.unpublished).toBeUndefined();
    expect(isUnpublished(LAYERS.lst, GAP)).toBe(false);
    expect(isAvailable(LAYERS.lst, GAP)).toBe(true);
  });

  it("still steps the scrubber across the gap without landing in it", () => {
    const range = monthRangeForLayer(LAYERS.ndvi);
    // Asking for the missing month snaps to a neighbour that exists.
    const nearest = range[nearestMonthIndex(range, GAP)];
    expect(ymEqual(nearest, GAP)).toBe(false);
    expect(Math.abs(ymToIndex(nearest) - ymToIndex(GAP))).toBe(1);
  });
});

describe("MODIS/Aqua SST distribution gaps (daytime monthly composite)", () => {
  // GIBS advertises this layer's time dimension as five disjoint ranges, so
  // five months inside the record were never distributed and their tiles 404.
  // Unlike absent SST *pixels* — cloud, sea ice, and sun glint all withhold a
  // thermal-IR retrieval, which is a real statement about the sea surface —
  // these months carry no observation at all.
  const GAPS = [
    { year: 2022, month: 11 },
    { year: 2022, month: 12 },
    { year: 2023, month: 6 },
    { year: 2023, month: 10 },
    { year: 2025, month: 12 },
  ];
  const sstLatest = LAYERS.sst.latest ?? DATA_LATEST;

  it("declares exactly the five months GIBS omits, in order", () => {
    expect(LAYERS.sst.unpublished).toEqual(GAPS);
  });

  it("reports every gap as unavailable but interior to the record", () => {
    for (const gap of GAPS) {
      expect(isUnpublished(LAYERS.sst, gap)).toBe(true);
      expect(isAvailable(LAYERS.sst, gap)).toBe(false);
      expect(compareYm(gap, LAYERS.sst.start)).toBeGreaterThan(0);
      expect(compareYm(gap, sstLatest)).toBeLessThan(0);
    }
  });

  it("keeps the month on each side of every gap available", () => {
    for (const gap of GAPS) {
      const before = addMonths(gap, -1);
      const after = addMonths(gap, 1);
      // Nov/Dec 2022 are consecutive, so a neighbour can be another gap.
      if (!isUnpublished(LAYERS.sst, before)) {
        expect(isAvailable(LAYERS.sst, before)).toBe(true);
      }
      if (!isUnpublished(LAYERS.sst, after)) {
        expect(isAvailable(LAYERS.sst, after)).toBe(true);
      }
    }
  });

  it("drops the gaps from the enumerated record and nothing else", () => {
    const range = monthRangeForLayer(LAYERS.sst);
    for (const gap of GAPS) {
      expect(range.some((ym) => ymEqual(ym, gap))).toBe(false);
    }
    expect(range[0]).toEqual({ year: 2002, month: 7 });
    expect(range[range.length - 1]).toEqual(sstLatest);
    const span = ymToIndex(sstLatest) - ymToIndex(LAYERS.sst.start) + 1;
    expect(range.length).toBe(span - GAPS.length);
  });

  it("leaves discontinuities only where a gap was declared", () => {
    const range = monthRangeForLayer(LAYERS.sst);
    const resumesAfterBreak = range
      .slice(1)
      .filter((ym, i) => ymToIndex(ym) !== ymToIndex(range[i]) + 1);
    // Four breaks, not five: Nov and Dec 2022 form one two-month gap.
    expect(resumesAfterBreak).toEqual([
      { year: 2023, month: 1 },
      { year: 2023, month: 7 },
      { year: 2023, month: 11 },
      { year: 2026, month: 1 },
    ]);
  });

  it("thins the same-calendar-month baselines the gaps fall in", () => {
    // The scientific cost of the gaps: a December or June SST anomaly is
    // measured against one fewer year than the record's span implies. This
    // pins that the shortfall is now visible to callers rather than silently
    // filled by a month that would have 404'd.
    const range = monthRangeForLayer(LAYERS.sst);
    const decembers = range.filter((ym) => ym.month === 12);
    expect(decembers.some((ym) => ym.year === 2022)).toBe(false);
    expect(decembers.some((ym) => ym.year === 2025)).toBe(false);
    // 2002-07 → 2026-03 spans 24 Decembers (2002…2025) less the two skipped.
    expect(decembers.length).toBe(22);
    const junes = range.filter((ym) => ym.month === 6);
    expect(junes.some((ym) => ym.year === 2023)).toBe(false);
  });

  it("snaps the scrubber to a published month instead of into a gap", () => {
    const range = monthRangeForLayer(LAYERS.sst);
    for (const gap of GAPS) {
      const nearest = range[nearestMonthIndex(range, gap)];
      expect(isUnpublished(LAYERS.sst, nearest)).toBe(false);
      expect(isAvailable(LAYERS.sst, nearest)).toBe(true);
    }
  });

  it("does not leak the SST gaps onto another product's layer", () => {
    // The sibling *night* SST layer skips a different set of months, which is
    // why these are distribution artifacts and not an ocean signal. Nothing
    // else in the catalog shares this product's record.
    for (const gap of GAPS) {
      expect(isUnpublished(LAYERS.lst, gap)).toBe(false);
      expect(isAvailable(LAYERS.airtemp, gap)).toBe(true);
    }
  });
});

describe("annual cadence (land cover)", () => {
  it("builds one January entry per year, oldest → newest", () => {
    const range = monthRangeForLayer(LAYERS.landcover); // 2001 → 2024, P1Y
    expect(range).toHaveLength(24);
    expect(range[0]).toEqual({ year: 2001, month: 1 });
    expect(range[range.length - 1]).toEqual({ year: 2024, month: 1 });
    for (const ym of range) expect(ym.month).toBe(1);
  });

  it("addresses GIBS by January 1st of the selected year", () => {
    const url = gibsWmsUrl(LAYERS.landcover, { year: 2020, month: 1 });
    expect(url).toContain("TIME=2020-01-01");
    expect(url).toContain(
      "LAYERS=MODIS_Combined_L3_IGBP_Land_Cover_Type_Annual"
    );
  });

  it("labels annual entries with the bare year", () => {
    expect(
      formatTimelineLabel(LAYERS.landcover, { year: 2019, month: 1 })
    ).toBe("2019");
    expect(formatTimelineLabel(LAYERS.ndvi, { year: 2019, month: 6 })).toBe(
      "Jun 2019"
    );
  });
});

describe("nearestMonthIndex", () => {
  it("maps a month to the nearest annual entry", () => {
    const range = monthRangeForLayer(LAYERS.landcover);
    expect(nearestMonthIndex(range, { year: 2010, month: 5 })).toBe(9); // 2010
    expect(nearestMonthIndex(range, { year: 2010, month: 11 })).toBe(10); // → 2011
  });

  it("clamps to the record ends", () => {
    const range = monthRangeForLayer(LAYERS.landcover);
    expect(nearestMonthIndex(range, { year: 1990, month: 6 })).toBe(0);
    expect(nearestMonthIndex(range, { year: 2030, month: 6 })).toBe(
      range.length - 1
    );
  });

  it("is exact for consecutive monthly ranges", () => {
    const range = monthRangeForLayer(LAYERS.airtemp);
    expect(nearestMonthIndex(range, { year: 1980, month: 1 })).toBe(0);
    expect(nearestMonthIndex(range, { year: 1985, month: 7 })).toBe(
      ymToIndex({ year: 1985, month: 7 }) - ymToIndex({ year: 1980, month: 1 })
    );
  });
});
