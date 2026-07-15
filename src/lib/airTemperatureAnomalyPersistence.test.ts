import { describe, expect, it } from "vitest";
import { CLIMATE_METRICS, type MonthlyClimateObservation } from "./climate";
import {
  compareMonthlyClimateToSeasonalBaseline,
  type SeasonalBaselineComparison,
} from "./seasonalBaseline";
import {
  AIR_TEMPERATURE_ANOMALY_PERSISTENCE_LIMITATIONS,
  AIR_TEMPERATURE_ANOMALY_PERSISTENCE_METRIC,
  describeAirTemperatureAnomalyPersistence,
  narrateAirTemperatureAnomalyPersistence,
} from "./airTemperatureAnomalyPersistence";

const AVAILABLE_THROUGH = { year: 2026, month: 1 };
const BASELINE_MEAN = 290;

/**
 * Build a same-calendar-month air-temperature comparison for (year, month) whose
 * anomaly is exactly `delta` K: twelve prior same-month years all equal to
 * `baseline`, so the baseline mean is `baseline` and the target is `baseline + delta`.
 * A flat baseline has zero spread (standardized anomaly therefore null); pass
 * `spread` to give the baseline a known non-zero standard deviation instead.
 */
const cmp = (
  year: number,
  month: number,
  delta: number,
  {
    baseline = BASELINE_MEAN,
    spread = 0,
  }: { baseline?: number; spread?: number } = {}
): SeasonalBaselineComparison => {
  const priorValues =
    spread === 0
      ? Array.from({ length: 12 }, () => baseline)
      : // Symmetric ± spread pairs keep the mean at `baseline` with a known,
        // non-zero sample spread so the standardized anomaly is well defined.
        Array.from({ length: 12 }, (_unused, index) =>
          index % 2 === 0 ? baseline - spread : baseline + spread
        );
  const priors: MonthlyClimateObservation[] = priorValues.map(
    (value, index) => ({
      metricId: "air-temperature-2m",
      dataMonth: { year: year - 12 + index, month },
      value,
      validFraction: 0.9,
    })
  );
  return compareMonthlyClimateToSeasonalBaseline(
    {
      metricId: "air-temperature-2m",
      dataMonth: { year, month },
      value: baseline + delta,
      validFraction: 0.9,
    },
    priors,
    AVAILABLE_THROUGH
  );
};

/** A comparison with no usable anomaly (target has no data), aligned to (year, month). */
const noDataCmp = (year: number, month: number): SeasonalBaselineComparison =>
  compareMonthlyClimateToSeasonalBaseline(
    {
      metricId: "air-temperature-2m",
      dataMonth: { year, month },
      value: null,
      validFraction: 0.9,
    },
    Array.from({ length: 12 }, (_unused, index) => ({
      metricId: "air-temperature-2m" as const,
      dataMonth: { year: year - 12 + index, month },
      value: BASELINE_MEAN,
      validFraction: 0.9,
    })),
    AVAILABLE_THROUGH
  );

