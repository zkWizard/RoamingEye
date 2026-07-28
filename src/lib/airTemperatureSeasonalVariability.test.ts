import { describe, expect, it } from "vitest";
import { type MonthlyClimateObservation } from "./climate";
import {
  AIR_TEMPERATURE_SEASONAL_VARIABILITY_LIMITATIONS,
  describeAirTemperatureSeasonalVariability,
  formatAirTemperatureSeasonalVariability,
  MINIMUM_QUALIFIED_MONTHS_FOR_VARIABILITY,
  MINIMUM_YEARS_PER_VARIABILITY_MONTH,
} from "./airTemperatureSeasonalVariability";
import type { YearMonth } from "./timeline";

/** Availability checkpoint comfortably after every data month used below. */
const AVAILABLE_THROUGH: YearMonth = { year: 2026, month: 1 };

/** Build a usable air-temperature observation. */
function air(
  value: number | null,
  month: number,
  year: number,
  extra: Partial<MonthlyClimateObservation> = {}
): MonthlyClimateObservation {
  return {
    metricId: "air-temperature-2m",
    dataMonth: { year, month },
    value,
    ...extra,
  };
}

/**
 * Emit `values.length` yearly observations for a calendar month, one per
 * consecutive year starting at `startYear`.
 */
function monthYears(
  calendarMonth: number,
  values: readonly number[],
  startYear = 2018
): MonthlyClimateObservation[] {
  return values.map((value, index) =>
    air(value, calendarMonth, startYear + index)
  );
}

/** Sample (n-1) standard deviation, for asserting exact expected spreads. */
function sampleSd(values: readonly number[]): number {
  const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
  const variance =
    values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance);
}

