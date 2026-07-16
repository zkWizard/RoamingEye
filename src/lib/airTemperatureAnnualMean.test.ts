import { describe, expect, it } from "vitest";
import { CLIMATE_METRICS, type MonthlyClimateObservation } from "./climate";
import { describeAirTemperatureAnnualCycle } from "./airTemperatureSeasonalCycle";
import {
  AIR_TEMPERATURE_ANNUAL_MEAN_LIMITATIONS,
  ANNUAL_MEAN_STANDARD_YEAR_DAYS,
  annualMeanFromCycle,
  describeAirTemperatureAnnualMean,
  formatAirTemperatureAnnualMean,
} from "./airTemperatureAnnualMean";
import type { YearMonth } from "./timeline";

/** Availability checkpoint comfortably after every data month used below. */
const AVAILABLE_THROUGH: YearMonth = { year: 2026, month: 1 };

/** Northern-hemisphere-style base monthly means, coldest Jan, warmest Jul. */
const BASE_MEAN_K = [
  270, 272, 278, 284, 290, 295, 298, 297, 291, 284, 277, 272,
] as const;

/** Per-year offsets so each month's mean equals its base exactly (mean 0). */
const YEAR_OFFSETS: ReadonlyArray<{ year: number; offset: number }> = [
  { year: 2023, offset: -0.5 },
  { year: 2024, offset: 0 },
  { year: 2025, offset: 0.5 },
];

/** Unweighted mean of the twelve base monthly means: 3408 / 12 = 284 K exactly. */
const EXPECTED_UNWEIGHTED_K = 284;

/**
 * Day-weighted mean over the fixed 365-day standard year. Σ(dₘ·Tₘ) = 103685, so
 * the mean is 103685/365 = 284 + 25/365 K — cold February (272 K) is
 * down-weighted from 1/12 to 28/365, nudging the day-weighted mean slightly
 * above the unweighted one.
 */
const EXPECTED_DAY_WEIGHTED_BIAS_K = 25 / 365;

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

/** Three years of every calendar month following the base cycle. */
function fullCycleObservations(): MonthlyClimateObservation[] {
  const observations: MonthlyClimateObservation[] = [];
  for (let month = 1; month <= 12; month++) {
    for (const { year, offset } of YEAR_OFFSETS) {
      observations.push(air(BASE_MEAN_K[month - 1] + offset, month, year));
    }
  }
  return observations;
}