describe("air temperature anomaly persistence", () => {
  it("reports the trailing warm run over consecutive same-sign months", () => {
    const result = describeAirTemperatureAnomalyPersistence([
      cmp(2025, 5, 1.5),
      cmp(2025, 6, 0.8),
      cmp(2025, 7, 2.1),
    ]);

    expect(result).toMatchObject({
      kind: "air-temperature-anomaly-persistence",
      isForecast: false,
      isTrend: false,
      claimScope:
        "descriptive-2m-air-temperature-anomaly-sign-persistence-only",
      status: "available",
      observedMonths: 3,
      usableMonths: 3,
      hasGaps: false,
      isConsecutiveRun: true,
      currentDirection: "warm",
      runDirection: "warm",
      runLength: 3,
      runSpansSuppliedRecord: true,
      reason: null,
    });
    expect(result.latestUsableMonth).toEqual({ year: 2025, month: 7 });
    expect(result.runStartMonth).toEqual({ year: 2025, month: 5 });
    expect(result.currentAnomaly).toBeCloseTo(2.1, 10);
    expect(result.directionTenure).toEqual([
      { direction: "warm", months: 3, fractionOfUsableMonths: 1 },
    ]);
    expect(result.metric).toBe(CLIMATE_METRICS["air-temperature-2m"]);
    expect(result.metric).toBe(AIR_TEMPERATURE_ANOMALY_PERSISTENCE_METRIC);
    expect(result.anomalyUnit).toBe("K");
    expect(result.limitations).toBe(
      AIR_TEMPERATURE_ANOMALY_PERSISTENCE_LIMITATIONS
    );
  });

  it("reports the trailing cool run and counts direction tenure across the window", () => {
    const result = describeAirTemperatureAnomalyPersistence([
      cmp(2025, 5, 1.2), // warm
      cmp(2025, 6, -0.5), // cool
      cmp(2025, 7, -1.4), // cool
    ]);

    expect(result.currentDirection).toBe("cool");
    expect(result.runDirection).toBe("cool");
    expect(result.runLength).toBe(2);
    expect(result.runStartMonth).toEqual({ year: 2025, month: 6 });
    expect(result.runSpansSuppliedRecord).toBe(false);
    expect(result.directionTenure).toEqual([
      { direction: "cool", months: 2, fractionOfUsableMonths: 2 / 3 },
      { direction: "warm", months: 1, fractionOfUsableMonths: 1 / 3 },
    ]);
  });

  it("stops the run at a sign flip", () => {
    const result = describeAirTemperatureAnomalyPersistence([
      cmp(2025, 4, 1.0), // warm
      cmp(2025, 5, 1.0), // warm
      cmp(2025, 6, -0.2), // cool  ← flips
      cmp(2025, 7, 1.1), // warm (latest)
    ]);

    expect(result.runDirection).toBe("warm");
    expect(result.runLength).toBe(1);
    expect(result.runStartMonth).toEqual({ year: 2025, month: 7 });
  });

  it("breaks the run across a calendar gap even when the sign is unchanged", () => {
    const result = describeAirTemperatureAnomalyPersistence([
      cmp(2025, 5, 1.0), // warm
      cmp(2025, 7, 1.0), // warm, but June is missing from the window
    ]);

    expect(result.isConsecutiveRun).toBe(false);
    expect(result.runDirection).toBe("warm");
    expect(result.runLength).toBe(1);
    expect(result.latestUsableMonth).toEqual({ year: 2025, month: 7 });
  });

  it("treats an unusable comparison as a gap that breaks the run", () => {
    const result = describeAirTemperatureAnomalyPersistence([
      cmp(2025, 5, 1.0), // warm
      noDataCmp(2025, 6), // no-data → gap
      cmp(2025, 7, 1.0), // warm (latest)
    ]);

    expect(result.observedMonths).toBe(3);
    expect(result.usableMonths).toBe(2);
    expect(result.hasGaps).toBe(true);
    expect(result.runLength).toBe(1);
    expect(result.runDirection).toBe("warm");
  });

  it("excludes a comparison for a different metric", () => {
    const precipComparison = compareMonthlyClimateToSeasonalBaseline(
      {
        metricId: "precipitation-rate",
        dataMonth: { year: 2025, month: 6 },
        value: 5,
        validFraction: 0.9,
      },
      Array.from({ length: 12 }, (_unused, index) => ({
        metricId: "precipitation-rate" as const,
        dataMonth: { year: 2013 + index, month: 6 },
        value: 3,
        validFraction: 0.9,
      })),
      AVAILABLE_THROUGH
    );
    expect(precipComparison.status).toBe("available");

    const result = describeAirTemperatureAnomalyPersistence([
      cmp(2025, 5, 1.0),
      precipComparison,
      cmp(2025, 7, 1.0),
    ]);

    expect(result.usableMonths).toBe(2);
    expect(result.hasGaps).toBe(true);
    // The wrong-metric month breaks the run just like any other gap.
    expect(result.runLength).toBe(1);
  });

  it("reports no run in progress when the latest usable month is neutral", () => {
    const result = describeAirTemperatureAnomalyPersistence([
      cmp(2025, 6, 1.0), // warm
      cmp(2025, 7, 0), // exactly on baseline → neutral
    ]);

    expect(result.currentDirection).toBe("neutral");
    expect(result.runDirection).toBe("none");
    expect(result.runLength).toBe(0);
    expect(result.runStartMonth).toBeNull();
  });

  it("applies a neutral deadband so a near-zero anomaly does not extend a run", () => {
    const comparisons = [cmp(2025, 6, 1.0), cmp(2025, 7, 0.3)];

    const withoutDeadband =
      describeAirTemperatureAnomalyPersistence(comparisons);
    expect(withoutDeadband.currentDirection).toBe("warm");
    expect(withoutDeadband.runLength).toBe(2);

    const withDeadband = describeAirTemperatureAnomalyPersistence(comparisons, {
      neutralAnomalyThreshold: 0.5,
    });
    expect(withDeadband.neutralAnomalyThreshold).toBe(0.5);
    expect(withDeadband.currentDirection).toBe("neutral");
    expect(withDeadband.runDirection).toBe("none");
    expect(withDeadband.runLength).toBe(0);
  });

  it("falls back to a zero deadband for a non-finite or negative threshold", () => {
    const comparisons = [cmp(2025, 7, 0.2)];
    for (const threshold of [-1, Number.NaN, Number.POSITIVE_INFINITY]) {
      const result = describeAirTemperatureAnomalyPersistence(comparisons, {
        neutralAnomalyThreshold: threshold,
      });
      expect(result.neutralAnomalyThreshold).toBe(0);
      expect(result.currentDirection).toBe("warm");
    }
  });

  it("computes the standardized anomaly only when the baseline spread is positive", () => {
    const flat = describeAirTemperatureAnomalyPersistence([cmp(2025, 7, 2.0)]);
    expect(flat.currentStandardizedAnomaly).toBeNull();

    const spreadComparison = cmp(2025, 7, 2.0, { spread: 1 });
    const standardized = describeAirTemperatureAnomalyPersistence([
      spreadComparison,
    ]);
    const sd = spreadComparison.baseline.sampleStandardDeviation;
    expect(sd).not.toBeNull();
    expect(standardized.currentStandardizedAnomaly).toBeCloseTo(
      (spreadComparison.anomaly as number) / (sd as number),
      10
    );
  });

  it("reports no usable months honestly for an empty or all-gap window", () => {
    const empty = describeAirTemperatureAnomalyPersistence([]);
    expect(empty.status).toBe("no-usable-months");
    expect(empty.reason).toBe("no-comparisons");
    expect(empty.runLength).toBe(0);
    expect(empty.directionTenure).toEqual([]);

    const allGaps = describeAirTemperatureAnomalyPersistence([
      noDataCmp(2025, 6),
      noDataCmp(2025, 7),
    ]);
    expect(allGaps.status).toBe("no-usable-months");
    expect(allGaps.reason).toBe("no-usable-months");
    expect(allGaps.hasGaps).toBe(true);
    expect(allGaps.latestUsableMonth).toBeNull();
  });

  it("marks a run that spans every usable supplied month", () => {
    const result = describeAirTemperatureAnomalyPersistence([
      cmp(2025, 6, 0.9),
      cmp(2025, 7, 1.1),
    ]);
    expect(result.runLength).toBe(2);
    expect(result.usableMonths).toBe(2);
    expect(result.runSpansSuppliedRecord).toBe(true);
  });
});

