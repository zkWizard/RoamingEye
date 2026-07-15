import { describe, expect, it } from "vitest";
import { SEA_SURFACE_TEMPERATURE_METRIC } from "./oceanConditions";
import type { SeaSurfaceTemperatureObservation } from "./oceanConditions";
import {
  compareSstToSeasonalBaseline,
  type OceanSeasonalBaselineComparison,
  type UsableSstFootprint,
} from "./oceanSeasonalBaseline";
import type { YearMonth } from "./timeline";
import {
  describeOceanAnomalyPersistence,
  narrateOceanAnomalyPersistence,
  OCEAN_ANOMALY_PERSISTENCE_LIMITATIONS,
} from "./oceanAnomalyPersistence";

/** A baseline value every candidate month shares, so anomaly === delta. */
const BASELINE_VALUE = 20;

/**
 * Build a real `available` comparison for `month` whose anomaly equals `delta`:
 * ten prior same-calendar-month years sit at BASELINE_VALUE and the target sits
 * at BASELINE_VALUE + delta. Footprint is shared by target and baseline so the
 * comparison is like-for-like.
 */
function comparisonFor(
  month: YearMonth,
  delta: number,
  footprint: UsableSstFootprint = "water"
): OceanSeasonalBaselineComparison {
  const target: SeaSurfaceTemperatureObservation = {
    dataMonth: month,
    value: BASELINE_VALUE + delta,
    validFraction: 0.95,
    footprint,
  };
  const baseline: SeaSurfaceTemperatureObservation[] = Array.from(
    { length: 10 },
    (_unused, index) => ({
      dataMonth: { year: month.year - 10 + index, month: month.month },
      // A little spread so the baseline standard deviation is defined.
      value: BASELINE_VALUE + (index % 2 === 0 ? -0.5 : 0.5),
      validFraction: 0.95,
      footprint,
    })
  );
  const comparison = compareSstToSeasonalBaseline(target, baseline);
  expect(comparison.status).toBe("available");
  return comparison;
}

/** An unusable comparison: a land target yields status `land`, anomaly null. */
function landComparison(month: YearMonth): OceanSeasonalBaselineComparison {
  const comparison = compareSstToSeasonalBaseline(
    { dataMonth: month, value: null, footprint: "land" },
    []
  );
  expect(comparison.status).toBe("land");
  expect(comparison.anomaly).toBeNull();
  return comparison;
}

const JUN_2026: YearMonth = { year: 2026, month: 6 };
const JUL_2026: YearMonth = { year: 2026, month: 7 };
const AUG_2026: YearMonth = { year: 2026, month: 8 };

