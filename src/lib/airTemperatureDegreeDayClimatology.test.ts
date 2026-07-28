import { describe, expect, it } from "vitest";
import type { MonthlyClimateObservation } from "./climate";
import { describeAirTemperatureAnnualCycle } from "./airTemperatureSeasonalCycle";
import {
  DEFAULT_DEGREE_DAY_BASE_C,
  KELVIN_TO_CELSIUS_OFFSET,
} from "./degreeDays";
import {
  AIR_TEMPERATURE_DEGREE_DAY_CLIMATOLOGY_LIMITATIONS,
  STANDARD_YEAR_DAYS,
  STANDARD_YEAR_MONTH_DAYS,
  degreeDayClimatologyFromCycle,
  describeAirTemperatureDegreeDayClimatology,
  formatAirTemperatureDegreeDayClimatology,
} from "./airTemperatureDegreeDayClimatology";
import type { YearMonth } from "./timeline";

/** Availability checkpoint comfortably after every data month used below. */
const AVAILABLE_THROUGH: YearMonth = { year: 2026, month: 1 };

/** Northern-hemisphere-style base monthly means, coldest Jan, warmest Jul (K). */
const BASE_MEAN_K = [
  270, 272, 278, 284, 290, 295, 298, 297, 291, 284, 277, 272,
] as const;

/** Three distinct years so each calendar month clears the years-per-month floor. */
const YEARS = [2023, 2024, 2025] as const;

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

/** Three years of every calendar month; each month's mean equals its base. */
function fullCycleObservations(): MonthlyClimateObservation[] {
  const observations: MonthlyClimateObservation[] = [];
  for (let month = 1; month <= 12; month++) {
    for (const year of YEARS) {
      observations.push(air(BASE_MEAN_K[month - 1], month, year));
    }
  }
  return observations;
}

/** Independent reference totals straight from the definition, for a base in °C. */
function expectedTotals(baseC: number): { hdd: number; cdd: number } {
  let hdd = 0;
  let cdd = 0;
  for (let month = 1; month <= 12; month++) {
    const meanC = BASE_MEAN_K[month - 1] - KELVIN_TO_CELSIUS_OFFSET;
    const days = STANDARD_YEAR_MONTH_DAYS[month - 1];
    hdd += days * Math.max(0, baseC - meanC);
    cdd += days * Math.max(0, meanC - baseC);
  }
  return { hdd, cdd };
}

