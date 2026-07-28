import { describe, expect, it } from "vitest";
import {
  CLIMATE_METRICS,
  summarizeMonthlyClimate,
  type ClimateMetricId,
  type MonthlyClimateObservation,
} from "./climate";
import {
  CLIMATE_SERIES_EXTREMES_LIMITATIONS,
  climateSeriesExtremes,
} from "./climateSeriesExtremes";
import type { YearMonth } from "./timeline";

/** Build a published, usable summary for a metric at a chosen month. */
function summary(
  metricId: ClimateMetricId,
  value: number | null,
  dataMonth: YearMonth,
  extra: Partial<MonthlyClimateObservation> = {}
) {
  return summarizeMonthlyClimate(
    { metricId, dataMonth, value, ...extra },
    { year: dataMonth.year + 1, month: dataMonth.month }
  );
}

/** Convenience for the common air-temperature case. */
function air(value: number | null, month: number, year = 2026) {
  return summary("air-temperature-2m", value, { year, month });
}

describe("climate series extremes", () => {
  it("finds the coldest and warmest usable months and the native range", () => {
    const result = climateSeriesExtremes([
      air(289.4, 1),
      air(301.2, 7),
      air(295.0, 4),
    ]);

    expect(result).toMatchObject({
      kind: "observed-climate-series-extremes",
      isForecast: false,
      nativeUnit: "K",
      monthsSupplied: 3,
      monthsUsable: 3,
    });
    expect(result.minimum).toEqual({
      dataMonth: { year: 2026, month: 1 },
      value: 289.4,
    });
    expect(result.maximum).toEqual({
      dataMonth: { year: 2026, month: 7 },
      value: 301.2,
    });
    expect(result.rangeNative).toBeCloseTo(301.2 - 289.4, 9);
    expect(result.usableMonthSpan).toEqual({
      earliest: { year: 2026, month: 1 },
      latest: { year: 2026, month: 7 },
    });
  });

  it("preserves the cited metric and dataset provenance", () => {
    const result = climateSeriesExtremes([air(290, 3), air(292, 5)]);

    expect(result.metric).toBe(CLIMATE_METRICS["air-temperature-2m"]);
    expect(result.source).toBe(CLIMATE_METRICS["air-temperature-2m"].source);
  });

  it("treats a single usable month as its own extreme with a zero range", () => {
    const result = climateSeriesExtremes([air(288.15, 2)]);

    expect(result.monthsUsable).toBe(1);
    expect(result.minimum).toEqual(result.maximum);
    expect(result.rangeNative).toBe(0);
    expect(result.usableMonthSpan).toEqual({
      earliest: { year: 2026, month: 2 },
      latest: { year: 2026, month: 2 },
    });
  });

  it("excludes unusable months and never treats a gap as an extreme", () => {
    // A no-data January and a not-yet-published August must not become the
    // coldest/warmest observed month.
    const noData = air(null, 1);
    const future = summarizeMonthlyClimate(
      {
        metricId: "air-temperature-2m",
        dataMonth: { year: 2026, month: 8 },
        value: 250,
      },
      { year: 2026, month: 5 }
    );
    expect(future.publicationStatus).toBe("not-yet-published");

    const result = climateSeriesExtremes([
      noData,
      air(295, 6),
      future,
      air(299, 7),
    ]);

    expect(result.monthsSupplied).toBe(4);
    expect(result.monthsUsable).toBe(2);
    expect(result.minimum?.value).toBe(295);
    expect(result.maximum?.value).toBe(299);
    expect(result.usableMonthSpan).toEqual({
      earliest: { year: 2026, month: 6 },
      latest: { year: 2026, month: 7 },
    });
  });

  it("reports all-null extremes when no month is usable", () => {
    const result = climateSeriesExtremes([air(null, 1), air(null, 2)]);

    expect(result.monthsSupplied).toBe(2);
    expect(result.monthsUsable).toBe(0);
    expect(result.minimum).toBeNull();
    expect(result.maximum).toBeNull();
    expect(result.rangeNative).toBeNull();
    expect(result.usableMonthSpan).toBeNull();
  });

  it("breaks value ties toward the earlier month, order-independently", () => {
    const forward = climateSeriesExtremes([
      air(295, 3),
      air(295, 9),
      air(295, 6),
    ]);
    const reversed = climateSeriesExtremes([
      air(295, 9),
      air(295, 6),
      air(295, 3),
    ]);

    for (const result of [forward, reversed]) {
      expect(result.minimum).toEqual({
        dataMonth: { year: 2026, month: 3 },
        value: 295,
      });
      expect(result.maximum).toEqual({
        dataMonth: { year: 2026, month: 3 },
        value: 295,
      });
      expect(result.rangeNative).toBe(0);
    }
  });

  it("spans usable months correctly across a year boundary", () => {
    const result = climateSeriesExtremes([
      air(280, 11, 2025),
      air(275, 1, 2026),
      air(285, 6, 2026),
    ]);

    expect(result.minimum?.value).toBe(275);
    expect(result.maximum?.value).toBe(285);
    expect(result.usableMonthSpan).toEqual({
      earliest: { year: 2025, month: 11 },
      latest: { year: 2026, month: 6 },
    });
  });

  it("works for precipitation rate in its own native unit", () => {
    const result = climateSeriesExtremes([
      summary("precipitation-rate", 0.00002, { year: 2026, month: 1 }),
      summary("precipitation-rate", 0.00008, { year: 2026, month: 7 }),
    ]);

    expect(result.nativeUnit).toBe("kg/m²/s");
    expect(result.minimum?.value).toBeCloseTo(0.00002, 12);
    expect(result.maximum?.value).toBeCloseTo(0.00008, 12);
    expect(result.rangeNative).toBeCloseTo(0.00006, 12);
  });

  it("throws on an empty series so no result is left un-citable", () => {
    expect(() => climateSeriesExtremes([])).toThrow(/at least one/i);
  });

  it("throws when the series mixes metrics with different native units", () => {
    expect(() =>
      climateSeriesExtremes([
        air(290, 1),
        summary("precipitation-rate", 0.0001, { year: 2026, month: 2 }),
      ])
    ).toThrow(/consistent metric provenance/i);
  });

  it("rejects a reused metric ID with conflicting unit or source provenance", () => {
    const canonical = air(290, 1);
    const wrongUnit = {
      ...air(16.85, 2),
      metric: { ...canonical.metric, nativeUnit: "Â°C" },
    };
    const wrongSource = {
      ...air(292, 3),
      metric: {
        ...canonical.metric,
        source: { ...canonical.metric.source, version: "uncited-revision" },
      },
    };

    expect(() => climateSeriesExtremes([canonical, wrongUnit])).toThrow(
      /consistent metric provenance/i
    );
    expect(() => climateSeriesExtremes([canonical, wrongSource])).toThrow(
      /consistent metric provenance/i
    );
  });

  it("documents that extremes are a sample reduction, not a record", () => {
    expect(CLIMATE_SERIES_EXTREMES_LIMITATIONS).toMatch(/supplied series/i);
    expect(CLIMATE_SERIES_EXTREMES_LIMITATIONS).toMatch(/not a .*forecast/i);
  });
});
