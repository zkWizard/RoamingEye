import { describe, expect, it } from "vitest";
import { CLIMATE_METRICS, type MonthlyClimateObservation } from "./climate";
import { SECONDS_PER_DAY } from "./precipitationAccumulation";
import {
  describePrecipitationAnnualCycle,
  formatPrecipitationAnnualCycle,
  PRECIPITATION_ANNUAL_CYCLE_LIMITATIONS,
} from "./precipitationAnnualCycle";
import type { YearMonth } from "./timeline";

/** Availability checkpoint comfortably after every data month used below. */
const AVAILABLE_THROUGH: YearMonth = { year: 2026, month: 1 };

/**
 * A monsoonal-style base cycle expressed as a mean depth *per day* (mm/day):
 * driest in January, wettest in July. Choosing a per-day depth keeps the monthly
 * accumulation total = depthPerDay × days-in-month, which the integration below
 * reproduces exactly for whole-day month lengths.
 */
const BASE_MM_PER_DAY = [1, 1.5, 2, 3, 5, 8, 12, 10, 6, 3, 2, 1.2] as const;

/** Three distinct years; the base rate is shared so each month's mean is stable. */
const YEARS = [2023, 2024, 2025] as const;

/** Calendar days in a UTC month, honouring leap Februaries. */
function daysIn(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** Convert a mean depth-per-day (mm/day) to the source rate unit (kg/m²/s). */
function rateFromMmPerDay(mmPerDay: number): number {
  return mmPerDay / SECONDS_PER_DAY;
}

/** Expected accumulation (mm) for a base month, integrated exactly as the lib does. */
function expectedMm(mmPerDay: number, year: number, month: number): number {
  return rateFromMmPerDay(mmPerDay) * daysIn(year, month) * SECONDS_PER_DAY;
}

/** Build a usable precipitation-rate observation from a depth-per-day. */
function precip(
  mmPerDay: number | null,
  month: number,
  year: number,
  extra: Partial<MonthlyClimateObservation> = {}
): MonthlyClimateObservation {
  return {
    metricId: "precipitation-rate",
    dataMonth: { year, month },
    value: mmPerDay === null ? null : rateFromMmPerDay(mmPerDay),
    ...extra,
  };
}

/** Three years of every calendar month following the base cycle. */
function fullCycleObservations(): MonthlyClimateObservation[] {
  const observations: MonthlyClimateObservation[] = [];
  for (let month = 1; month <= 12; month++) {
    for (const year of YEARS) {
      observations.push(precip(BASE_MM_PER_DAY[month - 1], month, year));
    }
  }
  return observations;
}

describe("precipitation mean annual cycle", () => {
  it("derives the mean annual cycle and its wettest-to-driest amplitude", () => {
    const cycle = describePrecipitationAnnualCycle(
      fullCycleObservations(),
      AVAILABLE_THROUGH
    );

    expect(cycle).toMatchObject({
      kind: "precipitation-mean-annual-cycle",
      isForecast: false,
      status: "available",
      unit: "mm",
      sourceNativeUnit: "kg/m²/s",
      observationsSupplied: 36,
      observationsUsed: 36,
      calendarMonthsCovered: 12,
      reason: null,
    });
    expect(cycle.monthlyClimatology).toHaveLength(12);

    // July (12 mm/day, 31-day month) is wettest; January (1 mm/day, 31 days) driest.
    const julyMm = expectedMm(12, 2024, 7); // 31-day month, stable across years
    const janMm = expectedMm(1, 2024, 1);
    expect(cycle.wettestMonth?.calendarMonth).toBe(7);
    expect(cycle.wettestMonth?.meanMm).toBeCloseTo(julyMm, 6);
    expect(cycle.driestMonth?.calendarMonth).toBe(1);
    expect(cycle.driestMonth?.meanMm).toBeCloseTo(janMm, 6);
    expect(cycle.amplitudeMm).toBeCloseTo(julyMm - janMm, 6);
  });

  it("integrates each rate to a depth and averages over distinct years with min/max", () => {
    const cycle = describePrecipitationAnnualCycle(
      fullCycleObservations(),
      AVAILABLE_THROUGH
    );

    // July is a 31-day month in every year, so mean == min == max exactly.
    const july = cycle.monthlyClimatology.find((m) => m.calendarMonth === 7);
    expect(july?.yearsUsed).toBe(3);
    expect(july?.meanMm).toBeCloseTo(expectedMm(12, 2024, 7), 6);
    expect(july?.minMm).toBeCloseTo(july?.meanMm ?? NaN, 6);
    expect(july?.maxMm).toBeCloseTo(july?.meanMm ?? NaN, 6);

    // February spans a leap year (2024, 29 days) so its total varies by year:
    // the mean sits above the 28-day totals and below the 29-day total.
    const feb = cycle.monthlyClimatology.find((m) => m.calendarMonth === 2);
    const feb28 = expectedMm(1.5, 2023, 2); // 28 days
    const feb29 = expectedMm(1.5, 2024, 2); // 29 days
    expect(feb?.minMm).toBeCloseTo(feb28, 6);
    expect(feb?.maxMm).toBeCloseTo(feb29, 6);
    expect(feb?.meanMm).toBeCloseTo((feb28 + feb28 + feb29) / 3, 6);

    // Climatology is sorted January -> December for auditability.
    expect(cycle.monthlyClimatology.map((m) => m.calendarMonth)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12,
    ]);
  });

  it("preserves the cited GLDAS metric and dataset provenance", () => {
    const cycle = describePrecipitationAnnualCycle(
      fullCycleObservations(),
      AVAILABLE_THROUGH
    );

    expect(cycle.metric).toBe(CLIMATE_METRICS["precipitation-rate"]);
    expect(cycle.source).toBe(CLIMATE_METRICS["precipitation-rate"].source);
    expect(cycle.limitations).toBe(PRECIPITATION_ANNUAL_CYCLE_LIMITATIONS);
    expect(cycle.limitations.length).toBeGreaterThan(0);
  });

  it("keeps only one value per distinct year and calendar month", () => {
    const observations = fullCycleObservations();
    // A duplicate 2024 July that must not change the mean or inflate the count.
    observations.push(precip(400, 7, 2024));
    const cycle = describePrecipitationAnnualCycle(
      observations,
      AVAILABLE_THROUGH
    );

    expect(cycle.exclusions.duplicateYearMonth).toBe(1);
    expect(cycle.observationsUsed).toBe(36);
    expect(cycle.wettestMonth?.calendarMonth).toBe(7);
    expect(cycle.wettestMonth?.meanMm).toBeCloseTo(expectedMm(12, 2024, 7), 6);
  });

  it("reports insufficient coverage without an amplitude when a month is missing", () => {
    // Drop every December observation, leaving only 11 covered months.
    const observations = fullCycleObservations().filter(
      (o) => o.dataMonth.month !== 12
    );
    const cycle = describePrecipitationAnnualCycle(
      observations,
      AVAILABLE_THROUGH
    );

    expect(cycle.status).toBe("insufficient-monthly-coverage");
    expect(cycle.calendarMonthsCovered).toBe(11);
    expect(cycle.amplitudeMm).toBeNull();
    expect(cycle.wettestMonth).toBeNull();
    expect(cycle.driestMonth).toBeNull();
    // The months it does have are still exposed.
    expect(cycle.monthlyClimatology).toHaveLength(11);
    expect(cycle.reason).toBe("not-all-calendar-months-covered");
  });

  it("requires the year floor per calendar month", () => {
    // Only two years for July; every other month has three.
    const observations = fullCycleObservations().filter(
      (o) => !(o.dataMonth.month === 7 && o.dataMonth.year === 2025)
    );
    const cycle = describePrecipitationAnnualCycle(
      observations,
      AVAILABLE_THROUGH
    );

    expect(cycle.status).toBe("insufficient-monthly-coverage");
    expect(cycle.calendarMonthsCovered).toBe(11);
    expect(cycle.monthlyClimatology.some((m) => m.calendarMonth === 7)).toBe(
      false
    );
  });

  it("honors a custom minimum-years-per-month floor", () => {
    const observations = fullCycleObservations().filter(
      (o) => !(o.dataMonth.month === 7 && o.dataMonth.year === 2025)
    );
    const cycle = describePrecipitationAnnualCycle(
      observations,
      AVAILABLE_THROUGH,
      { minimumYearsPerMonth: 2 }
    );

    expect(cycle.status).toBe("available");
    expect(cycle.calendarMonthsCovered).toBe(12);
    const july = cycle.monthlyClimatology.find((m) => m.calendarMonth === 7);
    expect(july?.yearsUsed).toBe(2);
  });

  it("excludes other metrics rather than mixing them into the range", () => {
    const observations: MonthlyClimateObservation[] = [
      ...fullCycleObservations(),
      {
        metricId: "air-temperature-2m",
        dataMonth: { year: 2024, month: 7 },
        value: 300,
      },
      {
        metricId: "soil-moisture",
        dataMonth: { year: 2024, month: 1 },
        value: 12,
      },
    ];
    const cycle = describePrecipitationAnnualCycle(
      observations,
      AVAILABLE_THROUGH
    );

    expect(cycle.exclusions.wrongMetric).toBe(2);
    expect(cycle.status).toBe("available");
    expect(cycle.observationsUsed).toBe(36);
  });

  it("excludes not-yet-published, missing, invalid, and low-coverage months", () => {
    const observations: MonthlyClimateObservation[] = [
      ...fullCycleObservations(),
      // Not yet published relative to AVAILABLE_THROUGH (2026-01).
      precip(4, 6, 2027),
      // Published month with no usable value.
      precip(null, 6, 2022),
      // A negative (nonphysical) precipitation rate is invalid.
      precip(-2, 6, 2021),
      // Coverage below the default 0.6 floor.
      precip(4, 6, 2020, { validFraction: 0.4 }),
    ];
    const cycle = describePrecipitationAnnualCycle(
      observations,
      AVAILABLE_THROUGH
    );

    expect(cycle.exclusions.notYetPublished).toBe(1);
    expect(cycle.exclusions.missing).toBe(1);
    expect(cycle.exclusions.invalid).toBe(1);
    expect(cycle.exclusions.insufficientCoverage).toBe(1);
    // None of those altered June's clean three-year mean.
    const june = cycle.monthlyClimatology.find((m) => m.calendarMonth === 6);
    expect(june?.yearsUsed).toBe(3);
    expect(june?.meanMm).toBeCloseTo(expectedMm(8, 2024, 6), 6);
  });

  it("returns no-usable-observations when nothing meets the floor", () => {
    const cycle = describePrecipitationAnnualCycle(
      [precip(3, 1, 2024), precip(3, 1, 2025)],
      AVAILABLE_THROUGH
    );

    expect(cycle.status).toBe("no-usable-observations");
    expect(cycle.calendarMonthsCovered).toBe(0);
    expect(cycle.amplitudeMm).toBeNull();
    expect(cycle.monthlyClimatology).toEqual([]);
    expect(cycle.reason).toBe("no-calendar-month-met-year-floor");
  });

  it("rejects an invalid configuration", () => {
    const zeroYears = describePrecipitationAnnualCycle(
      fullCycleObservations(),
      AVAILABLE_THROUGH,
      { minimumYearsPerMonth: 0 }
    );
    expect(zeroYears.status).toBe("invalid");
    expect(zeroYears.reason).toBe("invalid-configuration");

    const badFraction = describePrecipitationAnnualCycle(
      fullCycleObservations(),
      AVAILABLE_THROUGH,
      { minimumValidFraction: 1.5 }
    );
    expect(badFraction.status).toBe("invalid");
  });

  it("treats a bone-dry (zero-rate) month as a real, usable observation", () => {
    // A genuine zero total is data, not absence: it should count and can be
    // the driest month, unlike a null (no-data) value.
    const observations = fullCycleObservations().map((o) =>
      o.dataMonth.month === 1
        ? precip(0, o.dataMonth.month, o.dataMonth.year)
        : o
    );
    const cycle = describePrecipitationAnnualCycle(
      observations,
      AVAILABLE_THROUGH
    );

    expect(cycle.status).toBe("available");
    const january = cycle.monthlyClimatology.find((m) => m.calendarMonth === 1);
    expect(january?.yearsUsed).toBe(3);
    expect(january?.meanMm).toBe(0);
    expect(cycle.driestMonth).toEqual({ calendarMonth: 1, meanMm: 0 });
  });

  it("resolves wettest/driest ties to the earlier calendar month", () => {
    const observations: MonthlyClimateObservation[] = [];
    // Every month shares the same per-day depth, so each month's total depth
    // differs only by its length: the seven 31-day months tie for the maximum
    // total and February (shortest) is uniquely the minimum. The wettest tie
    // must resolve deterministically to the earliest such month (January).
    for (let month = 1; month <= 12; month++) {
      for (const year of YEARS) {
        observations.push(precip(5, month, year));
      }
    }
    const cycle = describePrecipitationAnnualCycle(
      observations,
      AVAILABLE_THROUGH
    );

    expect(cycle.status).toBe("available");
    // Totals differ only by month length; the 31-day months share the maximum
    // total and the tie resolves to the earliest such month (January).
    expect(cycle.wettestMonth?.calendarMonth).toBe(1);
    // February (shortest) is the unique driest month.
    expect(cycle.driestMonth?.calendarMonth).toBe(2);
  });
});

describe("formatPrecipitationAnnualCycle", () => {
  it("reads out the amplitude with wettest and driest months", () => {
    const cycle = describePrecipitationAnnualCycle(
      fullCycleObservations(),
      AVAILABLE_THROUGH
    );
    const text = formatPrecipitationAnnualCycle(cycle);

    expect(text).toContain("Mean annual precipitation range");
    expect(text).toContain("Jul wettest");
    expect(text).toContain("Jan driest");
    expect(text).toContain("not a climate normal or extreme range");
    expect(text).toContain(
      CLIMATE_METRICS["precipitation-rate"].source.shortName
    );
  });

  it("explains when no full cycle is available", () => {
    const cycle = describePrecipitationAnnualCycle(
      [precip(3, 1, 2024)],
      AVAILABLE_THROUGH
    );
    const text = formatPrecipitationAnnualCycle(cycle);

    expect(text).toContain("No mean annual precipitation cycle");
    expect(text).toContain("0/12 calendar months covered");
  });
});
