import { describe, expect, it } from "vitest";
import { SEA_SURFACE_TEMPERATURE_METRIC } from "./oceanConditions";
import type { SeaSurfaceTemperatureObservation } from "./oceanConditions";
import {
  MINIMUM_QUALIFIED_MONTHS_FOR_CYCLE,
  MINIMUM_YEARS_PER_CLIMATOLOGICAL_MONTH,
  SST_SEASONAL_CYCLE_LIMITATIONS,
  summarizeSstSeasonalCycle,
} from "./oceanSeasonalCycle";

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
 * `years` open-water observations for one calendar month, oldest to newest, each
 * offset from `baseValue` by `perYearStep` so the yearly spread is controllable.
 */
function monthAcrossYears(
  month: number,
  baseValue: number,
  startYear = 2015,
  years = MINIMUM_YEARS_PER_CLIMATOLOGICAL_MONTH,
  perYearStep = 0
): SeaSurfaceTemperatureObservation[] {
  return Array.from({ length: years }, (_unused, index) =>
    waterMonth(startYear + index, month, baseValue + perYearStep * index)
  );
}

describe("SST calendar-month seasonal cycle", () => {
  it("reports warmest and coldest climatological months and the amplitude", () => {
    const observations = [
      ...monthAcrossYears(2, 12), // February climatology 12 °C
      ...monthAcrossYears(8, 22), // August climatology 22 °C
    ];

    const cycle = summarizeSstSeasonalCycle(observations);

    expect(cycle).toMatchObject({
      kind: "observed-sst-seasonal-cycle",
      isForecast: false,
      claimScope: "descriptive-sea-surface-temperature-only",
      status: "available",
      metric: SEA_SURFACE_TEMPERATURE_METRIC,
      footprint: "water",
      qualifiedMonthCount: 2,
      seasonalAmplitude: 10,
      amplitudeUnit: "°C",
      reason: null,
    });
    expect(cycle.warmestMonth).toMatchObject({
      calendarMonth: 8,
      mean: 22,
      yearCount: 3,
    });
    expect(cycle.coldestMonth).toMatchObject({
      calendarMonth: 2,
      mean: 12,
      yearCount: 3,
    });
    expect(cycle.limitations).toBe(SST_SEASONAL_CYCLE_LIMITATIONS);
  });

  it("averages each calendar month across its supplied years", () => {
    // February means (10, 12, 14) -> 12; August means (20, 22, 24) -> 22.
    const observations = [
      ...monthAcrossYears(2, 10, 2015, 3, 2),
      ...monthAcrossYears(8, 20, 2015, 3, 2),
    ];

    const cycle = summarizeSstSeasonalCycle(observations);

    const february = cycle.months.find((m) => m.calendarMonth === 2);
    expect(february).toMatchObject({
      mean: 12,
      min: 10,
      max: 14,
      yearCount: 3,
    });
    expect(cycle.seasonalAmplitude).toBe(10);
    // Months are ordered by calendar month for stable display.
    expect(cycle.months.map((m) => m.calendarMonth)).toEqual([2, 8]);
  });

  it("keeps SST values in the source unit without display conversion", () => {
    const cycle = summarizeSstSeasonalCycle([
      ...monthAcrossYears(1, 3.5),
      ...monthAcrossYears(7, 3.5),
    ]);

    expect(cycle.status).toBe("available");
    expect(cycle.seasonalAmplitude).toBe(0);
    expect(cycle.amplitudeUnit).toBe(SEA_SURFACE_TEMPERATURE_METRIC.sourceUnit);
  });

  it("needs enough qualifying calendar months before reporting an amplitude", () => {
    // Only one calendar month clears the year threshold.
    const cycle = summarizeSstSeasonalCycle([
      ...monthAcrossYears(8, 22),
      waterMonth(2015, 2, 12),
    ]);

    expect(cycle.status).toBe("insufficient-qualified-months");
    expect(cycle.reason).toBe("too-few-qualified-calendar-months");
    expect(cycle.qualifiedMonthCount).toBe(1);
    expect(cycle.warmestMonth).toBeNull();
    expect(cycle.coldestMonth).toBeNull();
    expect(cycle.seasonalAmplitude).toBeNull();
    // The sparse month is still surfaced for transparency, marked unqualified.
    const february = cycle.months.find((m) => m.calendarMonth === 2);
    expect(february).toMatchObject({ yearCount: 1, qualified: false });
  });

  it("marks a month qualified once it meets the minimum-years threshold", () => {
    const cycle = summarizeSstSeasonalCycle([
      ...monthAcrossYears(2, 12),
      ...monthAcrossYears(8, 22),
    ]);
    for (const month of cycle.months) {
      expect(month.yearCount).toBeGreaterThanOrEqual(
        MINIMUM_YEARS_PER_CLIMATOLOGICAL_MONTH
      );
      expect(month.qualified).toBe(true);
    }
    expect(cycle.requiredQualifiedMonths).toBe(
      MINIMUM_QUALIFIED_MONTHS_FOR_CYCLE
    );
  });

  it("never mixes open-water and land-mixed coastal footprints", () => {
    const coastal = (
      year: number,
      month: number,
      value: number
    ): SeaSurfaceTemperatureObservation => ({
      dataMonth: { year, month },
      value,
      validFraction: 0.95,
      footprint: "land-mixed-coastal",
    });

    // Water dominates, so coastal observations are excluded, not averaged in.
    const cycle = summarizeSstSeasonalCycle([
      ...monthAcrossYears(2, 12),
      ...monthAcrossYears(8, 22),
      coastal(2015, 2, 40),
      coastal(2016, 8, 40),
    ]);

    expect(cycle.footprint).toBe("water");
    expect(cycle.exclusions.footprintMismatch).toBe(2);
    expect(cycle.warmestMonth?.mean).toBe(22);
    expect(cycle.coldestMonth?.mean).toBe(12);
  });

  it("honours an explicit coastal footprint request", () => {
    const coastal = (
      year: number,
      month: number,
      value: number
    ): SeaSurfaceTemperatureObservation => ({
      dataMonth: { year, month },
      value,
      validFraction: 0.95,
      footprint: "land-mixed-coastal",
    });

    const cycle = summarizeSstSeasonalCycle(
      [
        ...monthAcrossYears(2, 12),
        coastal(2015, 2, 15),
        coastal(2016, 2, 15),
        coastal(2017, 2, 15),
        coastal(2015, 8, 25),
        coastal(2016, 8, 25),
        coastal(2017, 8, 25),
      ],
      { footprint: "land-mixed-coastal" }
    );

    expect(cycle.footprint).toBe("land-mixed-coastal");
    expect(cycle.seasonalAmplitude).toBe(10);
    // The open-water February observations were excluded as a footprint mismatch.
    expect(cycle.exclusions.footprintMismatch).toBe(
      MINIMUM_YEARS_PER_CLIMATOLOGICAL_MONTH
    );
  });

  it("deduplicates a repeated calendar-month/year so a mean cannot be skewed", () => {
    const cycle = summarizeSstSeasonalCycle([
      ...monthAcrossYears(2, 12),
      ...monthAcrossYears(8, 22),
      waterMonth(2015, 8, 30), // duplicate August 2015; first value kept
    ]);

    expect(cycle.exclusions.duplicateYearMonth).toBe(1);
    expect(cycle.warmestMonth?.mean).toBe(22);
  });

  it("counts coverage exclusions and never uses low-coverage months", () => {
    const cycle = summarizeSstSeasonalCycle([
      ...monthAcrossYears(2, 12),
      ...monthAcrossYears(8, 22),
      waterMonth(2018, 8, 30, 0.2), // below the 0.6 default coverage floor
    ]);

    expect(cycle.exclusions.insufficientCoverage).toBe(1);
    expect(cycle.warmestMonth?.yearCount).toBe(3);
    expect(cycle.warmestMonth?.mean).toBe(22);
  });

  it("counts invalid months and land/missing footprints separately", () => {
    const cycle = summarizeSstSeasonalCycle([
      ...monthAcrossYears(2, 12),
      ...monthAcrossYears(8, 22),
      { dataMonth: { year: 2019, month: 13 }, value: 20, footprint: "water" },
      { dataMonth: { year: 2019, month: 8 }, value: 20, footprint: "land" },
      { dataMonth: { year: 2020, month: 8 }, value: null, footprint: "water" },
    ]);

    expect(cycle.exclusions.invalidMonth).toBe(1);
    // Land + missing value are both footprint mismatches (no usable value).
    expect(cycle.exclusions.footprintMismatch).toBe(2);
    expect(cycle.status).toBe("available");
  });

  it("reports no-usable-observations when nothing carries a usable value", () => {
    const cycle = summarizeSstSeasonalCycle([
      { dataMonth: { year: 2019, month: 8 }, value: 20, footprint: "land" },
      { dataMonth: { year: 2020, month: 8 }, value: null, footprint: "water" },
    ]);

    expect(cycle.status).toBe("no-usable-observations");
    expect(cycle.footprint).toBeNull();
    expect(cycle.seasonalAmplitude).toBeNull();
    expect(cycle.reason).toBe("no-usable-sst-observations");
  });

  it("rejects an invalid configuration without inventing a cycle", () => {
    const observations = [
      ...monthAcrossYears(2, 12),
      ...monthAcrossYears(8, 22),
    ];

    expect(
      summarizeSstSeasonalCycle(observations, { minimumYearsPerMonth: 0 })
        .status
    ).toBe("invalid");
    expect(
      summarizeSstSeasonalCycle(observations, { minimumValidFraction: 1.5 })
        .status
    ).toBe("invalid");
    expect(
      summarizeSstSeasonalCycle(observations, {
        minimumYearsPerMonth: 2.5,
      }).reason
    ).toBe("invalid-cycle-configuration");
  });

  it("breaks warmest/coldest value ties toward the earliest calendar month", () => {
    // Three months share the same mean; the extreme selectors must be stable.
    const cycle = summarizeSstSeasonalCycle([
      ...monthAcrossYears(3, 15),
      ...monthAcrossYears(6, 15),
      ...monthAcrossYears(9, 15),
    ]);

    expect(cycle.status).toBe("available");
    expect(cycle.seasonalAmplitude).toBe(0);
    expect(cycle.warmestMonth?.calendarMonth).toBe(3);
    expect(cycle.coldestMonth?.calendarMonth).toBe(3);
  });

  it("returns an empty, honest summary for no observations", () => {
    const cycle = summarizeSstSeasonalCycle([]);
    expect(cycle.status).toBe("no-usable-observations");
    expect(cycle.months).toEqual([]);
    expect(cycle.qualifiedMonthCount).toBe(0);
  });
});
