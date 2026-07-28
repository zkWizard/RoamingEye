import { describe, expect, it } from "vitest";
import {
  MINIMUM_NDVI_SEASONAL_BASELINE_SAMPLES,
  MINIMUM_NDVI_SEASONAL_VALID_FRACTION,
  NDVI_METRIC,
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
  it("retains MOD13A3 provenance, units, data month, coverage, and a descriptive same-month difference", () => {
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
    expect(comparison.baseline.mean).toBeCloseTo(0.345);
    expect(comparison.differenceFromBaseline).toBeCloseTo(0.155);
    expect(comparison.samples.map((sample) => sample.month.month)).toEqual(
      Array(10).fill(8)
    );
    expect(comparison.baseline.sampleStandardDeviation).toBeGreaterThan(0);
    expect(comparison.baseline.standardErrorOfMean).toBeGreaterThan(0);
  });

  it("does not assume boundary coverage when the sampler did not provide it", () => {
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

  it("keeps insufficient baseline coverage, missing values, duplicates, and wrong months explicit", () => {
    const insufficientCoverage = compareMonthlyNdviToSeasonalBaseline(
      ndvi(2025, 3, 0.5, 0.9),
      [
        ...Array.from({ length: 10 }, (_, index) =>
          ndvi(2014 + index, 3, 0.2, 0.2)
        ),
        ndvi(2020, 4, 0.7),
      ],
      AVAILABLE_THROUGH,
      0,
      { minimumSamples: 3 }
    );
    const missing = compareMonthlyNdviToSeasonalBaseline(
      ndvi(2025, 3, null, 0.8),
      [ndvi(2020, 3, 0.2), ndvi(2021, 3, 0.3), ndvi(2021, 3, 0.4)],
      AVAILABLE_THROUGH,
      0,
      { minimumSamples: 3 }
    );

    expect(insufficientCoverage).toMatchObject({
      status: "insufficient-coverage",
      reason: "baseline-coverage-below-threshold",
      baseline: { sampleCount: 0, requiredSampleCount: 3 },
      exclusions: { insufficientCoverage: 10, wrongCalendarMonth: 1 },
    });
    expect(missing).toMatchObject({
      status: "no-data",
      differenceFromBaseline: null,
      reason: "missing-value",
      exclusions: { duplicateYear: 2 },
      target: { coverage: { status: "no-data", validFraction: 0.8 } },
    });
  });

  it("withholds every record from a duplicated year regardless of input order", () => {
    const uniqueYears = [
      ndvi(2019, 7, 0.31),
      ndvi(2020, 7, 0.36),
      ndvi(2021, 7, 0.42),
    ];
    const duplicateA = ndvi(2022, 7, 0.1);
    const duplicateB = ndvi(2022, 7, 0.9);
    const compare = (candidates: NdviMonthlyObservation[]) =>
      compareMonthlyNdviToSeasonalBaseline(
        ndvi(2025, 7, 0.5),
        candidates,
        AVAILABLE_THROUGH,
        45,
        { minimumSamples: 3 }
      );

    const forward = compare([...uniqueYears, duplicateA, duplicateB]);
    const reversed = compare([...uniqueYears, duplicateB, duplicateA]);

    expect(forward).toMatchObject({
      status: "available",
      exclusions: { duplicateYear: 2 },
      baseline: { sampleCount: 3 },
      bounds: { calendarMonth: 7, endYear: 2024 },
    });
    expect(forward.samples.map((sample) => sample.month.year)).toEqual([
      2019, 2020, 2021,
    ]);
    expect(forward.baseline).toEqual(reversed.baseline);
    expect(forward.differenceFromBaseline).toBe(
      reversed.differenceFromBaseline
    );
  });

  it("reports insufficient samples when duplicate-year ambiguity removes the apparent floor", () => {
    const comparison = compareMonthlyNdviToSeasonalBaseline(
      ndvi(2025, 7, 0.5),
      [
        ndvi(2020, 7, 0.3),
        ndvi(2021, 7, 0.4),
        ndvi(2022, 7, 0.1),
        ndvi(2022, 7, 0.9),
      ],
      AVAILABLE_THROUGH,
      45,
      { minimumSamples: 3 }
    );

    expect(comparison).toMatchObject({
      status: "insufficient-samples",
      reason: "too-few-same-calendar-month-samples",
      differenceFromBaseline: null,
      exclusions: { duplicateYear: 2 },
      baseline: { sampleCount: 2, requiredSampleCount: 3 },
    });
  });

  it("retains outside-range and not-yet-published states without turning them into forecasts", () => {
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
    const unsupportedAvailabilityCheckpoint = summarizeMonthlyNdvi(
      ndvi(2026, 5, 0.4, 0.8),
      { year: 2026, month: 6 }
    );

    expect(preProduct).toMatchObject({
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
    expect(unsupportedAvailabilityCheckpoint).toMatchObject({
      isForecast: false,
      publicationStatus: "invalid-reference-month",
      coverage: { status: "available", validFraction: 0.8 },
      observedValue: null,
    });
  });
});