describe("air-temperature interannual seasonal variability", () => {
  it("reports the most and least variable qualifying months and their spread", () => {
    // January is the tightest month (spread 1 K around 271); July is loosest
    // (spread 4 K around 298). Each month carries five distinct years.
    const januaryValues = [270, 270.5, 271, 271.5, 272];
    const julyValues = [294, 296, 298, 300, 302];
    const observations = [
      ...monthYears(1, januaryValues),
      ...monthYears(7, julyValues),
    ];

    const result = describeAirTemperatureSeasonalVariability(
      observations,
      AVAILABLE_THROUGH
    );

    expect(result).toMatchObject({
      kind: "air-temperature-seasonal-variability",
      isForecast: false,
      status: "available",
      nativeUnit: "K",
      qualifiedMonthCount: 2,
      reason: null,
    });
    expect(result.mostVariableMonth?.calendarMonth).toBe(7);
    expect(result.leastVariableMonth?.calendarMonth).toBe(1);

    const janSd = sampleSd(januaryValues);
    const julSd = sampleSd(julyValues);
    expect(
      result.leastVariableMonth?.sampleStandardDeviationKelvin
    ).toBeCloseTo(janSd, 10);
    expect(result.mostVariableMonth?.sampleStandardDeviationKelvin).toBeCloseTo(
      julSd,
      10
    );
    expect(result.variabilitySpreadKelvin).toBeCloseTo(julSd - janSd, 10);
    expect(result.meanSampleStandardDeviationKelvin).toBeCloseTo(
      (janSd + julSd) / 2,
      10
    );
    expect(result.observationsUsed).toBe(10);
    expect(result.months.map((m) => m.calendarMonth)).toEqual([1, 7]);
  });

  it("orders the monthly march by calendar month and carries per-month means", () => {
    const observations = [
      ...monthYears(7, [294, 296, 298, 300, 302]),
      ...monthYears(1, [270, 270.5, 271, 271.5, 272]),
    ];

    const result = describeAirTemperatureSeasonalVariability(
      observations,
      AVAILABLE_THROUGH
    );

    expect(result.months.map((m) => m.calendarMonth)).toEqual([1, 7]);
    const january = result.months.find((m) => m.calendarMonth === 1);
    expect(january?.meanKelvin).toBeCloseTo(271, 10);
    expect(january?.yearCount).toBe(5);
    expect(january?.qualified).toBe(true);
  });

  it("keeps only the first value for a duplicated (calendar month, year)", () => {
    const observations = [
      ...monthYears(1, [270, 270.5, 271, 271.5, 272]),
      // A re-supplied January 2018 must not enter the spread.
      air(400, 1, 2018),
    ];

    const result = describeAirTemperatureSeasonalVariability(
      observations,
      AVAILABLE_THROUGH
    );

    expect(result.exclusions.duplicateYearMonth).toBe(1);
    const january = result.months.find((m) => m.calendarMonth === 1);
    expect(january?.yearCount).toBe(5);
    expect(january?.meanKelvin).toBeCloseTo(271, 10);
  });

  it("does not let another metric leak into a temperature spread", () => {
    const observations: MonthlyClimateObservation[] = [
      ...monthYears(1, [270, 270.5, 271, 271.5, 272]),
      {
        metricId: "precipitation-rate",
        dataMonth: { year: 2018, month: 1 },
        value: 0.0001,
      },
    ];

    const result = describeAirTemperatureSeasonalVariability(
      observations,
      AVAILABLE_THROUGH
    );

    expect(result.exclusions.wrongMetric).toBe(1);
    const january = result.months.find((m) => m.calendarMonth === 1);
    expect(january?.yearCount).toBe(5);
  });

  it("requires enough distinct years before a month qualifies", () => {
    // Four years is below the five-year floor: no month qualifies.
    const observations = [
      ...monthYears(1, [270, 270.5, 271, 271.5]),
      ...monthYears(7, [294, 296, 298, 300]),
    ];

    const result = describeAirTemperatureSeasonalVariability(
      observations,
      AVAILABLE_THROUGH
    );

    expect(result.status).toBe("insufficient-qualified-months");
    expect(result.qualifiedMonthCount).toBe(0);
    expect(result.mostVariableMonth).toBeNull();
    expect(result.variabilitySpreadKelvin).toBeNull();
    // A sub-two-year month still reports a null spread rather than throwing.
    expect(
      result.months.every((m) => m.sampleStandardDeviationKelvin !== null)
    ).toBe(true);
  });

  it("needs at least two qualifying months for a most-vs-least comparison", () => {
    const observations = monthYears(1, [270, 270.5, 271, 271.5, 272]);

    const result = describeAirTemperatureSeasonalVariability(
      observations,
      AVAILABLE_THROUGH
    );

    expect(result.status).toBe("insufficient-qualified-months");
    expect(result.qualifiedMonthCount).toBe(1);
    expect(result.requiredQualifiedMonths).toBe(
      MINIMUM_QUALIFIED_MONTHS_FOR_VARIABILITY
    );
    // The typical spread is still reported over the one qualifying month.
    expect(result.meanSampleStandardDeviationKelvin).toBeCloseTo(
      sampleSd([270, 270.5, 271, 271.5, 272]),
      10
    );
  });

  it("excludes not-yet-published, missing, and low-coverage observations", () => {
    const observations = [
      ...monthYears(1, [270, 270.5, 271, 271.5, 272]),
      // Published, but no usable value.
      air(null, 1, 2023),
      // Below the 60% coverage floor.
      air(271, 1, 2024, { validFraction: 0.2 }),
      // Data month after the availability checkpoint.
      air(271, 1, 2027),
    ];

    const result = describeAirTemperatureSeasonalVariability(
      observations,
      AVAILABLE_THROUGH
    );

    expect(result.exclusions.missing).toBe(1);
    expect(result.exclusions.insufficientCoverage).toBe(1);
    expect(result.exclusions.notYetPublished).toBe(1);
    const january = result.months.find((m) => m.calendarMonth === 1);
    expect(january?.yearCount).toBe(5);
  });

  it("returns no-usable-observations when nothing survives filtering", () => {
    const result = describeAirTemperatureSeasonalVariability(
      [air(null, 1, 2018)],
      AVAILABLE_THROUGH
    );

    expect(result.status).toBe("no-usable-observations");
    expect(result.months).toEqual([]);
    expect(result.qualifiedMonthCount).toBe(0);
    expect(result.reason).toBe("no-usable-air-temperature-observations");
  });

  it("rejects an invalid configuration", () => {
    const result = describeAirTemperatureSeasonalVariability(
      monthYears(1, [270, 271, 272, 273, 274]),
      AVAILABLE_THROUGH,
      { minimumYearsPerMonth: 1 }
    );

    expect(result.status).toBe("invalid");
    expect(result.reason).toBe("invalid-configuration");
    expect(result.months).toEqual([]);
  });

  it("resolves ties toward the earliest calendar month", () => {
    // January and July share an identical spread; February is tighter.
    const shared = [270, 271, 272, 273, 274];
    const tight = [280, 280.5, 281, 281.5, 282];
    const observations = [
      ...monthYears(7, shared),
      ...monthYears(1, shared),
      ...monthYears(2, tight),
    ];

    const result = describeAirTemperatureSeasonalVariability(
      observations,
      AVAILABLE_THROUGH
    );

    // Most-variable tie between Jan and Jul resolves to January.
    expect(result.mostVariableMonth?.calendarMonth).toBe(1);
    expect(result.leastVariableMonth?.calendarMonth).toBe(2);
  });

  it("uses the documented defaults", () => {
    expect(MINIMUM_YEARS_PER_VARIABILITY_MONTH).toBe(5);
    expect(MINIMUM_QUALIFIED_MONTHS_FOR_VARIABILITY).toBe(2);
    expect(AIR_TEMPERATURE_SEASONAL_VARIABILITY_LIMITATIONS.length).toBe(5);
  });

  it("formats an available march honestly", () => {
    const observations = [
      ...monthYears(1, [270, 270.5, 271, 271.5, 272]),
      ...monthYears(7, [294, 296, 298, 300, 302]),
    ];

    const text = formatAirTemperatureSeasonalVariability(
      describeAirTemperatureSeasonalVariability(observations, AVAILABLE_THROUGH)
    );

    expect(text).toContain("interannual spread");
    expect(text).toContain("Jan least to Jul most variable");
    expect(text).toContain("not a climate-normal variance");
    // The cited MERRA-2 product code is preserved in the readout.
    expect(text).toContain("M2TMNXSLV");
  });

  it("formats an unavailable march with its reason", () => {
    const text = formatAirTemperatureSeasonalVariability(
      describeAirTemperatureSeasonalVariability([], AVAILABLE_THROUGH)
    );

    expect(text).toContain("No 2 m air-temperature interannual-variability");
    expect(text).toContain("no-usable-air-temperature-observations");
  });
});
