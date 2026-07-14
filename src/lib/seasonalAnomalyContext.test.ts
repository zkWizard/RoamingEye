import { describe, expect, it } from "vitest";
import { compareMonthlyClimateToSeasonalBaseline } from "./seasonalBaseline";
import { standardizeSeasonalAnomaly } from "./seasonalAnomalyContext";
import type { MonthlyClimateObservation } from "./climate";
import type { YearMonth } from "./timeline";

const AVAILABLE_THROUGH: YearMonth = { year: 2024, month: 1 };

function airtemp(
  year: number,
  month: number,
  value: number | null,
  validFraction = 0.9
): MonthlyClimateObservation {
  return {
    metricId: "air-temperature-2m",
    dataMonth: { year, month },
    value,
    validFraction,
  };
}

/** Ten same-calendar-month years centred on `mean` with a known spread. */
function baselineYears(
  values: readonly number[],
  month = 6,
  validFraction = 0.9
): MonthlyClimateObservation[] {
  return values.map((value, index) =>
    airtemp(2010 + index, month, value, validFraction)
  );
}

describe("standardizeSeasonalAnomaly", () => {
  it("expresses the anomaly in multiples of the baseline sample standard deviation", () => {
    // Baseline: ten Junes, mean 290 K, sample SD computed from the values.
    const values = [287, 288, 289, 290, 290, 290, 291, 292, 293, 290];
    const comparison = compareMonthlyClimateToSeasonalBaseline(
      airtemp(2023, 6, 293), // 3 K above the baseline mean
      baselineYears(values),
      AVAILABLE_THROUGH,
      { minimumSamples: 10 }
    );

    expect(comparison.status).toBe("available");
    const sd = comparison.baseline.sampleStandardDeviation!;
    const result = standardizeSeasonalAnomaly(comparison);

    expect(result).toMatchObject({
      kind: "standardized-seasonal-climate-anomaly",
      isForecast: false,
      status: "available",
      direction: "above",
      anomalyUnit: "K",
      baselineSampleCount: 10,
      reason: null,
    });
    // Provenance travels with the standardized value.
    expect(result.source).toBe(comparison.metric.source);
    expect(result.baselineStandardDeviation).toBeCloseTo(sd, 10);
    expect(result.standardizedAnomaly).toBeCloseTo(
      comparison.anomaly! / sd,
      10
    );
    // A +3 K anomaly against ~1.8 K spread lands beyond one but within two SD.
    expect(result.magnitudeBand).toBe("beyond-typical-spread");
  });

  it("classifies a small departure as within the typical year-to-year spread", () => {
    const values = [285, 287, 289, 291, 293, 285, 287, 289, 291, 293];
    const comparison = compareMonthlyClimateToSeasonalBaseline(
      airtemp(2023, 6, 289.5), // baseline mean is 289; +0.5 K is a fraction of a SD
      baselineYears(values),
      AVAILABLE_THROUGH,
      { minimumSamples: 10 }
    );

    const result = standardizeSeasonalAnomaly(comparison);
    expect(result.status).toBe("available");
    expect(result.direction).toBe("above");
    expect(Math.abs(result.standardizedAnomaly!)).toBeLessThan(1);
    expect(result.magnitudeBand).toBe("within-typical-spread");
  });

  it("classifies a large negative departure as well beyond the typical spread", () => {
    const values = [289.5, 290, 290, 290, 290, 290, 290, 290, 290, 290.5];
    const comparison = compareMonthlyClimateToSeasonalBaseline(
      airtemp(2023, 6, 285), // ~5 K below a very tight baseline
      baselineYears(values),
      AVAILABLE_THROUGH,
      { minimumSamples: 10 }
    );

    const result = standardizeSeasonalAnomaly(comparison);
    expect(result.status).toBe("available");
    expect(result.direction).toBe("below");
    expect(result.standardizedAnomaly!).toBeLessThan(-2);
    expect(result.magnitudeBand).toBe("well-beyond-typical-spread");
  });

  it("reports 'at' with a zero standardized value when the target equals the baseline mean", () => {
    const values = [288, 289, 290, 291, 292, 288, 289, 290, 291, 292];
    // Mean of the ten values is 290; probe exactly at the mean.
    const comparison = compareMonthlyClimateToSeasonalBaseline(
      airtemp(2023, 6, 290),
      baselineYears(values),
      AVAILABLE_THROUGH,
      { minimumSamples: 10 }
    );

    const result = standardizeSeasonalAnomaly(comparison);
    expect(comparison.anomaly).toBeCloseTo(0, 10);
    expect(result.status).toBe("available");
    expect(result.direction).toBe("at");
    expect(result.standardizedAnomaly).toBeCloseTo(0, 10);
    expect(result.magnitudeBand).toBe("within-typical-spread");
  });

  it("withholds when the baseline has too few samples to form a standard deviation", () => {
    // Only two same-calendar-month years => insufficient samples for the
    // comparison itself; no anomaly, so nothing to standardize.
    const comparison = compareMonthlyClimateToSeasonalBaseline(
      airtemp(2023, 6, 291),
      baselineYears([289, 290]),
      AVAILABLE_THROUGH,
      { minimumSamples: 3 }
    );

    expect(comparison.status).toBe("insufficient-samples");
    const result = standardizeSeasonalAnomaly(comparison);
    expect(result).toMatchObject({
      status: "unavailable",
      standardizedAnomaly: null,
      magnitudeBand: null,
      direction: null,
      reason: "too-few-same-calendar-month-samples",
    });
    // The cited source is retained even when withholding.
    expect(result.source).toBe(comparison.metric.source);
  });

  it("withholds without dividing by zero when the baseline has no variability", () => {
    // A flat baseline: usable anomaly, but a zero sample standard deviation.
    const comparison = compareMonthlyClimateToSeasonalBaseline(
      airtemp(2023, 6, 292),
      baselineYears([290, 290, 290, 290, 290, 290, 290, 290, 290, 290]),
      AVAILABLE_THROUGH,
      { minimumSamples: 10 }
    );

    expect(comparison.status).toBe("available");
    expect(comparison.baseline.sampleStandardDeviation).toBe(0);
    const result = standardizeSeasonalAnomaly(comparison);
    expect(result).toMatchObject({
      status: "unavailable",
      standardizedAnomaly: null,
      magnitudeBand: null,
      reason: "no-baseline-variability",
    });
    // The raw anomaly is still echoed for auditability.
    expect(result.anomaly).toBeCloseTo(2, 10);
    expect(result.baselineStandardDeviation).toBe(0);
  });

  it("withholds when the underlying comparison is unavailable", () => {
    // Target month is not yet published relative to availability.
    const comparison = compareMonthlyClimateToSeasonalBaseline(
      airtemp(2024, 6, 291),
      baselineYears([287, 288, 289, 290, 291, 292, 293, 294, 289, 290]),
      AVAILABLE_THROUGH,
      { minimumSamples: 10 }
    );

    expect(comparison.status).not.toBe("available");
    const result = standardizeSeasonalAnomaly(comparison);
    expect(result.status).toBe("unavailable");
    expect(result.standardizedAnomaly).toBeNull();
    expect(result.reason).toBe(comparison.reason);
  });
});