describe("air-temperature mean annual temperature (BIO1)", () => {
  it("derives the unweighted BIO1 mean and its day-weighted companion", () => {
    const profile = describeAirTemperatureAnnualMean(
      fullCycleObservations(),
      AVAILABLE_THROUGH
    );

    expect(profile).toMatchObject({
      kind: "air-temperature-annual-mean",
      isForecast: false,
      status: "available",
      nativeUnit: "K",
      standardYearDays: ANNUAL_MEAN_STANDARD_YEAR_DAYS,
      calendarMonthsCovered: 12,
      observationsUsed: 36,
      reason: null,
    });
    expect(profile.meanAnnualKelvin).toBe(EXPECTED_UNWEIGHTED_K);
    expect(profile.meanAnnualCelsius).toBeCloseTo(284 - 273.15, 9);
    expect(profile.dayWeightedMeanKelvin).toBeCloseTo(
      EXPECTED_UNWEIGHTED_K + EXPECTED_DAY_WEIGHTED_BIAS_K,
      9
    );
    expect(profile.dayWeightedMeanCelsius).toBeCloseTo(
      284 + EXPECTED_DAY_WEIGHTED_BIAS_K - 273.15,
      9
    );
    // Bias is small but positive: February's cold mean is down-weighted.
    expect(profile.weightingBiasKelvin).toBeCloseTo(
      EXPECTED_DAY_WEIGHTED_BIAS_K,
      9
    );
    expect(profile.weightingBiasKelvin).toBeGreaterThan(0);
  });

  it("exposes the covered monthly means and their day weights, Jan→Dec", () => {
    const profile = describeAirTemperatureAnnualMean(
      fullCycleObservations(),
      AVAILABLE_THROUGH
    );

    expect(profile.monthlyContributions).toHaveLength(12);
    expect(profile.monthlyContributions.map((m) => m.calendarMonth)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12,
    ]);
    // February carries 28 standard-year days, July 31.
    expect(profile.monthlyContributions[1]).toEqual({
      calendarMonth: 2,
      meanKelvin: 272,
      monthDays: 28,
    });
    expect(profile.monthlyContributions[6]).toEqual({
      calendarMonth: 7,
      meanKelvin: 298,
      monthDays: 31,
    });
    // The day weights sum to the standard year.
    const totalDays = profile.monthlyContributions.reduce(
      (sum, m) => sum + m.monthDays,
      0
    );
    expect(totalDays).toBe(ANNUAL_MEAN_STANDARD_YEAR_DAYS);
  });

  it("preserves the cited MERRA-2 metric and dataset provenance", () => {
    const profile = describeAirTemperatureAnnualMean(
      fullCycleObservations(),
      AVAILABLE_THROUGH
    );

    expect(profile.metric).toBe(CLIMATE_METRICS["air-temperature-2m"]);
    expect(profile.source).toBe(CLIMATE_METRICS["air-temperature-2m"].source);
    expect(profile.limitations).toBe(AIR_TEMPERATURE_ANNUAL_MEAN_LIMITATIONS);
    expect(profile.limitations.length).toBeGreaterThan(0);
  });

  it("matches annualMeanFromCycle on the same cycle", () => {
    const observations = fullCycleObservations();
    const cycle = describeAirTemperatureAnnualCycle(
      observations,
      AVAILABLE_THROUGH
    );
    const fromCycle = annualMeanFromCycle(cycle);
    const fromObservations = describeAirTemperatureAnnualMean(
      observations,
      AVAILABLE_THROUGH
    );

    expect(fromCycle).toEqual(fromObservations);
  });

  it("withholds the mean but exposes covered months for a partial cycle", () => {
    // Drop every December observation, leaving only 11 covered months.
    const observations = fullCycleObservations().filter(
      (o) => o.dataMonth.month !== 12
    );
    const profile = describeAirTemperatureAnnualMean(
      observations,
      AVAILABLE_THROUGH
    );

    expect(profile.status).toBe("insufficient-monthly-coverage");
    expect(profile.calendarMonthsCovered).toBe(11);
    expect(profile.meanAnnualKelvin).toBeNull();
    expect(profile.meanAnnualCelsius).toBeNull();
    expect(profile.dayWeightedMeanKelvin).toBeNull();
    expect(profile.dayWeightedMeanCelsius).toBeNull();
    expect(profile.weightingBiasKelvin).toBeNull();
    // The months it does have are still exposed.
    expect(profile.monthlyContributions).toHaveLength(11);
    expect(profile.reason).toBe("not-all-calendar-months-covered");
  });

  it("returns no-usable-observations when nothing meets the floor", () => {
    const profile = describeAirTemperatureAnnualMean(
      [air(288, 1, 2024), air(289, 1, 2025)],
      AVAILABLE_THROUGH
    );

    expect(profile.status).toBe("no-usable-observations");
    expect(profile.calendarMonthsCovered).toBe(0);
    expect(profile.meanAnnualKelvin).toBeNull();
    expect(profile.monthlyContributions).toEqual([]);
    expect(profile.reason).toBe("no-calendar-month-met-year-floor");
  });

  it("propagates an invalid configuration from the underlying cycle", () => {
    const profile = describeAirTemperatureAnnualMean(
      fullCycleObservations(),
      AVAILABLE_THROUGH,
      { minimumYearsPerMonth: 0 }
    );

    expect(profile.status).toBe("invalid");
    expect(profile.meanAnnualKelvin).toBeNull();
    expect(profile.reason).toBe("invalid-configuration");
  });
});

describe("formatAirTemperatureAnnualMean", () => {
  it("reads out BIO1 in K and °C with the day-weighting bias", () => {
    const profile = describeAirTemperatureAnnualMean(
      fullCycleObservations(),
      AVAILABLE_THROUGH
    );
    const text = formatAirTemperatureAnnualMean(profile);

    expect(text).toContain(
      "Mean annual 2 m air temperature (WorldClim BIO1) 284 K"
    );
    expect(text).toContain("(10.85 °C)");
    expect(text).toContain("day-weighting bias");
    expect(text).toContain("not a 30-year normal");
    expect(text).toContain(
      CLIMATE_METRICS["air-temperature-2m"].source.shortName
    );
  });

  it("explains when no full cycle is available", () => {
    const profile = describeAirTemperatureAnnualMean(
      [air(288, 1, 2024)],
      AVAILABLE_THROUGH
    );
    const text = formatAirTemperatureAnnualMean(profile);

    expect(text).toContain("No mean annual 2 m air temperature");
    expect(text).toContain("0/12 calendar months covered");
  });
});
