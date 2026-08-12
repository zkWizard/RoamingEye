import { describe, expect, it } from "vitest";
import { SEA_SURFACE_TEMPERATURE_METRIC } from "./oceanConditions";
import type { SeaSurfaceTemperatureObservation } from "./oceanConditions";
import {
  compareSstToSeasonalBaseline,
  type OceanSeasonalBaselineComparison,
  type UsableSstFootprint,
} from "./oceanSeasonalBaseline";
import {
  OCEAN_BASELINE_SELECTION_LIMITATIONS,
  SEAWATER_FREEZING_POINT_C,
  SEA_ICE_ADMISSIBLE_THRESHOLD_C,
  summarizeOceanBaselineSelection,
} from "./oceanBaselineSelectionBias";

const TARGET_YEAR = 2020;
const CALENDAR_MONTH = 9;

interface CandidateSpec {
  year: number;
  /** Null models a month with no usable SST at the baseline footprint. */
  value: number | null;
  validFraction?: number;
  footprint?: UsableSstFootprint | "land";
}

/**
 * Build a real comparison for the September of `TARGET_YEAR` from explicit
 * candidate years, so a test can drop specific years the way cloud or ice does.
 */
function comparisonFrom(
  targetValue: number,
  candidates: readonly CandidateSpec[],
  minimumSamples = 10
): OceanSeasonalBaselineComparison {
  const target: SeaSurfaceTemperatureObservation = {
    dataMonth: { year: TARGET_YEAR, month: CALENDAR_MONTH },
    value: targetValue,
    validFraction: 0.95,
    footprint: "water",
  };
  const baseline: SeaSurfaceTemperatureObservation[] = candidates.map(
    (candidate) => ({
      dataMonth: { year: candidate.year, month: CALENDAR_MONTH },
      value: candidate.value,
      validFraction: candidate.validFraction ?? 0.95,
      footprint: candidate.footprint ?? "water",
    })
  );
  return compareSstToSeasonalBaseline(target, baseline, { minimumSamples });
}

/** `count` fully usable years starting at `startYear`, all at `value`. */
function usableYears(
  startYear: number,
  count: number,
  value: number
): CandidateSpec[] {
  return Array.from({ length: count }, (_unused, index) => ({
    year: startYear + index,
    // A little spread keeps the baseline standard deviation defined.
    value: value + (index % 2 === 0 ? 0.1 : -0.1),
  }));
}

