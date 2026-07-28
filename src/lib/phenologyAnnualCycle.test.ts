import { describe, expect, it } from "vitest";
import type { NdviMonthlyObservation } from "./phenology";
import {
  CALENDAR_MONTHS_IN_YEAR,
  NDVI_ANNUAL_CYCLE_LIMITATIONS,
  describeNdviAnnualCycle,
  formatNdviAnnualCycle,
} from "./phenologyAnnualCycle";

/** A northern-hemisphere latitude, so season labels are assigned. */
const NORTHERN_LATITUDE = 45;

/** Base monthly means: least green Jan (0.12), greenest Jul (0.82). */
const BASE_NDVI = [
  0.12, 0.15, 0.22, 0.36, 0.55, 0.72, 0.82, 0.78, 0.6, 0.42, 0.25, 0.16,
] as const;

/** Per-year offsets so each month's mean equals its base exactly (mean of 0). */
const YEAR_OFFSETS: ReadonlyArray<{ year: number; offset: number }> = [
  { year: 2023, offset: -0.02 },
  { year: 2024, offset: 0 },
  { year: 2025, offset: 0.02 },
];

/** Build a usable monthly NDVI observation. */
function ndvi(
  value: number | null,
  month: number,
  year: number,
  extra: Partial<NdviMonthlyObservation> = {}
): NdviMonthlyObservation {
  return { month: { year, month }, ndvi: value, ...extra };
}

/** Three years of every calendar month following the base cycle. */
function fullCycleObservations(): NdviMonthlyObservation[] {
  const observations: NdviMonthlyObservation[] = [];
  for (let month = 1; month <= 12; month++) {
    for (const { year, offset } of YEAR_OFFSETS) {
      observations.push(ndvi(BASE_NDVI[month - 1] + offset, month, year));
    }
  }
  return observations;
}

