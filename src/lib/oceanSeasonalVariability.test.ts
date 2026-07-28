import { describe, expect, it } from "vitest";
import { SEA_SURFACE_TEMPERATURE_METRIC } from "./oceanConditions";
import type { SeaSurfaceTemperatureObservation } from "./oceanConditions";
import {
  MINIMUM_QUALIFIED_MONTHS_FOR_VARIABILITY,
  MINIMUM_YEARS_PER_VARIABILITY_MONTH,
  SST_SEASONAL_VARIABILITY_LIMITATIONS,
  summarizeSstSeasonalVariability,
} from "./oceanSeasonalVariability";

function waterMonth(
  year: number,
  month: number,
  value: number,
  validFraction = 0.95
): SeaSurfaceTemperatureObservation {
  return {
    dataMonth: { year, month },
    value,
    validFraction,
    footprint: "water",
  };
}

/**
 * Emit one open-water observation for `month` in each successive year starting
 * at `startYear`, drawing the value from the supplied per-year list so the
 * interannual spread is controlled exactly.
 */
function monthWithValues(
  month: number,
  values: readonly number[],
  startYear = 2010
): SeaSurfaceTemperatureObservation[] {
  return values.map((value, index) =>
    waterMonth(startYear + index, month, value)
  );
}

/** Population-free sample (n-1) standard deviation, for expected values. */
function sampleSd(values: readonly number[]): number {
  const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
  const variance =
    values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance);
}

