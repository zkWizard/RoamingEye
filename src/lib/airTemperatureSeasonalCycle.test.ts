import { describe, expect, it } from "vitest";
import { CLIMATE_METRICS, type MonthlyClimateObservation } from "./climate";
import {
  AIR_TEMPERATURE_ANNUAL_CYCLE_LIMITATIONS,
  describeAirTemperatureAnnualCycle,
  formatAirTemperatureAnnualCycle,
} from "./airTemperatureSeasonalCycle";
import type { YearMonth } from "./timeline";

/** Availability checkpoint comfortably after every data month used below. */
const AVAILABLE_THROUGH: YearMonth = { year: 2026, month: 1 };

/** Northern-hemisphere-style base monthly means, coldest Jan, warmest Jul. */
const BASE_MEAN_K = [
  270, 272, 278, 284, 290, 295, 298, 297, 291, 284, 277, 272,
] as const;

/** Per-year offsets so each month's mean equals its base exactly. */
const YEAR_OFFSETS: ReadonlyArray<{ year: number; offset: number }> = [
  { year: 2023, offset: -0.5 },
  { year: 2024, offset: 0 },
  { year: 2025, offset: 0.5 },
];

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

describe("air-temperature mean annual cycle", () => {
  it("derives the mean annual cycle and its peak-to-trough amplitude", () => {
    const cycle = describeAirTemperatureAnnualCycle(
      fullCycleObservations(),
      AVAILABLE_THROUGH
    );

    expect(cycle).toMatchObject({
      kind: "air-temperature-mean-annual-cycle",
      isForecast: false,
      status: "available",
      nativeUnit: "K",
      observationsSupplied: 36,
      observationsUsed: 36,
      calendarMonthsCovered: 12,
      reason: null,
    });
    expect(cycle.monthlyClimatology).toHaveLength(12);
    expect(cycle.warmestMonth).toEqual({ calendarMonth: 7, meanKelvin: 298 });
    expect(cycle.coldestMonth).toEqual({ calendarMonth: 1, meanKelvin: 270 });
    expect(cycle.amplitudeKelvin).toBeCloseTo(298 - 270, 9);
  });

  it("averages each calendar month across its distinct years with min/max", () => {
    const cycle = describeAirTemperatureAnnualCycle(
      fullCycleObservations(),
      AVAILABLE_THROUGH
    );

    const july = cycle.monthlyClimatology.find((m) => m.calendarMonth === 7);
    expect(july).toEqual({
      calendarMonth: 7,
      yearsUsed: 3,
      meanKelvin: 298,
      minKelvin: 297.5,
      maxKelvin: 298.5,
    });
    // Climatology is sorted January -> December for auditability.
    expect(cycle.monthlyClimatology.map((m) => m.calendarMonth)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12,
    ]);
  });

  it("preserves the cited MERRA-2 metric and dataset provenance", () => {
    const cycle = describeAirTemperatureAnnualCycle(
      fullCycleObservations(),
      AVAILABLE_THROUGH
    );

    expect(cycle.metric).toBe(CLIMATE_METRICS["air-temperature-2m"]);
    expect(cycle.source).toBe(CLIMATE_METRICS["air-temperature-2m"].source);
    expect(cycle.limitations).toBe(AIR_TEMPERATURE_ANNUAL_CYCLE_LIMITATIONS);
    expect(cycle.limitations.length).toBeGreaterThan(0);
  });

  it("keeps only one value per distinct year and calendar month", () => {
    const observations = fullCycleObservations();
    // A duplicate 2024 July that must not change the mean or inflate the count.
    observations.push(air(400, 7, 2024));
    const cycle = describeAirTemperatureAnnualCycle(
      observations,
      AVAILABLE_THROUGH
    );

    expect(cycle.exclusions.duplicateYearMonth).toBe(1);
    expect(cycle.observationsUsed).toBe(36);
    expect(cycle.warmestMonth).toEqual({ calendarMonth: 7, meanKelvin: 298 });
  });

  it("reports insufficient coverage without an amplitude when a month is missing", () => {
    // Drop every December observation, leaving only 11 covered months.
    const observations = fullCycleObservations().filter(
      (o) => o.dataMonth.month !== 12
    );
    const cycle = describeAirTemperatureAnnualCycle(
      observations,
      AVAILABLE_THROUGH
    );

    expect(cycle.status).toBe("insufficient-monthly-coverage");
    expect(cycle.calendarMonthsCovered).toBe(11);
    expect(cycle.amplitudeKelvin).toBeNull();
    expect(cycle.warmestMonth).toBeNull();
    expect(cycle.coldestMonth).toBeNull();
    // The months it does have are still exposed.
    expect(cycle.monthlyClimatology).toHaveLength(11);
    expect(cycle.reason).toBe("not-all-calendar-months-covered");
  });

  it("requires the year floor per calendar month", () => {
    // Only two years for July; every other month has three.
    const observations = fullCycleObservations().filter(
      (o) => !(o.dataMonth.month === 7 && o.dataMonth.year === 2025)
    );
    const cycle = describeAirTemperatureAnnualCycle(
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
    const cycle = describeAirTemperatureAnnualCycle(
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
        metricId: "precipitation-rate",
        dataMonth: { year: 2024, month: 7 },
        value: 5,
      },
      {
        metricId: "soil-moisture",
        dataMonth: { year: 2024, month: 1 },
        value: 12,
      },
    ];
    const cycle = describeAirTemperatureAnnualCycle(
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
      air(275, 6, 2027),
      // Published month with no usable value.
      air(null, 6, 2022),
      // Coverage below the default 0.6 floor.
      air(280, 6, 2021, { validFraction: 0.4 }),
    ];
    const cycle = describeAirTemperatureAnnualCycle(
      observations,
      AVAILABLE_THROUGH
    );

    expect(cycle.exclusions.notYetPublished).toBe(1);
    expect(cycle.exclusions.missing).toBe(1);
    expect(cycle.exclusions.insufficientCoverage).toBe(1);
    // None of those altered June's clean three-year mean.
    const june = cycle.monthlyClimatology.find((m) => m.calendarMonth === 6);
    expect(june?.yearsUsed).toBe(3);
    expect(june?.meanKelvin).toBe(295);
  });

  it("returns no-usable-observations when nothing meets the floor", () => {
    const cycle = describeAirTemperatureAnnualCycle(
      [air(288, 1, 2024), air(289, 1, 2025)],
      AVAILABLE_THROUGH
    );

    expect(cycle.status).toBe("no-usable-observations");
    expect(cycle.calendarMonthsCovered).toBe(0);
    expect(cycle.amplitudeKelvin).toBeNull();
    expect(cycle.monthlyClimatology).toEqual([]);
    expect(cycle.reason).toBe("no-calendar-month-met-year-floor");
  });

  it("rejects an invalid configuration", () => {
    const zeroYears = describeAirTemperatureAnnualCycle(
      fullCycleObservations(),
      AVAILABLE_THROUGH,
      { minimumYearsPerMonth: 0 }
    );
    expect(zeroYears.status).toBe("invalid");
    expect(zeroYears.reason).toBe("invalid-configuration");

    const badFraction = describeAirTemperatureAnnualCycle(
      fullCycleObservations(),
      AVAILABLE_THROUGH,
      { minimumValidFraction: 1.5 }
    );
    expect(badFraction.status).toBe("invalid");
  });

  it("resolves warmest/coldest ties to the earlier calendar month", () => {
    const observations: MonthlyClimateObservation[] = [];
    // Every month shares the same mean; warmest and coldest both collapse to Jan.
    for (let month = 1; month <= 12; month++) {
      for (const { year } of YEAR_OFFSETS) {
        observations.push(air(285, month, year));
      }
    }
    const cycle = describeAirTemperatureAnnualCycle(
      observations,
      AVAILABLE_THROUGH
    );

    expect(cycle.status).toBe("available");
    expect(cycle.amplitudeKelvin).toBe(0);
    expect(cycle.warmestMonth?.calendarMonth).toBe(1);
    expect(cycle.coldestMonth?.calendarMonth).toBe(1);
  });
});

describe("formatAirTemperatureAnnualCycle", () => {
  it("reads out the amplitude with warmest and coldest months", () => {
    const cycle = describeAirTemperatureAnnualCycle(
      fullCycleObservations(),
      AVAILABLE_THROUGH
    );
    const text = formatAirTemperatureAnnualCycle(cycle);

    expect(text).toContain("Mean annual 2 m air-temperature range 28 K");
    expect(text).toContain("Jul warmest");
    expect(text).toContain("Jan coldest");
    expect(text).toContain("not a climate normal or extreme range");
    expect(text).toContain(
      CLIMATE_METRICS["air-temperature-2m"].source.shortName
    );
  });

  it("explains when no full cycle is available", () => {
    const cycle = describeAirTemperatureAnnualCycle(
      [air(288, 1, 2024)],
      AVAILABLE_THROUGH
    );
    const text = formatAirTemperatureAnnualCycle(cycle);

    expect(text).toContain("No mean annual 2 m air-temperature cycle");
    expect(text).toContain("0/12 calendar months covered");
  });
});