describe("air-temperature annual degree-day climatology", () => {
  it("sums the mean cycle's day-weighted deficit and excess against the 18 °C base", () => {
    const profile = describeAirTemperatureDegreeDayClimatology(
      fullCycleObservations(),
      AVAILABLE_THROUGH
    );
    const expected = expectedTotals(DEFAULT_DEGREE_DAY_BASE_C);

    expect(profile).toMatchObject({
      kind: "air-temperature-annual-degree-day-climatology",
      isForecast: false,
      status: "available",
      unit: "°C·day",
      baseTemperatureC: 18,
      standardYearDays: 365,
      calendarMonthsCovered: 12,
      observationsUsed: 36,
      reason: null,
    });
    expect(profile.annualHeatingDegreeDays).toBeCloseTo(expected.hdd, 6);
    expect(profile.annualCoolingDegreeDays).toBeCloseTo(expected.cdd, 6);
    // This cool cycle spends more of the year below 18 °C than above it.
    expect(profile.annualHeatingDegreeDays as number).toBeGreaterThan(
      profile.annualCoolingDegreeDays as number
    );
    expect(profile.monthlyDegreeDays).toHaveLength(12);
  });

  it("keeps HDD and CDD non-negative and splits heating from cooling per month", () => {
    const profile = describeAirTemperatureDegreeDayClimatology(
      fullCycleObservations(),
      AVAILABLE_THROUGH
    );
    for (const month of profile.monthlyDegreeDays) {
      expect(month.heatingDegreeDays).toBeGreaterThanOrEqual(0);
      expect(month.coolingDegreeDays).toBeGreaterThanOrEqual(0);
      // At most one of the two is non-zero for any single month.
      expect(month.heatingDegreeDays > 0 && month.coolingDegreeDays > 0).toBe(
        false
      );
      expect(month.monthDays).toBe(
        STANDARD_YEAR_MONTH_DAYS[month.calendarMonth - 1]
      );
    }
    // July mean 297 K ≈ 23.85 °C is the only month above 18 °C here.
    const july = profile.monthlyDegreeDays.find((m) => m.calendarMonth === 7);
    expect(july?.coolingDegreeDays).toBeGreaterThan(0);
    expect(july?.heatingDegreeDays).toBe(0);
  });

  it("satisfies CDD − HDD = 365 · (day-weighted annual mean − base)", () => {
    // Σ dₘ·max(0,Tₘ−b) − Σ dₘ·max(0,b−Tₘ) = Σ dₘ·(Tₘ−b), an exact identity.
    const profile = describeAirTemperatureDegreeDayClimatology(
      fullCycleObservations(),
      AVAILABLE_THROUGH
    );
    let dayWeightedSumC = 0;
    for (let month = 1; month <= 12; month++) {
      const meanC = BASE_MEAN_K[month - 1] - KELVIN_TO_CELSIUS_OFFSET;
      dayWeightedSumC += STANDARD_YEAR_MONTH_DAYS[month - 1] * meanC;
    }
    const net =
      dayWeightedSumC - DEFAULT_DEGREE_DAY_BASE_C * STANDARD_YEAR_DAYS;
    expect(
      (profile.annualCoolingDegreeDays as number) -
        (profile.annualHeatingDegreeDays as number)
    ).toBeCloseTo(net, 6);
  });

  it("reports pure heating on an all-cold cycle and pure cooling on an all-warm one", () => {
    const cold: MonthlyClimateObservation[] = [];
    const warm: MonthlyClimateObservation[] = [];
    for (let month = 1; month <= 12; month++) {
      for (const year of YEARS) {
        cold.push(air(260, month, year)); // ≈ −13 °C, always below base
        warm.push(air(300, month, year)); // ≈ 26.85 °C, always above base
      }
    }

    const coldProfile = describeAirTemperatureDegreeDayClimatology(
      cold,
      AVAILABLE_THROUGH
    );
    expect(coldProfile.annualCoolingDegreeDays).toBe(0);
    expect(coldProfile.annualHeatingDegreeDays).toBeCloseTo(
      STANDARD_YEAR_DAYS *
        (DEFAULT_DEGREE_DAY_BASE_C - (260 - KELVIN_TO_CELSIUS_OFFSET)),
      6
    );

    const warmProfile = describeAirTemperatureDegreeDayClimatology(
      warm,
      AVAILABLE_THROUGH
    );
    expect(warmProfile.annualHeatingDegreeDays).toBe(0);
    expect(warmProfile.annualCoolingDegreeDays).toBeCloseTo(
      STANDARD_YEAR_DAYS *
        (300 - KELVIN_TO_CELSIUS_OFFSET - DEFAULT_DEGREE_DAY_BASE_C),
      6
    );
  });

  it("honours a custom base temperature", () => {
    const profile = describeAirTemperatureDegreeDayClimatology(
      fullCycleObservations(),
      AVAILABLE_THROUGH,
      { baseC: 10 }
    );
    const expected = expectedTotals(10);

    expect(profile.baseTemperatureC).toBe(10);
    expect(profile.annualHeatingDegreeDays).toBeCloseTo(expected.hdd, 6);
    expect(profile.annualCoolingDegreeDays).toBeCloseTo(expected.cdd, 6);
    // A lower base shifts the balance toward cooling relative to the default.
    const dflt = describeAirTemperatureDegreeDayClimatology(
      fullCycleObservations(),
      AVAILABLE_THROUGH
    );
    expect(profile.annualCoolingDegreeDays as number).toBeGreaterThan(
      dflt.annualCoolingDegreeDays as number
    );
  });

  it("rejects a non-finite base temperature as invalid", () => {
    const profile = describeAirTemperatureDegreeDayClimatology(
      fullCycleObservations(),
      AVAILABLE_THROUGH,
      { baseC: Number.NaN }
    );
    expect(profile.status).toBe("invalid");
    expect(profile.annualHeatingDegreeDays).toBeNull();
    expect(profile.annualCoolingDegreeDays).toBeNull();
    expect(profile.monthlyDegreeDays).toEqual([]);
    expect(profile.reason).toBe("invalid-base-temperature");
  });

  it("emits no annual totals but exposes covered months on a partial cycle", () => {
    // Only January through September supplied: the annual cycle is incomplete.
    const partial: MonthlyClimateObservation[] = [];
    for (let month = 1; month <= 9; month++) {
      for (const year of YEARS)
        partial.push(air(BASE_MEAN_K[month - 1], month, year));
    }
    const profile = describeAirTemperatureDegreeDayClimatology(
      partial,
      AVAILABLE_THROUGH
    );

    expect(profile.status).toBe("insufficient-monthly-coverage");
    expect(profile.annualHeatingDegreeDays).toBeNull();
    expect(profile.annualCoolingDegreeDays).toBeNull();
    expect(profile.reason).toBe("not-all-calendar-months-covered");
    expect(profile.calendarMonthsCovered).toBe(9);
    // The nine months in hand are still exposed, in Jan→Dec order.
    expect(profile.monthlyDegreeDays).toHaveLength(9);
    expect(profile.monthlyDegreeDays.map((m) => m.calendarMonth)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9,
    ]);
  });

  it("propagates the no-usable-observations status with no months", () => {
    const profile = describeAirTemperatureDegreeDayClimatology(
      [],
      AVAILABLE_THROUGH
    );
    expect(profile.status).toBe("no-usable-observations");
    expect(profile.annualHeatingDegreeDays).toBeNull();
    expect(profile.annualCoolingDegreeDays).toBeNull();
    expect(profile.monthlyDegreeDays).toEqual([]);
    expect(profile.calendarMonthsCovered).toBe(0);
  });

  it("does not mix a non-temperature metric into the totals", () => {
    const observations = fullCycleObservations();
    observations.push({
      metricId: "precipitation-rate",
      dataMonth: { year: 2024, month: 7 },
      value: 999,
    });
    const profile = describeAirTemperatureDegreeDayClimatology(
      observations,
      AVAILABLE_THROUGH
    );
    const expected = expectedTotals(DEFAULT_DEGREE_DAY_BASE_C);

    expect(profile.status).toBe("available");
    expect(profile.annualHeatingDegreeDays).toBeCloseTo(expected.hdd, 6);
    expect(profile.annualCoolingDegreeDays).toBeCloseTo(expected.cdd, 6);
  });

  it("passes cycle options through to the underlying cycle", () => {
    const twoYears: MonthlyClimateObservation[] = [];
    for (let month = 1; month <= 12; month++) {
      for (const year of [2023, 2024]) {
        twoYears.push(air(BASE_MEAN_K[month - 1], month, year));
      }
    }

    expect(
      describeAirTemperatureDegreeDayClimatology(twoYears, AVAILABLE_THROUGH)
        .status
    ).toBe("no-usable-observations");
    const relaxed = describeAirTemperatureDegreeDayClimatology(
      twoYears,
      AVAILABLE_THROUGH,
      { minimumYearsPerMonth: 2 }
    );
    expect(relaxed.status).toBe("available");
    expect(relaxed.annualHeatingDegreeDays).toBeGreaterThan(0);
  });

  it("day-weights each month: the standard year sums to 365 days", () => {
    const total = STANDARD_YEAR_MONTH_DAYS.reduce((sum, d) => sum + d, 0);
    expect(total).toBe(STANDARD_YEAR_DAYS);
  });

  it("derives directly from a supplied cycle via degreeDayClimatologyFromCycle", () => {
    const cycle = describeAirTemperatureAnnualCycle(
      fullCycleObservations(),
      AVAILABLE_THROUGH
    );
    expect(degreeDayClimatologyFromCycle(cycle)).toEqual(
      describeAirTemperatureDegreeDayClimatology(
        fullCycleObservations(),
        AVAILABLE_THROUGH
      )
    );
  });

  it("preserves cited provenance and honest limitations", () => {
    const profile = describeAirTemperatureDegreeDayClimatology(
      fullCycleObservations(),
      AVAILABLE_THROUGH
    );
    expect(profile.source.shortName).toBeTruthy();
    expect(profile.source.version).toBeTruthy();
    expect(profile.limitations).toBe(
      AIR_TEMPERATURE_DEGREE_DAY_CLIMATOLOGY_LIMITATIONS
    );
    expect(profile.limitations.length).toBeGreaterThanOrEqual(5);
  });

  it("formats an available profile and an unavailable one honestly", () => {
    const profile = describeAirTemperatureDegreeDayClimatology(
      fullCycleObservations(),
      AVAILABLE_THROUGH
    );
    const text = formatAirTemperatureDegreeDayClimatology(profile);
    expect(text).toContain("Annual heating degree-days");
    expect(text).toContain("cooling degree-days");
    expect(text).toContain("base 18 °C");
    expect(text).toContain("365-day year");
    expect(text).toContain("lower-bound approximation");

    const partial: MonthlyClimateObservation[] = [];
    for (const year of YEARS) partial.push(air(270, 1, year));
    const unavailable = formatAirTemperatureDegreeDayClimatology(
      describeAirTemperatureDegreeDayClimatology(partial, AVAILABLE_THROUGH)
    );
    expect(unavailable).toContain(
      "No annual 2 m air-temperature degree-day climatology"
    );
    expect(unavailable).toContain("1/12 calendar months covered");
  });
});
