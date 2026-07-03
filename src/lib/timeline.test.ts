import { describe, it, expect } from "vitest";
import {
  ymToIndex,
  indexToYm,
  addMonths,
  compareYm,
  formatYm,
  buildMonthRange,
  isAvailable,
  fractionToIndex,
  indexToFraction,
  gibsWmsUrl,
  clampIndexToLayer,
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