describe("NDVI mean annual cycle", () => {
  it("derives the mean annual cycle and its peak-to-trough amplitude", () => {
    const cycle = describeNdviAnnualCycle(
      fullCycleObservations(),
      NORTHERN_LATITUDE
    );

    expect(cycle).toMatchObject({
      kind: "ndvi-mean-annual-cycle",
      isForecast: false,
      status: "available",
      hemisphere: "northern",
      unit: "NDVI (unitless)",
      observationsSupplied: 36,
      observationsUsed: 36,
      calendarMonthsCovered: 12,
      reason: null,
    });
    expect(cycle.monthlyClimatology).toHaveLength(12);
    expect(cycle.monthlyClimatology[0]).toMatchObject({
      calendarMonth: 1,
      yearsUsed: 3,
      interannualStandardDeviation: expect.closeTo(0.02, 10),
    });
    expect(cycle.greenestMonth).toEqual({
      calendarMonth: 7,
      meteorologicalSeason: "summer",
      meanNdvi: expect.closeTo(0.82, 10),
    });
    expect(cycle.leastGreenMonth).toEqual({
      calendarMonth: 1,
      meteorologicalSeason: "winter",
      meanNdvi: expect.closeTo(0.12, 10),
    });
    expect(cycle.amplitude).toBeCloseTo(0.7, 10);
    expect(cycle.limitations).toBe(NDVI_ANNUAL_CYCLE_LIMITATIONS);
  });

  it("retains the cited NASA MOD13A3 provenance", () => {
    const cycle = describeNdviAnnualCycle(
      fullCycleObservations(),
      NORTHERN_LATITUDE
    );
    expect(cycle.source).toMatchObject({ shortName: expect.any(String) });
    expect(cycle.source.shortName.length).toBeGreaterThan(0);
  });

  it("reports southern-hemisphere season labels for the extremes", () => {
    const cycle = describeNdviAnnualCycle(fullCycleObservations(), -33);
    // Same greenest (Jul) / least-green (Jan) months, mirrored seasons.
    expect(cycle.hemisphere).toBe("southern");
    expect(cycle.greenestMonth?.meteorologicalSeason).toBe("winter");
    expect(cycle.leastGreenMonth?.meteorologicalSeason).toBe("summer");
  });

  it("averages a calendar month over its distinct years", () => {
    const observations = [
      ...fullCycleObservations(),
      // A fourth July, so the mean shifts off the exact base value.
      ndvi(1.0, 7, 2026),
    ];
    const cycle = describeNdviAnnualCycle(observations, NORTHERN_LATITUDE);
    const july = cycle.monthlyClimatology.find((m) => m.calendarMonth === 7);
    expect(july?.yearsUsed).toBe(4);
    // (0.80 + 0.82 + 0.84 + 1.0) / 4 = 0.865
    expect(july?.meanNdvi).toBeCloseTo(0.865, 10);
    expect(july?.minNdvi).toBeCloseTo(0.8, 10);
    expect(july?.maxNdvi).toBeCloseTo(1.0, 10);
  });

  it("counts a repeat (year, month) as a duplicate rather than averaging it twice", () => {
    const observations = [
      ...fullCycleObservations(),
      ndvi(0.99, 7, 2024), // duplicate of the 2024 July already present
    ];
    const cycle = describeNdviAnnualCycle(observations, NORTHERN_LATITUDE);
    const july = cycle.monthlyClimatology.find((m) => m.calendarMonth === 7);
    expect(july?.yearsUsed).toBe(3);
    expect(cycle.exclusions.duplicateYearMonth).toBe(1);
    expect(cycle.greenestMonth?.meanNdvi).toBeCloseTo(0.82, 10);
  });

  it("withholds the amplitude when a calendar month is short of the year floor", () => {
    // Drop every December, leaving only 11 covered calendar months.
    const observations = fullCycleObservations().filter(
      (o) => o.month.month !== 12
    );
    const cycle = describeNdviAnnualCycle(observations, NORTHERN_LATITUDE);
    expect(cycle.status).toBe("insufficient-monthly-coverage");
    expect(cycle.calendarMonthsCovered).toBe(11);
    expect(cycle.greenestMonth).toBeNull();
    expect(cycle.leastGreenMonth).toBeNull();
    expect(cycle.amplitude).toBeNull();
    expect(cycle.reason).toBe("not-all-calendar-months-covered");
    // The eleven covered months are still exposed.
    expect(cycle.monthlyClimatology).toHaveLength(11);
  });

  it("reports no usable observations when nothing meets the year floor", () => {
    // One year only: no calendar month reaches three distinct years.
    const observations: NdviMonthlyObservation[] = [];
    for (let month = 1; month <= 12; month++) {
      observations.push(ndvi(BASE_NDVI[month - 1], month, 2024));
    }
    const cycle = describeNdviAnnualCycle(observations, NORTHERN_LATITUDE);
    expect(cycle.status).toBe("no-usable-observations");
    expect(cycle.calendarMonthsCovered).toBe(0);
    expect(cycle.monthlyClimatology).toEqual([]);
    expect(cycle.amplitude).toBeNull();
    expect(cycle.reason).toBe("no-calendar-month-met-year-floor");
  });

  it("honors a custom minimum years per month", () => {
    // Two years is normally too few, but a floor of 2 admits the cycle.
    const observations: NdviMonthlyObservation[] = [];
    for (let month = 1; month <= 12; month++) {
      observations.push(ndvi(BASE_NDVI[month - 1] - 0.01, month, 2023));
      observations.push(ndvi(BASE_NDVI[month - 1] + 0.01, month, 2024));
    }
    const cycle = describeNdviAnnualCycle(observations, NORTHERN_LATITUDE, {
      minimumYearsPerMonth: 2,
    });
    expect(cycle.status).toBe("available");
    expect(cycle.requiredYearsPerMonth).toBe(2);
    expect(cycle.amplitude).toBeCloseTo(0.7, 10);
  });

  it("keeps interannual spread unavailable for a one-year monthly mean", () => {
    const observations: NdviMonthlyObservation[] = [];
    for (let month = 1; month <= 12; month++) {
      observations.push(ndvi(BASE_NDVI[month - 1], month, 2024));
    }
    const cycle = describeNdviAnnualCycle(observations, NORTHERN_LATITUDE, {
      minimumYearsPerMonth: 1,
    });

    expect(cycle.status).toBe("available");
    expect(
      cycle.monthlyClimatology.every(
        (month) => month.interannualStandardDeviation === null
      )
    ).toBe(true);
  });

  it("computes sample spread without changing native NDVI units or provenance", () => {
    const observations = fullCycleObservations();
    observations.push(ndvi(0.2, 1, 2026));
    const cycle = describeNdviAnnualCycle(observations, NORTHERN_LATITUDE);
    const january = cycle.monthlyClimatology[0];

    expect(january.interannualStandardDeviation).toBeCloseTo(
      Math.sqrt(0.0056 / 3),
      10
    );
    expect(cycle.unit).toBe("NDVI (unitless)");
    expect(cycle.source).toMatchObject({ shortName: expect.any(String) });
  });

  it("excludes missing, out-of-range, and low-coverage observations honestly", () => {
    const observations = [
      ...fullCycleObservations(),
      ndvi(null, 3, 2026), // missing value
      ndvi(0.5, 3, 2027, { validFraction: 0 }), // zero coverage -> missing
      ndvi(1.5, 4, 2026), // NDVI above 1 -> invalid
      ndvi(0.5, 4, 2027, { validFraction: 1.2 }), // bad fraction -> invalid
      ndvi(0.5, 5, 2026, { validFraction: 0.3 }), // below 0.6 floor
      { month: { year: 2026, month: 13 }, ndvi: 0.5 }, // not a calendar month
    ];
    const cycle = describeNdviAnnualCycle(observations, NORTHERN_LATITUDE);
    expect(cycle.exclusions).toMatchObject({
      missing: 2,
      invalid: 2,
      insufficientCoverage: 1,
      notCalendarMonth: 1,
      duplicateYearMonth: 0,
    });
    // None of the rejected records perturbed the clean full cycle.
    expect(cycle.status).toBe("available");
    expect(cycle.observationsUsed).toBe(36);
  });

  it("keeps a supplied valid fraction at or above the floor", () => {
    const observations = [
      ...fullCycleObservations(),
      ndvi(0.9, 7, 2026, { validFraction: 0.6 }), // exactly at the floor
    ];
    const cycle = describeNdviAnnualCycle(observations, NORTHERN_LATITUDE);
    const july = cycle.monthlyClimatology.find((m) => m.calendarMonth === 7);
    expect(july?.yearsUsed).toBe(4);
    expect(cycle.exclusions.insufficientCoverage).toBe(0);
  });

  it("rejects an invalid configuration without inventing a cycle", () => {
    const cycle = describeNdviAnnualCycle(
      fullCycleObservations(),
      NORTHERN_LATITUDE,
      { minimumYearsPerMonth: 0 }
    );
    expect(cycle.status).toBe("invalid");
    expect(cycle.reason).toBe("invalid-configuration");
    expect(cycle.monthlyClimatology).toEqual([]);
    expect(cycle.amplitude).toBeNull();
  });

  it("resolves ties toward the earlier calendar month", () => {
    // Every calendar month shares one mean, so greenest/least-green both land on
    // the earliest month deterministically and the amplitude is zero.
    const observations: NdviMonthlyObservation[] = [];
    for (let month = 1; month <= 12; month++) {
      for (const year of [2023, 2024, 2025]) {
        observations.push(ndvi(0.4, month, year));
      }
    }
    const cycle = describeNdviAnnualCycle(observations, NORTHERN_LATITUDE);
    expect(cycle.greenestMonth?.calendarMonth).toBe(1);
    expect(cycle.leastGreenMonth?.calendarMonth).toBe(1);
    expect(cycle.amplitude).toBe(0);
  });

  it("formats an honest available readout", () => {
    const cycle = describeNdviAnnualCycle(
      fullCycleObservations(),
      NORTHERN_LATITUDE
    );
    const text = formatNdviAnnualCycle(cycle);
    expect(text).toContain("Mean annual NDVI cycle amplitude 0.7");
    expect(text).toContain("Jul greenest");
    expect(text).toContain("Jan least green");
    expect(text).toContain("not a climate normal");
  });

  it("formats an honest unavailable readout", () => {
    const observations = fullCycleObservations().filter(
      (o) => o.month.month !== 12
    );
    const cycle = describeNdviAnnualCycle(observations, NORTHERN_LATITUDE);
    const text = formatNdviAnnualCycle(cycle);
    expect(text).toContain("No mean annual NDVI cycle");
    expect(text).toContain(`11/${CALENDAR_MONTHS_IN_YEAR}`);
  });
});