describe("SST calendar-month interannual variability", () => {
  it("reports the most and least interannually variable months", () => {
    // August swings widely year to year; February barely moves.
    const augustValues = [18, 22, 20, 26, 14]; // sd ≈ 4.472
    const februaryValues = [11, 12, 11, 12, 11]; // sd ≈ 0.548
    const observations = [
      ...monthWithValues(8, augustValues),
      ...monthWithValues(2, februaryValues),
    ];

    const variability = summarizeSstSeasonalVariability(observations);

    expect(variability).toMatchObject({
      kind: "observed-sst-seasonal-variability",
      isForecast: false,
      claimScope: "descriptive-sea-surface-temperature-only",
      status: "available",
      metric: SEA_SURFACE_TEMPERATURE_METRIC,
      footprint: "water",
      qualifiedMonthCount: 2,
      spreadUnit: "°C",
      reason: null,
    });
    expect(variability.mostVariableMonth).toMatchObject({
      calendarMonth: 8,
      yearCount: 5,
    });
    expect(variability.leastVariableMonth).toMatchObject({
      calendarMonth: 2,
      yearCount: 5,
    });
    expect(variability.mostVariableMonth?.sampleStandardDeviation).toBeCloseTo(
      sampleSd(augustValues),
      10
    );
    expect(variability.leastVariableMonth?.sampleStandardDeviation).toBeCloseTo(
      sampleSd(februaryValues),
      10
    );
    expect(variability.variabilitySpread).toBeCloseTo(
      sampleSd(augustValues) - sampleSd(februaryValues),
      10
    );
    expect(variability.meanSampleStandardDeviation).toBeCloseTo(
      (sampleSd(augustValues) + sampleSd(februaryValues)) / 2,
      10
    );
    expect(variability.limitations).toBe(SST_SEASONAL_VARIABILITY_LIMITATIONS);
  });

  it("computes each month's sample (n-1) standard deviation and mean", () => {
    const julyValues = [15, 17, 19, 21, 23]; // mean 19, sd = sqrt(10)
    const variability = summarizeSstSeasonalVariability([
      ...monthWithValues(7, julyValues),
      ...monthWithValues(1, [3, 3, 3, 3, 3]), // zero interannual spread
    ]);

    const july = variability.months.find((m) => m.calendarMonth === 7);
    expect(july).toMatchObject({ mean: 19, yearCount: 5, qualified: true });
    expect(july?.sampleStandardDeviation).toBeCloseTo(Math.sqrt(10), 10);

    const january = variability.months.find((m) => m.calendarMonth === 1);
    // Identical values every year is a valid, honest zero spread — not withheld.
    expect(january?.sampleStandardDeviation).toBe(0);
    expect(variability.leastVariableMonth).toMatchObject({
      calendarMonth: 1,
      sampleStandardDeviation: 0,
    });
  });

  it("keeps only the first of a duplicated (calendar month, year)", () => {
    const observations = [
      ...monthWithValues(6, [10, 12, 14, 16, 18]),
      waterMonth(2010, 6, 30), // duplicate of the first June year
    ];

    const variability = summarizeSstSeasonalVariability(observations);
    const june = variability.months.find((m) => m.calendarMonth === 6);

    expect(june?.yearCount).toBe(5);
    expect(variability.exclusions.duplicateYearMonth).toBe(1);
    // The duplicate-year outlier never entered the spread.
    expect(june?.sampleStandardDeviation).toBeCloseTo(
      sampleSd([10, 12, 14, 16, 18]),
      10
    );
  });

  it("never mixes open-water and land-mixed coastal footprints", () => {
    const observations: SeaSurfaceTemperatureObservation[] = [
      ...monthWithValues(3, [8, 9, 10, 11, 12]), // 5 water years
      ...monthWithValues(9, [20, 21, 22, 23, 24]), // 5 water years
      // Coastal observations for the same months are excluded from the
      // water-footprint march (water dominates the supplied set).
      {
        dataMonth: { year: 2010, month: 3 },
        value: 5,
        validFraction: 0.9,
        footprint: "land-mixed-coastal",
      },
      {
        dataMonth: { year: 2011, month: 3 },
        value: 5,
        validFraction: 0.9,
        footprint: "land-mixed-coastal",
      },
    ];

    const variability = summarizeSstSeasonalVariability(observations);

    expect(variability.footprint).toBe("water");
    expect(variability.exclusions.footprintMismatch).toBe(2);
    const march = variability.months.find((m) => m.calendarMonth === 3);
    expect(march?.yearCount).toBe(5);
  });

  it("builds the march for an explicitly requested coastal footprint", () => {
    const observations: SeaSurfaceTemperatureObservation[] = [
      ...monthWithValues(4, [10, 12, 14, 16, 18]), // water, ignored
      {
        dataMonth: { year: 2010, month: 4 },
        value: 6,
        validFraction: 0.9,
        footprint: "land-mixed-coastal",
      },
      {
        dataMonth: { year: 2011, month: 4 },
        value: 7,
        validFraction: 0.9,
        footprint: "land-mixed-coastal",
      },
      {
        dataMonth: { year: 2012, month: 4 },
        value: 8,
        validFraction: 0.9,
        footprint: "land-mixed-coastal",
      },
      {
        dataMonth: { year: 2013, month: 4 },
        value: 9,
        validFraction: 0.9,
        footprint: "land-mixed-coastal",
      },
      {
        dataMonth: { year: 2014, month: 4 },
        value: 10,
        validFraction: 0.9,
        footprint: "land-mixed-coastal",
      },
      {
        dataMonth: { year: 2010, month: 10 },
        value: 12,
        validFraction: 0.9,
        footprint: "land-mixed-coastal",
      },
      {
        dataMonth: { year: 2011, month: 10 },
        value: 12,
        validFraction: 0.9,
        footprint: "land-mixed-coastal",
      },
      {
        dataMonth: { year: 2012, month: 10 },
        value: 12,
        validFraction: 0.9,
        footprint: "land-mixed-coastal",
      },
      {
        dataMonth: { year: 2013, month: 10 },
        value: 12,
        validFraction: 0.9,
        footprint: "land-mixed-coastal",
      },
      {
        dataMonth: { year: 2014, month: 10 },
        value: 12,
        validFraction: 0.9,
        footprint: "land-mixed-coastal",
      },
    ];

    const variability = summarizeSstSeasonalVariability(observations, {
      footprint: "land-mixed-coastal",
    });

    expect(variability.status).toBe("available");
    expect(variability.footprint).toBe("land-mixed-coastal");
    expect(variability.mostVariableMonth?.calendarMonth).toBe(4);
    expect(variability.leastVariableMonth).toMatchObject({
      calendarMonth: 10,
      sampleStandardDeviation: 0,
    });
    // The five water-footprint April observations were excluded.
    expect(variability.exclusions.footprintMismatch).toBe(5);
  });

  it("excludes observations below the coverage threshold", () => {
    const observations = [
      ...monthWithValues(5, [10, 12, 14, 16, 18]),
      waterMonth(2015, 5, 25, 0.2), // sixth year, but too little valid area
    ];

    const variability = summarizeSstSeasonalVariability(observations, {
      minimumValidFraction: 0.6,
    });
    const may = variability.months.find((m) => m.calendarMonth === 5);

    expect(may?.yearCount).toBe(5);
    expect(variability.exclusions.insufficientCoverage).toBe(1);
  });

  it("requires enough distinct years for a month to qualify", () => {
    // August has the default floor of years; February has only three.
    const observations = [
      ...monthWithValues(8, [18, 20, 22, 24, 26]),
      ...monthWithValues(2, [11, 12, 13]),
    ];

    const variability = summarizeSstSeasonalVariability(observations);

    const february = variability.months.find((m) => m.calendarMonth === 2);
    expect(february?.qualified).toBe(false);
    // February still carries a computed spread for auditability, just unqualified.
    expect(february?.sampleStandardDeviation).toBeCloseTo(
      sampleSd([11, 12, 13]),
      10
    );
    expect(variability.qualifiedMonthCount).toBe(1);
    expect(variability.status).toBe("insufficient-qualified-months");
    expect(variability.mostVariableMonth).toBeNull();
    expect(variability.variabilitySpread).toBeNull();
    // The lone qualifying month still yields a mean spread for context.
    expect(variability.meanSampleStandardDeviation).toBeCloseTo(
      sampleSd([18, 20, 22, 24, 26]),
      10
    );
    expect(variability.reason).toBe("too-few-qualified-calendar-months");
  });

  it("honors a lowered minimum-years option down to the sample floor", () => {
    const observations = [
      ...monthWithValues(6, [10, 14]), // two years
      ...monthWithValues(12, [20, 21]), // two years
    ];

    const variability = summarizeSstSeasonalVariability(observations, {
      minimumYearsPerMonth: 2,
    });

    expect(variability.status).toBe("available");
    expect(variability.qualifiedMonthCount).toBe(2);
    expect(variability.mostVariableMonth?.calendarMonth).toBe(6);
  });

  it("reports no-usable-observations when nothing has a usable footprint", () => {
    const observations: SeaSurfaceTemperatureObservation[] = [
      { dataMonth: { year: 2010, month: 1 }, value: null, footprint: "land" },
      { dataMonth: { year: 2011, month: 1 }, value: 12, footprint: "land" },
    ];

    const variability = summarizeSstSeasonalVariability(observations);

    expect(variability.status).toBe("no-usable-observations");
    expect(variability.footprint).toBeNull();
    expect(variability.mostVariableMonth).toBeNull();
    expect(variability.meanSampleStandardDeviation).toBeNull();
    expect(variability.reason).toBe("no-usable-sst-observations");
  });

  it("rejects an invalid minimum-years configuration below the sample floor", () => {
    const variability = summarizeSstSeasonalVariability(
      monthWithValues(7, [10, 12, 14, 16, 18]),
      { minimumYearsPerMonth: 1 }
    );

    expect(variability.status).toBe("invalid");
    expect(variability.reason).toBe("invalid-variability-configuration");
    expect(variability.months).toHaveLength(0);
  });

  it("rejects an out-of-range coverage fraction", () => {
    const variability = summarizeSstSeasonalVariability(
      monthWithValues(7, [10, 12, 14, 16, 18]),
      { minimumValidFraction: 1.5 }
    );

    expect(variability.status).toBe("invalid");
    expect(variability.reason).toBe("invalid-variability-configuration");
  });

  it("breaks equal-spread ties toward the earliest calendar month", () => {
    // May and September share an identical interannual spread.
    const shape = [10, 12, 14, 16, 18];
    const observations = [
      ...monthWithValues(9, shape),
      ...monthWithValues(5, shape),
    ];

    const variability = summarizeSstSeasonalVariability(observations);

    expect(variability.mostVariableMonth?.calendarMonth).toBe(5);
    expect(variability.leastVariableMonth?.calendarMonth).toBe(5);
    expect(variability.variabilitySpread).toBe(0);
  });

  it("exposes the qualification thresholds it enforced", () => {
    const variability = summarizeSstSeasonalVariability(
      monthWithValues(7, [10, 12, 14, 16, 18])
    );

    expect(variability.requiredYearsPerMonth).toBe(
      MINIMUM_YEARS_PER_VARIABILITY_MONTH
    );
    expect(variability.requiredQualifiedMonths).toBe(
      MINIMUM_QUALIFIED_MONTHS_FOR_VARIABILITY
    );
  });
});
