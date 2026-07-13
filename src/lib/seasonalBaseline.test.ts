import { describe, expect, it } from "vitest";
import {
  MINIMUM_SEASONAL_BASELINE_SAMPLES,
  MINIMUM_SEASONAL_VALID_FRACTION,
  compareMonthlyClimateToSeasonalBaseline,
} from "./seasonalBaseline";
import type { MonthlyClimateObservation } from "./climate";
import type { YearMonth } from "./timeline";

const AVAILABLE_THROUGH: YearMonth = { year: 2024, month: 1 };

function precip(
  year: number,
  month: number,
  value: number | null,
  validFraction = 0.8
): MonthlyClimateObservation {
  return {
    metricId: "precipitation-rate",
    dataMonth: { year, month },
    value,
    validFraction,
  };
}

describe("seasonal climate baseline comparisons", () => {
  it("reports a same-calendar-month anomaly with native units, source, publication lag, and uncertainty", () => {
    const baseline = Array.from({ length: 10 }, (_, index) =>
      precip(2013 + index, 8, 0.001 + index * 0.0001, 0.65 + index * 0.01)
    );

    const comparison = compareMonthlyClimateToSeasonalBaseline(
      precip(2023, 8, 0.002, 0.9),
      [
        precip(2012, 8, 0.5),
        ...baseline,
        precip(2020, 7, 0.9),
        {
          metricId: "air-temperature-2m",
          dataMonth: { year: 2020, month: 8 },
          value: 290,
          validFraction: 0.9,
        },
      ],
      AVAILABLE_THROUGH,
      { baselineStartYear: 2013, baselineEndYear: 2022 }
    );

    expect(comparison).toMatchObject({
      kind: "same-calendar-month-climate-baseline",
      isForecast: false,
      status: "available",
      metric: {
        nativeUnit: "kg/m²/s",
        source: expect.objectContaining({ shortName: "GLDAS_NOAH025_M" }),
      },
      target: {
        dataMonth: { year: 2023, month: 8 },
        availableThrough: AVAILABLE_THROUGH,
        publicationStatus: "published",
        publicationLagMonths: 5,
        observedValue: 0.002,
      },
      bounds: { startYear: 2013, endYear: 2022, calendarMonth: 8 },
      baseline: {
        sampleCount: MINIMUM_SEASONAL_BASELINE_SAMPLES,
        requiredSampleCount: MINIMUM_SEASONAL_BASELINE_SAMPLES,
        min: 0.001,
        minimumValidFraction: 0.65,
        requiredValidFraction: MINIMUM_SEASONAL_VALID_FRACTION,
      },
      exclusions: {
        outOfBounds: 1,
        wrongCalendarMonth: 1,
        wrongMetric: 1,
      },
      anomalyUnit: "kg/m²/s",
      reason: null,
    });
    expect(comparison.baseline.mean).toBeCloseTo(0.00145);
    expect(comparison.baseline.max).toBeCloseTo(0.0019);
    expect(comparison.anomaly).toBeCloseTo(0.00055);
    expect(comparison.samples.map((sample) => sample.month.month)).toEqual(
      Array(10).fill(8)
    );
    expect(comparison.baseline.sampleStandardDeviation).toBeGreaterThan(0);
    expect(comparison.baseline.standardErrorOfMean).toBeGreaterThan(0);
  });

  it("requires enough covered same-calendar-month samples before reporting an anomaly", () => {
    const lowCoverageBaseline: MonthlyClimateObservation[] = Array.from(
      { length: 10 },
      (_, index) => ({
        metricId: "precipitation-rate",
        dataMonth: { year: 2010 + index, month: 1 },
        value: index + 1,
      })
    );

    const comparison = compareMonthlyClimateToSeasonalBaseline(
      precip(2020, 1, 11, 0.9),
      lowCoverageBaseline,
      AVAILABLE_THROUGH,
      { minimumSamples: 3 }
    );

    expect(comparison).toMatchObject({
      status: "insufficient-coverage",
      anomaly: null,
      reason: "baseline-coverage-below-threshold",
      baseline: {
        sampleCount: 0,
        requiredSampleCount: 3,
        minimumValidFraction: null,
      },
      exclusions: { insufficientCoverage: 10 },
    });
  });

  it("keeps sparse baselines, no-data targets, and duplicate years explicit", () => {
    const sparse = compareMonthlyClimateToSeasonalBaseline(
      precip(2023, 3, 3, 0.8),
      [
        precip(2019, 3, 1, 0.8),
        precip(2020, 3, 2, 0.8),
        precip(2020, 3, 4, 0.8),
        precip(2021, 4, 5, 0.8),
      ],
      AVAILABLE_THROUGH,
      { minimumSamples: 3 }
    );
    const missingTarget = compareMonthlyClimateToSeasonalBaseline(
      precip(2023, 3, null, 0.8),
      [
        precip(2019, 3, 1, 0.8),
        precip(2020, 3, 2, 0.8),
        precip(2021, 3, 3, 0.8),
      ],
      AVAILABLE_THROUGH,
      { minimumSamples: 3 }
    );

    expect(sparse).toMatchObject({
      status: "insufficient-samples",
      anomaly: null,
      reason: "too-few-same-calendar-month-samples",
      baseline: { sampleCount: 2 },
      exclusions: { duplicateYear: 1, wrongCalendarMonth: 1 },
    });
    expect(missingTarget).toMatchObject({
      status: "no-data",
      anomaly: null,
      reason: "missing-value",
      target: {
        coverage: { status: "no-data", validFraction: 0.8 },
        observedValue: null,
      },
    });
  });

  it("retains publication status without converting future source gaps into forecasts", () => {
    const comparison = compareMonthlyClimateToSeasonalBaseline(
      precip(2024, 3, 3, 0.8),
      [
        precip(2020, 3, 1, 0.8),
        precip(2021, 3, 2, 0.8),
        precip(2022, 3, 3, 0.8),
        precip(2025, 3, 99, 0.8),
      ],
      AVAILABLE_THROUGH,
      { minimumSamples: 3 }
    );

    expect(comparison).toMatchObject({
      isForecast: false,
      target: {
        publicationStatus: "not-yet-published",
        publicationLagMonths: null,
      },
      exclusions: { outOfBounds: 1 },
      status: "available",
      anomaly: 1,
    });
  });
});