describe("SST seasonal-anomaly persistence", () => {
  it("counts a warm run across consecutive same-footprint months", () => {
    const persistence = describeOceanAnomalyPersistence([
      comparisonFor(JUN_2026, 1.2),
      comparisonFor(JUL_2026, 0.8),
      comparisonFor(AUG_2026, 1.5),
    ]);

    expect(persistence).toMatchObject({
      kind: "sea-surface-temperature-anomaly-persistence",
      isForecast: false,
      claimScope: "descriptive-sea-surface-temperature-only",
      status: "available",
      footprint: "water",
      runDirection: "warm",
      runLength: 3,
      currentDirection: "warm",
      hasGaps: false,
      isConsecutiveRun: true,
      runSpansSuppliedRecord: true,
      reason: null,
    });
    expect(persistence.latestUsableMonth).toEqual(AUG_2026);
    expect(persistence.runStartMonth).toEqual(JUN_2026);
    expect(persistence.currentAnomaly).toBeCloseTo(1.5, 10);
    expect(persistence.usableMonths).toBe(3);
    expect(persistence.directionTenure).toEqual([
      { direction: "warm", months: 3, fractionOfUsableMonths: 1 },
    ]);
  });

  it("provenance and unit come from the SST dataset, never a forecast", () => {
    const persistence = describeOceanAnomalyPersistence([
      comparisonFor(AUG_2026, 0.7),
    ]);

    expect(persistence.source).toEqual(SEA_SURFACE_TEMPERATURE_METRIC.source);
    expect(persistence.anomalyUnit).toBe(
      SEA_SURFACE_TEMPERATURE_METRIC.sourceUnit
    );
    expect(persistence.isForecast).toBe(false);
    expect(persistence.limitations).toBe(OCEAN_ANOMALY_PERSISTENCE_LIMITATIONS);
    expect(
      persistence.limitations.some((line) => /marine heatwave/i.test(line))
    ).toBe(true);
  });

  it("a sign flip ends the run at the latest same-sign streak", () => {
    const persistence = describeOceanAnomalyPersistence([
      comparisonFor(JUN_2026, -0.9), // cool
      comparisonFor(JUL_2026, 1.1), // warm
      comparisonFor(AUG_2026, 0.6), // warm
    ]);

    expect(persistence.runDirection).toBe("warm");
    expect(persistence.runLength).toBe(2);
    expect(persistence.runStartMonth).toEqual(JUL_2026);
    expect(persistence.runSpansSuppliedRecord).toBe(false);
    expect(persistence.directionTenure).toEqual([
      { direction: "warm", months: 2, fractionOfUsableMonths: 2 / 3 },
      { direction: "cool", months: 1, fractionOfUsableMonths: 1 / 3 },
    ]);
  });

  it("a neutral latest month reports no run in progress", () => {
    const persistence = describeOceanAnomalyPersistence([
      comparisonFor(JUL_2026, 1.0),
      comparisonFor(AUG_2026, 0), // exactly on the baseline mean
    ]);

    expect(persistence.currentDirection).toBe("neutral");
    expect(persistence.runDirection).toBe("none");
    expect(persistence.runLength).toBe(0);
    expect(persistence.runStartMonth).toBeNull();
    expect(persistence.latestUsableMonth).toEqual(AUG_2026);
  });

  it("applies a neutral deadband so a small anomaly is not forced warm", () => {
    const comparisons = [comparisonFor(AUG_2026, 0.3)];

    const strict = describeOceanAnomalyPersistence(comparisons);
    expect(strict.currentDirection).toBe("warm");
    expect(strict.runLength).toBe(1);

    const deadbanded = describeOceanAnomalyPersistence(comparisons, {
      neutralAnomalyThreshold: 0.5,
    });
    expect(deadbanded.currentDirection).toBe("neutral");
    expect(deadbanded.runDirection).toBe("none");
    expect(deadbanded.neutralAnomalyThreshold).toBe(0.5);
  });

  it("a calendar gap breaks the run and is flagged", () => {
    const persistence = describeOceanAnomalyPersistence([
      comparisonFor(JUN_2026, 1.0),
      // July is skipped: August is not adjacent to June.
      comparisonFor(AUG_2026, 1.0),
    ]);

    expect(persistence.isConsecutiveRun).toBe(false);
    expect(persistence.runLength).toBe(1);
    expect(persistence.runStartMonth).toEqual(AUG_2026);
    expect(persistence.usableMonths).toBe(2);
    expect(persistence.hasGaps).toBe(false);
  });

  it("an unusable comparison breaks the run and marks a gap", () => {
    const persistence = describeOceanAnomalyPersistence([
      comparisonFor(JUN_2026, 1.0),
      landComparison(JUL_2026),
      comparisonFor(AUG_2026, 1.0),
    ]);

    expect(persistence.hasGaps).toBe(true);
    expect(persistence.usableMonths).toBe(2);
    expect(persistence.runLength).toBe(1);
    expect(persistence.runDirection).toBe("warm");
    expect(persistence.latestUsableMonth).toEqual(AUG_2026);
  });

  it("a footprint change breaks the run even when the sign holds", () => {
    const persistence = describeOceanAnomalyPersistence([
      comparisonFor(JUL_2026, 1.0, "water"),
      comparisonFor(AUG_2026, 1.0, "land-mixed-coastal"),
    ]);

    expect(persistence.footprint).toBe("land-mixed-coastal");
    expect(persistence.runDirection).toBe("warm");
    expect(persistence.runLength).toBe(1);
    expect(persistence.runSpansSuppliedRecord).toBe(false);
  });

  it("reports no-usable-months honestly and never invents a run", () => {
    const empty = describeOceanAnomalyPersistence([]);
    expect(empty.status).toBe("no-usable-months");
    expect(empty.reason).toBe("no-comparisons");
    expect(empty.runLength).toBe(0);
    expect(empty.runDirection).toBe("none");

    const allLand = describeOceanAnomalyPersistence([
      landComparison(JUL_2026),
      landComparison(AUG_2026),
    ]);
    expect(allLand.status).toBe("no-usable-months");
    expect(allLand.reason).toBe("no-usable-months");
    expect(allLand.hasGaps).toBe(true);
    expect(allLand.latestUsableMonth).toBeNull();
  });

  it("narrates the current run with provenance and marine-heatwave caveat", () => {
    const warm = narrateOceanAnomalyPersistence(
      describeOceanAnomalyPersistence([
        comparisonFor(JUN_2026, 1.0),
        comparisonFor(JUL_2026, 1.0),
        comparisonFor(AUG_2026, 1.0),
      ])
    );
    expect(warm).toMatch(/3 consecutive months/);
    expect(warm).toMatch(/since Jun 2026/);
    expect(warm).toMatch(/not a marine heatwave/i);
    expect(warm).toMatch(/Source: /);

    const none = narrateOceanAnomalyPersistence(
      describeOceanAnomalyPersistence([comparisonFor(AUG_2026, 0)])
    );
    expect(none).toMatch(/no warm or cool run is in progress/);

    const unavailable = narrateOceanAnomalyPersistence(
      describeOceanAnomalyPersistence([])
    );
    expect(unavailable).toMatch(
      /No usable sea-surface-temperature anomaly run/
    );
  });
});
