import { describe, expect, it } from "vitest";
import {
  AEROSOL_SOURCE,
  AEROSOL_UNIT,
  AEROSOL_WAVELENGTH_NM,
  type AerosolObservation,
} from "./aerosolLoading";
import {
  AEROSOL_ANNUAL_CYCLE_LIMITATIONS,
  describeAerosolAnnualCycle,
  formatAerosolAnnualCycle,
} from "./aerosolAnnualCycle";
import type { YearMonth } from "./timeline";

/** Availability checkpoint comfortably after every data month used below. */
const AVAILABLE_THROUGH: YearMonth = { year: 2026, month: 1 };

/**
 * Base same-calendar-month AOD means with a clear dust-season shape: clearest in
 * December (0.08), haziest in June (0.42). Amplitude is exactly 0.34.
 */
const BASE_MEAN_AOD = [
  0.12, 0.18, 0.28, 0.36, 0.4, 0.42, 0.38, 0.3, 0.22, 0.16, 0.1, 0.08,
] as const;

/** Per-year offsets so each month's mean equals its base exactly. */
const YEAR_OFFSETS: ReadonlyArray<{ year: number; offset: number }> = [
  { year: 2023, offset: -0.01 },
  { year: 2024, offset: 0 },
  { year: 2025, offset: 0.01 },
];

/** Build a usable aerosol observation. */
function aod(
  value: number | null,
  month: number,
  year: number,
  extra: Partial<AerosolObservation> = {}
): AerosolObservation {
  return {
    dataMonth: { year, month },
    value,
    ...extra,
  };
}

/** Three years of every calendar month following the base cycle. */
function fullCycleObservations(): AerosolObservation[] {
  const observations: AerosolObservation[] = [];
  for (let month = 1; month <= 12; month++) {
    for (const { year, offset } of YEAR_OFFSETS) {
      observations.push(aod(BASE_MEAN_AOD[month - 1] + offset, month, year));
    }
  }
  return observations;
}

