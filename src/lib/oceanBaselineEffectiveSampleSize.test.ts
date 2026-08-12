import { describe, expect, it } from "vitest";
import { SEA_SURFACE_TEMPERATURE_METRIC } from "./oceanConditions";
import type { SeaSurfaceTemperatureObservation } from "./oceanConditions";
import { compareSstToSeasonalBaseline } from "./oceanSeasonalBaseline";
import {
  assessSstBaselineEffectiveSampleSize,
  describeSstBaselineEffectiveSampleSize,
  MINIMUM_ADJACENT_YEAR_PAIRS_FOR_LAG1,
} from "./oceanBaselineEffectiveSampleSize";

function august(
  year: number,
  value: number,
  validFraction = 0.95
): SeaSurfaceTemperatureObservation {
  return {
    dataMonth: { year, month: 8 },
    value,
    validFraction,
    footprint: "water",
  };
}

/** Twelve consecutive Augusts warming 0.4 °C a year: strongly persistent. */
function warmingAugusts(startYear: number): SeaSurfaceTemperatureObservation[] {
  return Array.from({ length: 12 }, (_unused, index) =>
    august(startYear + index, 18 + 0.4 * index)
  );
}

/** Twelve consecutive Augusts alternating 19/21 °C: strongly anti-persistent. */
function alternatingAugusts(
  startYear: number
): SeaSurfaceTemperatureObservation[] {
  return Array.from({ length: 12 }, (_unused, index) =>
    august(startYear + index, index % 2 === 0 ? 19 : 21)
  );
}