describe("narrateAirTemperatureAnomalyPersistence", () => {
  it("states the current run direction, length, and provenance", () => {
    const sentence = narrateAirTemperatureAnomalyPersistence(
      describeAirTemperatureAnomalyPersistence([
        cmp(2025, 5, 1.0),
        cmp(2025, 6, 1.0),
        cmp(2025, 7, 1.0),
      ])
    );
    expect(sentence).toContain("3 consecutive months");
    expect(sentence).toContain("warmer than its same-calendar-month baseline");
    expect(sentence).toContain("since May 2025");
    expect(sentence).toContain("M2TMNXSLV");
    expect(sentence).toContain(
      "not a heatwave, cold spell, forecast, or trend"
    );
  });

  it("uses a singular month and omits the since-clause for a length-one run", () => {
    const sentence = narrateAirTemperatureAnomalyPersistence(
      describeAirTemperatureAnomalyPersistence([cmp(2025, 7, 1.0)])
    );
    expect(sentence).toContain("1 consecutive month");
    expect(sentence).not.toContain("since");
  });

  it("says no run is in progress when the latest month is neutral", () => {
    const sentence = narrateAirTemperatureAnomalyPersistence(
      describeAirTemperatureAnomalyPersistence([cmp(2025, 7, 0)])
    );
    expect(sentence).toContain("no warm or cool run is in progress");
  });

  it("states the no-usable-months case honestly", () => {
    const sentence = narrateAirTemperatureAnomalyPersistence(
      describeAirTemperatureAnomalyPersistence([])
    );
    expect(sentence).toContain("No usable 2 m air-temperature anomaly run");
  });
});
