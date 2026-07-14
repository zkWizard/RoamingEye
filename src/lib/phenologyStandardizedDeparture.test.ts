import { describe, expect, it } from "vitest";
import { compareMonthlyNdviToSeasonalBaseline } from "./phenologyBaseline";
import { standardizeNdviSeasonalDeparture } from "./phenologyStandardizedDeparture";
import type { NdviMonthlyObservation } from "./phenology";
import type { YearMonth } from "./timeline";

const AVAILABLE_THROUGH: YearMonth = { year: 2024, month: 1 };
/** A northern-hemisphere latitude; only the calendar-season label depends on it. */
const LATITUDE = 45;

function ndvi(
  year: number,
  month: number,
  value: number | null,
  validFraction = 0.9
): NdviMonthlyObservation {
  return { month: { year, month }, ndvi: value, validFraction };
}

/** Ten same-calendar-month years (2010..2019) carrying the supplied values. */
function baselineYears(
  values: readonly number[],
  month = 6,
  validFraction = 0.9
): NdviMonthlyObservation[] {
  return values.map((value, index) =>
    ndvi(2010 + index, month, value, validFraction)
  );
}

describe("standardizeNdviSeasonalDeparture", () => {
  it("expresses the difference in multiples of the baseline sample standard deviation", () => {
    // Baseline: ten Junes, mean 0.50, a modest same-month spread.
    const values = [0.47, 0.48, 0.49, 0.5, 0.5, 0.5, 0.51, 0.52, 0.53, 0.5];
    const comparison = compareMonthlyNdviToSeasonalBaseline(
      ndvi(2023, 6, 0.53), // +0.03 above the baseline mean
      baselineYears(values),
      AVAILABLE_THROUGH,
      LATITUDE,
      { minimumSamples: 10 }
    );

    expect(comparison.status).toBe("available");
    const sd = comparison.baseline.sampleStandardDeviation!;
    const result = standardizeNdviSeasonalDeparture(comparison);

    expect(result).toMatchObject({
      kind: "standardized-ndvi-seasonal-departure",
      isForecast: false,
      status: "available",
      direction: "above",
      differenceUnit: "NDVI (unitless)",
      baselineSampleCount: 10,
      reason: null,
    });
    // Provenance travels with the standardized value.
    expect(result.source).toBe(comparison.metric.source);
    expect(result.baselineStandardDeviation).toBeCloseTo(sd, 12);
    expect(result.standardizedDeparture).toBeCloseTo(
      comparison.differenceFromBaseline! / sd,
      12
    );
    // +0.03 against ~0.018 spread lands beyond one but within two SD.
    expect(result.magnitudeBand).toBe("beyond-typical-spread");
  });

  it("classifies a small departure as within the typical year-to-year spread", () => {
    const values = [0.05, 0.07, 0.09, 0.11, 0.13, 0.05, 0.07, 0.09, 0.11, 0.13];
    const comparison = compareMonthlyNdviToSeasonalBaseline(
      ndvi(2023, 6, 0.095), // baseline mean is 0.09; +0.005 is a fraction of a SD
      baselineYears(values),
      AVAILABLE_THROUGH,
      LATITUDE,
      { minimumSamples: 10 }
    );

    const result = standardizeNdviSeasonalDeparture(comparison);
    expect(result.status).toBe("available");
    expect(result.direction).toBe("above");
    expect(Math.abs(result.standardizedDeparture!)).toBeLessThan(1);
    expect(result.magnitudeBand).toBe("within-typical-spread");
  });

  it("classifies a large negative departure as well beyond the typical spread", () => {
    const values = [0.495, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.505];
    const comparison = compareMonthlyNdviToSeasonalBaseline(
      ndvi(2023, 6, 0.45), // far below a very tight baseline
      baselineYears(values),
      AVAILABLE_THROUGH,
      LATITUDE,
      { minimumSamples: 10 }
    );

    const result = standardizeNdviSeasonalDeparture(comparison);
    expect(result.status).toBe("available");
    expect(result.direction).toBe("below");
    expect(result.standardizedDeparture!).toBeLessThan(-2);
    expect(result.magnitudeBand).toBe("well-beyond-typical-spread");
  });

  it("reports 'at' with a zero standardized value when the target equals the baseline mean", () => {
    const values = [0.48, 0.49, 0.5, 0.51, 0.52, 0.48, 0.49, 0.5, 0.51, 0.52];
    // Mean of the ten values is 0.50; probe exactly at the mean.
    const comparison = compareMonthlyNdviToSeasonalBaseline(
      ndvi(2023, 6, 0.5),
      baselineYears(values),
      AVAILABLE_THROUGH,
      LATITUDE,
      { minimumSamples: 10 }
    );

    const result = standardizeNdviSeasonalDeparture(comparison);
    expect(comparison.differenceFromBaseline).toBeCloseTo(0, 12);
    expect(result.status).toBe("available");
    expect(result.direction).toBe("at");
    expect(result.standardizedDeparture).toBeCloseTo(0, 12);
    expect(result.magnitudeBand).toBe("within-typical-spread");
  });

  it("withholds when the baseline has too few samples to form a standard deviation", () => {
    // Only two same-calendar-month years => insufficient samples for the
    // comparison itself; no difference, so nothing to standardize.
    const comparison = compareMonthlyNdviToSeasonalBaseline(
      ndvi(2023, 6, 0.51),
      baselineYears([0.49, 0.5]),
      AVAILABLE_THROUGH,
      LATITUDE,
      { minimumSamples: 3 }
    );

    expect(comparison.status).toBe("insufficient-samples");
    const result = standardizeNdviSeasonalDeparture(comparison);
    expect(result).toMatchObject({
      status: "unavailable",
      standardizedDeparture: null,
      magnitudeBand: null,
      direction: null,
      differenceFromBaseline: null,
      reason: "too-few-same-calendar-month-samples",
    });
    // The cited source is retained even when withholding.
    expect(result.source).toBe(comparison.metric.source);
    expect(result.baselineSampleCount).toBe(2);
  });

  it("withholds without dividing by zero when the baseline has no variability", () => {
    // A flat baseline: usable difference, but a zero sample standard deviation.
    const comparison = compareMonthlyNdviToSeasonalBaseline(
      ndvi(2023, 6, 0.52),
      baselineYears([0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5]),
      AVAILABLE_THROUGH,
      LATITUDE,
      { minimumSamples: 10 }
    );

    expect(comparison.status).toBe("available");
    expect(comparison.baseline.sampleStandardDeviation).toBe(0);
    const result = standardizeNdviSeasonalDeparture(comparison);
    expect(result).toMatchObject({
      status: "unavailable",
      standardizedDeparture: null,
      magnitudeBand: null,
      reason: "no-baseline-variability",
    });
    // The raw difference is still echoed for auditability.
    expect(result.differenceFromBaseline).toBeCloseTo(0.02, 12);
    expect(result.baselineStandardDeviation).toBe(0);
  });

  it("withholds when the underlying comparison is unavailable", () => {
    // Target month is later than the caller-confirmed availability checkpoint.
    const comparison = compareMonthlyNdviToSeasonalBaseline(
      ndvi(2024, 6, 0.51),
      baselineYears([0.44, 0.46, 0.48, 0.5, 0.52, 0.54, 0.56, 0.48, 0.5, 0.52]),
      AVAILABLE_THROUGH,
      LATITUDE,
      { minimumSamples: 10 }
    );

    expect(comparison.status).not.toBe("available");
    const result = standardizeNdviSeasonalDeparture(comparison);
    expect(result.status).toBe("unavailable");
    expect(result.standardizedDeparture).toBeNull();
    expect(result.reason).toBe(comparison.reason);
  });
});
