import { describe, expect, it } from "vitest";
import {
  MINIMUM_NDVI_SEASONAL_BASELINE_SAMPLES,
  MINIMUM_NDVI_SEASONAL_VALID_FRACTION,
  NDVI_METRIC,
  NDVI_SEASONAL_BASELINE_LIMITATIONS,
  compareMonthlyNdviToSeasonalBaseline,
  summarizeMonthlyNdvi,
} from "./phenologyBaseline";
import {
  NDVI_SOURCE,
  NDVI_UNIT,
  type NdviMonthlyObservation,
} from "./phenology";
import type { YearMonth } from "./timeline";

const AVAILABLE_THROUGH: YearMonth = { year: 2026, month: 5 };

function ndvi(
  year: number,
  month: number,
  value: number | null,
  validFraction = 0.8
): NdviMonthlyObservation {
  return { month: { year, month }, ndvi: value, validFraction };
}

describe("seasonal NDVI baseline comparisons", () => {
  it("retains MOD13A3 provenance, native units, months, coverage, and descriptive uncertainty", () => {
    const baseline = Array.from({ length: 10 }, (_, index) =>
      ndvi(2014 + index, 8, 0.3 + index * 0.01, 0.65 + index * 0.01)
    );
    const comparison = compareMonthlyNdviToSeasonalBaseline(
      ndvi(2025, 8, 0.5, 0.9),
      [ndvi(2013, 8, 0.2), ...baseline, ndvi(2020, 7, 0.9)],
      AVAILABLE_THROUGH,
      48.8,
      { baselineStartYear: 2014, baselineEndYear: 2023 }
    );

    expect(comparison).toMatchObject({
      kind: "same-calendar-month-ndvi-baseline",
      isForecast: false,
      status: "available",
      metric: NDVI_METRIC,
      hemisphere: "northern",
      meteorologicalSeason: "summer",
      target: {
        dataMonth: { year: 2025, month: 8 },
        availableThrough: AVAILABLE_THROUGH,
        publicationStatus: "published",
        publicationLagMonths: 9,
        coverage: { status: "available", validFraction: 0.9 },
        observedValue: 0.5,
      },
      bounds: { startYear: 2014, endYear: 2023, calendarMonth: 8 },
      baseline: {
        sampleCount: MINIMUM_NDVI_SEASONAL_BASELINE_SAMPLES,
        requiredSampleCount: MINIMUM_NDVI_SEASONAL_BASELINE_SAMPLES,
        min: 0.3,
        minimumValidFraction: 0.65,
        requiredValidFraction: MINIMUM_NDVI_SEASONAL_VALID_FRACTION,
      },
      exclusions: { outOfBounds: 1, wrongCalendarMonth: 1 },
      differenceUnit: NDVI_UNIT,
      reason: null,
    });
    expect(comparison.metric.source).toBe(NDVI_SOURCE);
    expect(comparison.limitations).toBe(NDVI_SEASONAL_BASELINE_LIMITATIONS);
    expect(comparison.baseline.mean).toBeCloseTo(0.345);
    expect(comparison.differenceFromBaseline).toBeCloseTo(0.155);
    expect(comparison.samples.map((sample) => sample.month.month)).toEqual(
      Array(10).fill(8)
    );
    expect(comparison.baseline.sampleStandardDeviation).toBeGreaterThan(0);
    expect(comparison.baseline.standardErrorOfMean).toBeGreaterThan(0);
  });

  it("does not treat missing boundary coverage as adequate coverage", () => {
    const comparison = compareMonthlyNdviToSeasonalBaseline(
      { month: { year: 2025, month: 6 }, ndvi: 0.55 },
      Array.from({ length: 10 }, (_, index) =>
        ndvi(2014 + index, 6, 0.3 + index / 100)
      ),
      AVAILABLE_THROUGH,
      -33.9
    );

    expect(comparison).toMatchObject({
      status: "insufficient-coverage",
      hemisphere: "southern",
      meteorologicalSeason: "winter",
      differenceFromBaseline: null,
      reason: "target-coverage-not-supplied",
      target: { coverage: { validFraction: null } },
    });
  });

  it("keeps pre-product months out and rejects a baseline window that reaches the target year", () => {
    const target = ndvi(2025, 2, 0.5, 0.9);
    const candidates = [
      ndvi(2000, 2, 0.1, 0.8),
      ndvi(2019, 2, 0.2, 0.8),
      ndvi(2020, 2, 0.3, 0.8),
      ndvi(2021, 2, 0.4, 0.8),
    ];
    const preProduct = compareMonthlyNdviToSeasonalBaseline(
      target,
      candidates,
      AVAILABLE_THROUGH,
      48.8,
      { minimumSamples: 3, baselineStartYear: 2000, baselineEndYear: 2024 }
    );
    const targetYearWindow = compareMonthlyNdviToSeasonalBaseline(
      target,
      candidates,
      AVAILABLE_THROUGH,
      48.8,
      { minimumSamples: 3, baselineStartYear: 2019, baselineEndYear: 2025 }
    );

    expect(preProduct).toMatchObject({
      status: "available",
      baseline: { sampleCount: 3 },
      exclusions: { outsideProductRange: 1 },
    });
    expect(targetYearWindow).toMatchObject({
      status: "invalid",
      differenceFromBaseline: null,
      reason: "invalid-baseline-configuration",
    });
  });

  it("keeps missing values, duplicate years, invalid values, and low coverage explicit", () => {
    const comparison = compareMonthlyNdviToSeasonalBaseline(
      ndvi(2025, 3, 0.5, 0.9),
      [
        ndvi(2019, 3, 0.2, 0.2),
        ndvi(2020, 3, 0.3, 0.2),
        ndvi(2021, 3, null, 0.8),
        ndvi(2022, 3, 1.2, 0.8),
        ndvi(2022, 3, 0.4, 0.8),
        ndvi(2023, 4, 0.6, 0.8),
      ],
      AVAILABLE_THROUGH,
      0,
      { minimumSamples: 3 }
    );

    expect(comparison).toMatchObject({
      status: "insufficient-samples",
      differenceFromBaseline: null,
      reason: "too-few-same-calendar-month-samples",
      baseline: { sampleCount: 0, requiredSampleCount: 3 },
      exclusions: {
        insufficientCoverage: 2,
        missing: 1,
        invalid: 1,
        duplicateYear: 1,
        wrongCalendarMonth: 1,
      },
    });
  });

  it("preserves unavailable and invalid source checkpoints without forecasts", () => {
    const preProduct = summarizeMonthlyNdvi(
      ndvi(2000, 2, 0.3, 0.8),
      AVAILABLE_THROUGH
    );
    const future = compareMonthlyNdviToSeasonalBaseline(
      ndvi(2026, 6, 0.4, 0.8),
      [ndvi(2020, 6, 0.2), ndvi(2021, 6, 0.3), ndvi(2022, 6, 0.4)],
      AVAILABLE_THROUGH,
      10,
      { minimumSamples: 3 }
    );
    const unsupportedCheckpoint = summarizeMonthlyNdvi(
      ndvi(2026, 5, 0.4, 0.8),
      { year: 2026, month: 6 }
    );

    expect(preProduct).toMatchObject({
      isForecast: false,
      publicationStatus: "outside-product-range",
      publicationLagMonths: null,
      observedValue: null,
    });
    expect(future).toMatchObject({
      isForecast: false,
      status: "unavailable",
      differenceFromBaseline: null,
      reason: "not-yet-published",
      target: { publicationStatus: "not-yet-published" },
    });
    expect(unsupportedCheckpoint).toMatchObject({
      isForecast: false,
      publicationStatus: "invalid-reference-month",
      coverage: { status: "available", validFraction: 0.8 },
      observedValue: null,
    });
  });
});