describe("aerosol mean annual cycle", () => {
  it("derives the mean annual cycle and its haziest-to-clearest amplitude", () => {
    const cycle = describeAerosolAnnualCycle(
      fullCycleObservations(),
      AVAILABLE_THROUGH
    );

    expect(cycle).toMatchObject({
      kind: "aerosol-mean-annual-cycle",
      isForecast: false,
      status: "available",
      unit: AEROSOL_UNIT,
      wavelengthNm: AEROSOL_WAVELENGTH_NM,
      observationsSupplied: 36,
      observationsUsed: 36,
      calendarMonthsCovered: 12,
      reason: null,
    });
    expect(cycle.monthlyClimatology).toHaveLength(12);
    expect(cycle.haziestMonth?.calendarMonth).toBe(6);
    expect(cycle.haziestMonth?.meanAod).toBeCloseTo(0.42, 9);
    expect(cycle.clearestMonth?.calendarMonth).toBe(12);
    expect(cycle.clearestMonth?.meanAod).toBeCloseTo(0.08, 9);
    expect(cycle.amplitude).toBeCloseTo(0.42 - 0.08, 9);
  });

  it("averages each calendar month across its distinct years with min/max", () => {
    const cycle = describeAerosolAnnualCycle(
      fullCycleObservations(),
      AVAILABLE_THROUGH
    );

    const june = cycle.monthlyClimatology.find((m) => m.calendarMonth === 6);
    expect(june?.calendarMonth).toBe(6);
    expect(june?.yearsUsed).toBe(3);
    expect(june?.meanAod).toBeCloseTo(0.42, 9);
    expect(june?.minAod).toBeCloseTo(0.41, 9);
    expect(june?.maxAod).toBeCloseTo(0.43, 9);
    // Climatology is sorted January -> December for auditability.
    expect(cycle.monthlyClimatology.map((m) => m.calendarMonth)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12,
    ]);
  });

  it("preserves the cited MERRA-2 aerosol dataset provenance", () => {
    const cycle = describeAerosolAnnualCycle(
      fullCycleObservations(),
      AVAILABLE_THROUGH
    );

    expect(cycle.source).toBe(AEROSOL_SOURCE);
    expect(cycle.limitations).toBe(AEROSOL_ANNUAL_CYCLE_LIMITATIONS);
    expect(cycle.limitations.length).toBeGreaterThan(0);
  });

  it("keeps only one value per distinct year and calendar month", () => {
    const observations = fullCycleObservations();
    // A duplicate 2024 June that must not change the mean or inflate the count.
    observations.push(aod(5, 6, 2024));
    const cycle = describeAerosolAnnualCycle(observations, AVAILABLE_THROUGH);

    expect(cycle.exclusions.duplicateYearMonth).toBe(1);
    expect(cycle.observationsUsed).toBe(36);
    expect(cycle.haziestMonth?.calendarMonth).toBe(6);
    expect(cycle.haziestMonth?.meanAod).toBeCloseTo(0.42, 9);
  });

  it("reports insufficient coverage without an amplitude when a month is missing", () => {
    // Drop every June observation, leaving only 11 covered months.
    const observations = fullCycleObservations().filter(
      (o) => o.dataMonth.month !== 6
    );
    const cycle = describeAerosolAnnualCycle(observations, AVAILABLE_THROUGH);

    expect(cycle.status).toBe("insufficient-monthly-coverage");
    expect(cycle.calendarMonthsCovered).toBe(11);
    expect(cycle.amplitude).toBeNull();
    expect(cycle.haziestMonth).toBeNull();
    expect(cycle.clearestMonth).toBeNull();
    // The months it does have are still exposed.
    expect(cycle.monthlyClimatology).toHaveLength(11);
    expect(cycle.reason).toBe("not-all-calendar-months-covered");
  });

  it("requires the year floor per calendar month", () => {
    // Only two years for June; every other month has three.
    const observations = fullCycleObservations().filter(
      (o) => !(o.dataMonth.month === 6 && o.dataMonth.year === 2025)
    );
    const cycle = describeAerosolAnnualCycle(observations, AVAILABLE_THROUGH);

    expect(cycle.status).toBe("insufficient-monthly-coverage");
    expect(cycle.calendarMonthsCovered).toBe(11);
    expect(cycle.monthlyClimatology.some((m) => m.calendarMonth === 6)).toBe(
      false
    );
  });

  it("honors a custom minimum-years-per-month floor", () => {
    const observations = fullCycleObservations().filter(
      (o) => !(o.dataMonth.month === 6 && o.dataMonth.year === 2025)
    );
    const cycle = describeAerosolAnnualCycle(observations, AVAILABLE_THROUGH, {
      minimumYearsPerMonth: 2,
    });

    expect(cycle.status).toBe("available");
    expect(cycle.calendarMonthsCovered).toBe(12);
    const june = cycle.monthlyClimatology.find((m) => m.calendarMonth === 6);
    expect(june?.yearsUsed).toBe(2);
  });

  it("excludes not-yet-published, missing, invalid, and low-coverage months", () => {
    const observations: AerosolObservation[] = [
      ...fullCycleObservations(),
      // Not yet published relative to AVAILABLE_THROUGH (2026-01).
      aod(0.2, 5, 2027),
      // Published month with no usable value.
      aod(null, 5, 2022),
      // Negative AOD is not usable optical thickness.
      aod(-0.1, 5, 2021),
      // Coverage below the default 0.6 floor.
      aod(0.3, 5, 2020, { validFraction: 0.4 }),
    ];
    const cycle = describeAerosolAnnualCycle(observations, AVAILABLE_THROUGH);

    expect(cycle.exclusions.notYetPublished).toBe(1);
    expect(cycle.exclusions.missing).toBe(1);
    expect(cycle.exclusions.invalid).toBe(1);
    expect(cycle.exclusions.insufficientCoverage).toBe(1);
    // None of those altered May's clean three-year mean.
    const may = cycle.monthlyClimatology.find((m) => m.calendarMonth === 5);
    expect(may?.yearsUsed).toBe(3);
    expect(may?.meanAod).toBeCloseTo(0.4, 9);
  });

  it("counts a non-calendar data month as an exclusion", () => {
    const observations: AerosolObservation[] = [
      ...fullCycleObservations(),
      aod(0.2, 13, 2024),
    ];
    const cycle = describeAerosolAnnualCycle(observations, AVAILABLE_THROUGH);

    expect(cycle.exclusions.notCalendarMonth).toBe(1);
    expect(cycle.status).toBe("available");
    expect(cycle.observationsUsed).toBe(36);
  });

  it("returns no-usable-observations when nothing meets the floor", () => {
    const cycle = describeAerosolAnnualCycle(
      [aod(0.2, 1, 2024), aod(0.22, 1, 2025)],
      AVAILABLE_THROUGH
    );

    expect(cycle.status).toBe("no-usable-observations");
    expect(cycle.calendarMonthsCovered).toBe(0);
    expect(cycle.amplitude).toBeNull();
    expect(cycle.monthlyClimatology).toEqual([]);
    expect(cycle.reason).toBe("no-calendar-month-met-year-floor");
  });

  it("rejects an invalid configuration", () => {
    const zeroYears = describeAerosolAnnualCycle(
      fullCycleObservations(),
      AVAILABLE_THROUGH,
      { minimumYearsPerMonth: 0 }
    );
    expect(zeroYears.status).toBe("invalid");
    expect(zeroYears.reason).toBe("invalid-configuration");

    const badFraction = describeAerosolAnnualCycle(
      fullCycleObservations(),
      AVAILABLE_THROUGH,
      { minimumValidFraction: 1.5 }
    );
    expect(badFraction.status).toBe("invalid");
  });

  it("resolves haziest/clearest ties to the earlier calendar month", () => {
    const observations: AerosolObservation[] = [];
    // Every month shares the same mean; haziest and clearest both collapse to Jan.
    for (let month = 1; month <= 12; month++) {
      for (const { year } of YEAR_OFFSETS) {
        observations.push(aod(0.25, month, year));
      }
    }
    const cycle = describeAerosolAnnualCycle(observations, AVAILABLE_THROUGH);

    expect(cycle.status).toBe("available");
    expect(cycle.amplitude).toBe(0);
    expect(cycle.haziestMonth?.calendarMonth).toBe(1);
    expect(cycle.clearestMonth?.calendarMonth).toBe(1);
  });
});

describe("formatAerosolAnnualCycle", () => {
  it("reads out the amplitude with haziest and clearest months", () => {
    const cycle = describeAerosolAnnualCycle(
      fullCycleObservations(),
      AVAILABLE_THROUGH
    );
    const text = formatAerosolAnnualCycle(cycle);

    expect(text).toContain("Mean annual column-AOD (550 nm) range 0.34");
    expect(text).toContain("Jun haziest");
    expect(text).toContain("Dec clearest");
    expect(text).toContain("not a climate normal or extreme range");
    expect(text).toContain(AEROSOL_SOURCE.shortName);
  });

  it("explains when no full cycle is available", () => {
    const cycle = describeAerosolAnnualCycle(
      fullCycleObservations().filter((o) => o.dataMonth.month !== 6),
      AVAILABLE_THROUGH
    );
    const text = formatAerosolAnnualCycle(cycle);

    expect(text).toContain("No mean annual column-AOD cycle");
    expect(text).toContain("11/12 calendar months covered");
    expect(text).toContain(AEROSOL_SOURCE.shortName);
  });
});