describe("SST baseline effective sample size", () => {
  it("charges a persistent record for the independence it does not have", () => {
    // Deviations from the mean form an arithmetic ramp, so the lag-1
    // autocorrelation is exactly 0.75 and n_eff is exactly 12 * 0.25 / 1.75.
    const comparison = compareSstToSeasonalBaseline(
      august(2022, 23),
      warmingAugusts(2010)
    );
    expect(comparison.status).toBe("available");

    const assessment = assessSstBaselineEffectiveSampleSize(comparison);

    expect(assessment).toMatchObject({
      kind: "sst-baseline-effective-sample-size",
      isForecast: false,
      claimScope: "descriptive-sea-surface-temperature-only",
      status: "available",
      metric: SEA_SURFACE_TEMPERATURE_METRIC,
      calendarMonth: 8,
      footprint: "water",
      sampleCount: 12,
      adjacentYearPairCount: 11,
      omittedYearsWithinSpan: 0,
      standardErrorUnit: "°C",
      reason: null,
    });
    expect(assessment.lag1Autocorrelation).toBeCloseTo(0.75, 12);
    expect(assessment.effectiveSampleCount).toBeCloseTo(12 / 7, 12);
    expect(assessment.independenceRatio).toBeCloseTo(1 / 7, 12);
    // sqrt(12 / (12/7)) === sqrt(7): the naive standard error was 2.6x too tight.
    expect(assessment.uncertaintyInflationFactor).toBeCloseTo(Math.sqrt(7), 12);
    expect(assessment.lag1DistinguishableFromZero).toBe(true);
  });

  it("echoes the baseline's own spread and naive standard error unchanged", () => {
    const comparison = compareSstToSeasonalBaseline(
      august(2022, 23),
      warmingAugusts(2010)
    );

    const assessment = assessSstBaselineEffectiveSampleSize(comparison);

    expect(assessment.sampleStandardDeviation).toBe(
      comparison.baseline.sampleStandardDeviation
    );
    expect(assessment.naiveStandardErrorOfMean).toBeCloseTo(
      comparison.baseline.standardErrorOfMean as number,
      12
    );
    // The correction only ever widens the interval, never narrows it.
    expect(assessment.effectiveStandardErrorOfMean as number).toBeGreaterThan(
      assessment.naiveStandardErrorOfMean as number
    );
    expect(assessment.effectiveStandardErrorOfMean).toBeCloseTo(
      (assessment.naiveStandardErrorOfMean as number) * Math.sqrt(7),
      12
    );
  });

  it("never credits a negative autocorrelation with extra independence", () => {
    const comparison = compareSstToSeasonalBaseline(
      august(2022, 23),
      alternatingAugusts(2010)
    );

    const assessment = assessSstBaselineEffectiveSampleSize(comparison);

    expect(assessment.status).toBe("available");
    expect(assessment.lag1Autocorrelation).toBeCloseTo(-11 / 12, 12);
    // n_eff is capped at n rather than the 12 * (1.9167 / 0.0833) the formula
    // would give: a short record's negative estimate is noise, not information.
    expect(assessment.effectiveSampleCount).toBe(12);
    expect(assessment.independenceRatio).toBe(1);
    expect(assessment.uncertaintyInflationFactor).toBe(1);
    expect(assessment.effectiveStandardErrorOfMean).toBe(
      assessment.naiveStandardErrorOfMean
    );
  });

  it("estimates the lag only across calendar-adjacent years", () => {
    // Four consecutive years then a gapped tail: 3 adjacent pairs, not 9.
    const candidates = [
      august(2010, 19),
      august(2011, 19.6),
      august(2012, 20.2),
      august(2013, 20.8),
      august(2016, 21),
      august(2018, 21.4),
      august(2020, 21.2),
      august(2022, 21.8),
      august(2024, 22),
      august(2026, 22.4),
    ];

    const assessment = assessSstBaselineEffectiveSampleSize(
      compareSstToSeasonalBaseline(august(2027, 23), candidates)
    );

    expect(assessment.status).toBe("available");
    expect(assessment.sampleCount).toBe(10);
    expect(assessment.adjacentYearPairCount).toBe(3);
    // 2010-2026 spans 17 year slots and 10 carry a sample.
    expect(assessment.omittedYearsWithinSpan).toBe(7);
  });

  it("declines when too few adjacent pairs remain to estimate persistence", () => {
    const evenYearsOnly = Array.from({ length: 10 }, (_unused, index) =>
      august(2000 + index * 2, 20 + index * 0.3)
    );

    const assessment = assessSstBaselineEffectiveSampleSize(
      compareSstToSeasonalBaseline(august(2021, 23), evenYearsOnly)
    );

    expect(assessment).toMatchObject({
      status: "insufficient-adjacent-pairs",
      adjacentYearPairCount: 0,
      omittedYearsWithinSpan: 9,
      lag1Autocorrelation: null,
      effectiveSampleCount: null,
      uncertaintyInflationFactor: null,
      reason: "too-few-calendar-adjacent-year-pairs",
    });
    expect(MINIMUM_ADJACENT_YEAR_PAIRS_FOR_LAG1).toBe(3);
  });

  it("declines when every retained year holds the same value", () => {
    const flat = Array.from({ length: 12 }, (_unused, index) =>
      august(2010 + index, 20)
    );

    const assessment = assessSstBaselineEffectiveSampleSize(
      compareSstToSeasonalBaseline(august(2022, 23), flat)
    );

    expect(assessment).toMatchObject({
      status: "insufficient-variance",
      adjacentYearPairCount: 11,
      lag1Autocorrelation: null,
      naiveStandardErrorOfMean: null,
      reason: "zero-baseline-variance",
    });
  });

  it("declines when the baseline itself produced no mean", () => {
    const tooFew = [august(2019, 20), august(2020, 20.5), august(2021, 21)];
    const comparison = compareSstToSeasonalBaseline(august(2022, 23), tooFew);
    expect(comparison.status).toBe("insufficient-samples");

    const assessment = assessSstBaselineEffectiveSampleSize(comparison);

    expect(assessment).toMatchObject({
      status: "baseline-unavailable",
      reason: "baseline-unavailable",
      effectiveSampleCount: null,
      // The pair count still describes what was retained, which is why the
      // baseline fell short.
      adjacentYearPairCount: 2,
    });
  });

  it("flags a lag-1 estimate that does not clear its own sampling noise", () => {
    // A near-flat record with one small wobble: |r1| stays inside 2/sqrt(n).
    const candidates = Array.from({ length: 12 }, (_unused, index) =>
      august(2010 + index, index === 5 ? 20.4 : 20)
    );

    const assessment = assessSstBaselineEffectiveSampleSize(
      compareSstToSeasonalBaseline(august(2022, 23), candidates)
    );

    expect(assessment.status).toBe("available");
    expect(assessment.lag1StandardError).toBeCloseTo(1 / Math.sqrt(12), 12);
    expect(Math.abs(assessment.lag1Autocorrelation as number)).toBeLessThan(
      2 * (assessment.lag1StandardError as number)
    );
    expect(assessment.lag1DistinguishableFromZero).toBe(false);
    expect(describeSstBaselineEffectiveSampleSize(assessment)).toContain(
      "indicative rather than measured"
    );
  });

  it("describes an available correction with provenance and no biology", () => {
    const sentence = describeSstBaselineEffectiveSampleSize(
      assessSstBaselineEffectiveSampleSize(
        compareSstToSeasonalBaseline(august(2022, 23), warmingAugusts(2010))
      )
    );

    expect(sentence).toContain("lag-1 autocorrelation across 11");
    expect(sentence).toContain("0.75");
    expect(sentence).toContain("about 1.7 independent years of 12");
    expect(sentence).toContain("°C");
    expect(sentence).toContain(
      `Source: ${SEA_SURFACE_TEMPERATURE_METRIC.source.shortName} v${SEA_SURFACE_TEMPERATURE_METRIC.source.version}.`
    );
    expect(sentence).toContain("not a marine-biology");
    expect(sentence).not.toMatch(/heatwave|bleach|habitat|species|stress/i);
  });

  it("says plainly when no correction could be made", () => {
    const declined = describeSstBaselineEffectiveSampleSize(
      assessSstBaselineEffectiveSampleSize(
        compareSstToSeasonalBaseline(august(2022, 23), [august(2021, 20)])
      )
    );
    expect(declined).toContain("no standard error to correct");
    expect(declined).toContain("not a marine-biology");

    const flat = describeSstBaselineEffectiveSampleSize(
      assessSstBaselineEffectiveSampleSize(
        compareSstToSeasonalBaseline(
          august(2022, 23),
          Array.from({ length: 12 }, (_unused, index) =>
            august(2010 + index, 20)
          )
        )
      )
    );
    expect(flat).toContain("already carries no sampling spread");
  });

  it("reports the naive standard error standing when nothing was lost", () => {
    const sentence = describeSstBaselineEffectiveSampleSize(
      assessSstBaselineEffectiveSampleSize(
        compareSstToSeasonalBaseline(august(2022, 23), alternatingAugusts(2010))
      )
    );

    expect(sentence).toContain(
      "no year-to-year persistence was credited, so the baseline's standard error stands"
    );
  });

  it("is independent of the order the baseline samples arrive in", () => {
    const ascending = compareSstToSeasonalBaseline(
      august(2022, 23),
      warmingAugusts(2010)
    );
    const shuffled = {
      ...ascending,
      samples: [...ascending.samples].reverse(),
    };

    expect(assessSstBaselineEffectiveSampleSize(shuffled)).toEqual(
      assessSstBaselineEffectiveSampleSize(ascending)
    );
  });
});
