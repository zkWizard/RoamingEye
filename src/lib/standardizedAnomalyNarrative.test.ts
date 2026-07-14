import { describe, expect, it } from "vitest";
import { compareMonthlyClimateToSeasonalBaseline } from "./seasonalBaseline";
import { standardizeSeasonalAnomaly } from "./seasonalAnomalyContext";
import { describeStandardizedAnomaly } from "./standardizedAnomalyNarrative";
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

function baselineYears(
  values: readonly number[],
  month = 6,
  validFraction = 0.9
): MonthlyClimateObservation[] {
  return values.map((value, index) =>
    airtemp(2010 + index, month, value, validFraction)
  );
}

/** Standardize a June air-temperature probe against a ten-year baseline. */
function standardize(
  target: number,
  baseline: readonly number[],
  availableThrough: YearMonth = AVAILABLE_THROUGH
) {
  const comparison = compareMonthlyClimateToSeasonalBaseline(
    airtemp(2023, 6, target),
    baselineYears(baseline),
    availableThrough,
    { minimumSamples: 10 }
  );
  return standardizeSeasonalAnomaly(comparison);
}

describe("describeStandardizedAnomaly", () => {
  it("narrates an available above-average departure with its band and provenance", () => {
    const anomaly = standardize(
      293,
      [287, 288, 289, 290, 290, 290, 291, 292, 293, 290]
    );
    expect(anomaly.status).toBe("available");

    const narrative = describeStandardizedAnomaly(anomaly);
    expect(narrative).toMatchObject({
      kind: "standardized-seasonal-anomaly-narrative",
      isForecast: false,
      available: true,
    });
    expect(narrative.headline).toContain("2 m air temperature");
    expect(narrative.headline).toContain("above");
    expect(narrative.headline).toContain("baseline standard deviation");
    // +3 K against ~1.8 K spread lands in the middle band.
    expect(narrative.detail).toContain("1 ≤ |z| < 2");
    expect(narrative.detail).toContain("not a probability");
    // Provenance is carried through, not dropped.
    expect(narrative.provenance.metricLabel).toBe("2 m air temperature");
    expect(narrative.provenance.nativeUnit).toBe("K");
    expect(narrative.provenance.baselineSampleCount).toBe(10);
    expect(narrative.provenance.sourceLabel).toContain("MERRA-2");
    expect(narrative.provenance.sourceUrl).toBe(
      `https://doi.org/${anomaly.source.doi}`
    );
    expect(narrative.limitations.length).toBeGreaterThan(0);
  });

  it("reports a match when the target equals the baseline mean", () => {
    const anomaly = standardize(
      290,
      [288, 289, 290, 291, 292, 288, 289, 290, 291, 292]
    );
    expect(anomaly.direction).toBe("at");

    const narrative = describeStandardizedAnomaly(anomaly);
    expect(narrative.available).toBe(true);
    expect(narrative.headline).toContain("matched the same-calendar-month");
    expect(narrative.headline).not.toContain("standard deviation");
  });

  it("states a tiny departure qualitatively rather than as 0.0 standard deviations", () => {
    // Ten Junes with a wide spread; a +0.02 K probe is a negligible fraction of
    // a standard deviation and must not read as "0.0 standard deviations above".
    const anomaly = standardize(
      289.02,
      [285, 287, 289, 291, 293, 285, 287, 289, 291, 293]
    );
    expect(anomaly.status).toBe("available");
    expect(anomaly.direction).toBe("above");
    expect(Math.abs(anomaly.standardizedAnomaly!)).toBeLessThan(0.05);

    const narrative = describeStandardizedAnomaly(anomaly);
    expect(narrative.headline).toContain("marginally above");
    expect(narrative.headline).not.toContain("0.0");
  });

  it("explains a flat-baseline withholding and still echoes the raw departure", () => {
    const anomaly = standardize(
      292,
      [290, 290, 290, 290, 290, 290, 290, 290, 290, 290]
    );
    expect(anomaly.status).toBe("unavailable");
    expect(anomaly.reason).toBe("no-baseline-variability");

    const narrative = describeStandardizedAnomaly(anomaly);
    expect(narrative.available).toBe(false);
    expect(narrative.headline).toBe(
      "A standardized same-calendar-month anomaly is not available"
    );
    expect(narrative.detail).toContain("no year-to-year variability");
    // The retained raw anomaly (+2 K) is surfaced for reference.
    expect(narrative.detail).toContain("+2 K");
    // Provenance survives a withheld case.
    expect(narrative.provenance.baselineSampleCount).toBe(10);
  });

  it("explains a too-few-samples withholding without inventing a number", () => {
    const comparison = compareMonthlyClimateToSeasonalBaseline(
      airtemp(2023, 6, 291),
      baselineYears([289, 290]),
      AVAILABLE_THROUGH,
      { minimumSamples: 3 }
    );
    const anomaly = standardizeSeasonalAnomaly(comparison);
    expect(anomaly.reason).toBe("too-few-same-calendar-month-samples");

    const narrative = describeStandardizedAnomaly(anomaly);
    expect(narrative.available).toBe(false);
    expect(narrative.detail).toContain("too few same-calendar-month");
    expect(narrative.detail).not.toMatch(/[+-]?\d+(\.\d+)?\s*K/);
  });

  it("explains a not-yet-published target month", () => {
    const comparison = compareMonthlyClimateToSeasonalBaseline(
      airtemp(2024, 6, 291),
      baselineYears([287, 288, 289, 290, 291, 292, 293, 294, 289, 290]),
      AVAILABLE_THROUGH,
      { minimumSamples: 10 }
    );
    const anomaly = standardizeSeasonalAnomaly(comparison);
    const narrative = describeStandardizedAnomaly(anomaly);
    expect(narrative.available).toBe(false);
    expect(narrative.detail).toContain("has not yet been published");
  });

  it("classifies a well-beyond departure in the narrative band text", () => {
    const anomaly = standardize(
      285,
      [289.5, 290, 290, 290, 290, 290, 290, 290, 290, 290.5]
    );
    expect(anomaly.magnitudeBand).toBe("well-beyond-typical-spread");

    const narrative = describeStandardizedAnomaly(anomaly);
    expect(narrative.headline).toContain("below");
    expect(narrative.detail).toContain("|z| ≥ 2");
  });
});