describe("ocean baseline selection bias", () => {
  it("reports a warm-biased baseline when a cold boundary lost years to coverage", () => {
    // A polar boundary: every retained September sits in the near-freezing band,
    // and three candidate years were dropped for coverage — exactly what a
    // partially ice-covered month does to the sampler.
    const comparison = comparisonFrom(1.4, [
      ...usableYears(2007, 10, 1.5),
      { year: 2017, value: 1.2, validFraction: 0.1 },
      { year: 2018, value: 1.1, validFraction: 0.05 },
      { year: 2019, value: null },
    ]);
    const summary = summarizeOceanBaselineSelection(comparison);

    expect(comparison.status).toBe("available");
    expect(summary.status).toBe("assessed");
    expect(summary.counts.retained).toBe(10);
    expect(summary.counts.withinWindowCandidates).toBe(13);
    expect(summary.counts.observationDropout).toBe(3);
    expect(summary.counts.insufficientCoverage).toBe(2);
    expect(summary.counts.footprintMismatch).toBe(1);
    expect(summary.retainedFraction).toBeCloseTo(10 / 13, 10);
    expect(summary.seaIceDropoutAdmissible).toBe(true);
    expect(summary.baselineMeanBias).toBe("warm-biased");
    // The anomaly inherits the opposite sign: target minus an inflated mean.
    expect(summary.anomalyBias).toBe("cold-biased");
    expect(summary.statement).toContain("biased warm");
    expect(summary.statement).toContain("no magnitude is estimated");
  });

  it("asserts no direction when the retained water is too warm for ice", () => {
    // Same dropout count, tropical boundary: cloud is the only mechanism left,
    // and cloud does not license a directional claim.
    const comparison = comparisonFrom(28.4, [
      ...usableYears(2007, 10, 28.5),
      { year: 2017, value: 28.2, validFraction: 0.1 },
      { year: 2018, value: 28.1, validFraction: 0.05 },
      { year: 2019, value: null },
    ]);
    const summary = summarizeOceanBaselineSelection(comparison);

    expect(summary.status).toBe("assessed");
    expect(summary.counts.observationDropout).toBe(3);
    expect(summary.seaIceDropoutAdmissible).toBe(false);
    expect(summary.baselineMeanBias).toBe("sign-undetermined");
    expect(summary.anomalyBias).toBe("sign-undetermined");
    expect(summary.statement).toContain("no bias direction is asserted");
  });

  it("reports no dropout when every candidate year survived", () => {
    const comparison = comparisonFrom(1.4, usableYears(2007, 12, 1.5));
    const summary = summarizeOceanBaselineSelection(comparison);

    expect(summary.counts.retained).toBe(12);
    expect(summary.counts.withinWindowCandidates).toBe(12);
    expect(summary.counts.observationDropout).toBe(0);
    expect(summary.retainedFraction).toBe(1);
    // Cold enough for ice to be admissible, but nothing was actually dropped,
    // so there is no dropout-driven bias to report.
    expect(summary.seaIceDropoutAdmissible).toBe(true);
    expect(summary.baselineMeanBias).toBe("no-dropout");
    expect(summary.anomalyBias).toBe("no-dropout");
    expect(summary.statement).toContain("no dropout-driven bias");
  });

  it("declines to assess selection when the baseline produced no mean", () => {
    // Too few usable years to meet the sample floor: there is no selected
    // population to characterize, but the dropout tally still explains why.
    const comparison = comparisonFrom(1.4, [
      ...usableYears(2007, 4, 1.5),
      { year: 2011, value: null },
      { year: 2012, value: null },
    ]);
    const summary = summarizeOceanBaselineSelection(comparison);

    expect(comparison.status).not.toBe("available");
    expect(summary.status).toBe("baseline-unavailable");
    expect(summary.baselineMeanBias).toBe("unassessed");
    expect(summary.anomalyBias).toBe("unassessed");
    expect(summary.coldestRetainedValue).toBeNull();
    expect(summary.marginAboveFreezingPoint).toBeNull();
    // The tally survives, because it is exactly what explains the gap.
    expect(summary.counts.observationDropout).toBe(2);
    expect(summary.counts.retained).toBe(4);
  });

  it("counts an ambiguous year separately from observation dropout", () => {
    // Two observations for one year: the baseline drops both for bookkeeping,
    // which is not a temperature-driven dropout and must not read as one.
    const comparison = comparisonFrom(1.4, [
      ...usableYears(2007, 10, 1.5),
      { year: 2017, value: 1.5 },
      { year: 2017, value: 1.6 },
    ]);
    const summary = summarizeOceanBaselineSelection(comparison);

    expect(summary.counts.ambiguousYears).toBe(2);
    expect(summary.counts.observationDropout).toBe(0);
    expect(summary.counts.withinWindowCandidates).toBe(12);
    expect(summary.baselineMeanBias).toBe("no-dropout");
  });

  it("ignores candidates that were never eligible for the window", () => {
    // A different calendar month and a year past the window end were never
    // candidates, so they must not inflate the dropped count.
    const target: SeaSurfaceTemperatureObservation = {
      dataMonth: { year: TARGET_YEAR, month: CALENDAR_MONTH },
      value: 1.4,
      validFraction: 0.95,
      footprint: "water",
    };
    const baseline: SeaSurfaceTemperatureObservation[] = [
      ...usableYears(2007, 10, 1.5).map((candidate) => ({
        dataMonth: { year: candidate.year, month: CALENDAR_MONTH },
        value: candidate.value,
        validFraction: 0.95,
        footprint: "water" as const,
      })),
      // Wrong calendar month.
      {
        dataMonth: { year: 2015, month: 3 },
        value: null,
        footprint: "water" as const,
      },
      // After the window, which ends the year before the target.
      {
        dataMonth: { year: TARGET_YEAR, month: CALENDAR_MONTH },
        value: null,
        footprint: "water" as const,
      },
    ];
    const summary = summarizeOceanBaselineSelection(
      compareSstToSeasonalBaseline(target, baseline, { minimumSamples: 10 })
    );

    expect(summary.counts.withinWindowCandidates).toBe(10);
    expect(summary.counts.observationDropout).toBe(0);
    expect(summary.retainedFraction).toBe(1);
  });

  it("reads the ice screen off the coldest retained month, not the mean", () => {
    // Mean sits above the threshold; one retained September sits below it, so
    // the boundary reaches the regime where ice dropout is admissible.
    const comparison = comparisonFrom(6, [
      ...usableYears(2007, 9, 6),
      { year: 2016, value: 1.5 },
      { year: 2017, value: null },
    ]);
    const summary = summarizeOceanBaselineSelection(comparison);

    expect(summary.coldestRetainedValue).toBe(1.5);
    expect(comparison.baseline.mean as number).toBeGreaterThan(
      SEA_ICE_ADMISSIBLE_THRESHOLD_C
    );
    expect(summary.seaIceDropoutAdmissible).toBe(true);
    expect(summary.baselineMeanBias).toBe("warm-biased");
  });

  it("measures the retained margin from the seawater freezing point", () => {
    const summary = summarizeOceanBaselineSelection(
      comparisonFrom(1.4, usableYears(2007, 10, 1.5))
    );

    expect(SEAWATER_FREEZING_POINT_C).toBe(-1.8);
    expect(summary.coldestRetainedValue).toBe(1.4);
    expect(summary.marginAboveFreezingPoint).toBeCloseTo(
      1.4 - SEAWATER_FREEZING_POINT_C,
      10
    );
  });

  it("honours an overridden ice threshold and echoes the one it used", () => {
    const comparison = comparisonFrom(1.4, [
      ...usableYears(2007, 10, 1.5),
      { year: 2017, value: null },
    ]);

    const strict = summarizeOceanBaselineSelection(comparison, {
      iceAdmissibleThreshold: 0.5,
    });
    expect(strict.iceAdmissibleThreshold).toBe(0.5);
    expect(strict.seaIceDropoutAdmissible).toBe(false);
    expect(strict.baselineMeanBias).toBe("sign-undetermined");

    // A non-finite override falls back to the documented default.
    const fallback = summarizeOceanBaselineSelection(comparison, {
      iceAdmissibleThreshold: Number.NaN,
    });
    expect(fallback.iceAdmissibleThreshold).toBe(
      SEA_ICE_ADMISSIBLE_THRESHOLD_C
    );
    expect(fallback.baselineMeanBias).toBe("warm-biased");
  });

  it("keeps the dataset citation, unit, and footprint of the assessed baseline", () => {
    const summary = summarizeOceanBaselineSelection(
      comparisonFrom(1.4, usableYears(2007, 10, 1.5))
    );

    expect(summary.source).toBe(SEA_SURFACE_TEMPERATURE_METRIC.source);
    expect(summary.source.doi).toBeTruthy();
    expect(summary.unit).toBe(SEA_SURFACE_TEMPERATURE_METRIC.sourceUnit);
    expect(summary.footprint).toBe("water");
    expect(summary.isForecast).toBe(false);
    expect(summary.claimScope).toBe("descriptive-sea-surface-temperature-only");
    expect(summary.limitations).toBe(OCEAN_BASELINE_SELECTION_LIMITATIONS);
  });

  it("never corrects the baseline mean or the anomaly it assesses", () => {
    const comparison = comparisonFrom(1.4, [
      ...usableYears(2007, 10, 1.5),
      { year: 2017, value: null },
    ]);
    const before = {
      mean: comparison.baseline.mean,
      anomaly: comparison.anomaly,
      sampleCount: comparison.baseline.sampleCount,
    };
    const summary = summarizeOceanBaselineSelection(comparison);

    expect(summary.baselineMeanBias).toBe("warm-biased");
    // The descriptor states a direction; it must leave the statistics alone.
    expect(comparison.baseline.mean).toBe(before.mean);
    expect(comparison.anomaly).toBe(before.anomaly);
    expect(comparison.baseline.sampleCount).toBe(before.sampleCount);
    expect(summary).not.toHaveProperty("correctedMean");
    expect(summary).not.toHaveProperty("biasMagnitude");
  });

  it("states no biological, habitat, heat-stress, causal, or forecast claim", () => {
    const statements = [
      summarizeOceanBaselineSelection(
        comparisonFrom(1.4, [
          ...usableYears(2007, 10, 1.5),
          { year: 2017, value: null },
        ])
      ),
      summarizeOceanBaselineSelection(
        comparisonFrom(28.4, [
          ...usableYears(2007, 10, 28.5),
          { year: 2017, value: null },
        ])
      ),
      summarizeOceanBaselineSelection(
        comparisonFrom(1.4, usableYears(2007, 10, 1.5))
      ),
      summarizeOceanBaselineSelection(comparisonFrom(1.4, [])),
    ].map((summary) => summary.statement);

    const forbidden =
      /coral|bleach|habitat|ecosystem|species|abundance|fisher|heat stress|heatwave|marine heat|health|risk|forecast|predict|expect|will |because of|caused by/i;
    for (const statement of statements) {
      expect(statement).not.toMatch(forbidden);
      expect(statement.length).toBeGreaterThan(0);
    }
  });
});
