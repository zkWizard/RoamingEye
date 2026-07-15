import { describe, expect, it } from "vitest";
import type { MonthlyClimateObservation } from "./climate";
import { describeAirTemperatureAnnualCycle } from "./airTemperatureSeasonalCycle";
import {
  AIR_TEMPERATURE_QUARTER_LIMITATIONS,
  describeAirTemperatureQuarters,
  formatAirTemperatureQuarters,
  quartersFromCycle,
} from "./airTemperatureQuarter";
import type { YearMonth } from "./timeline";

/** Availability checkpoint comfortably after every data month used below. */
const AVAILABLE_THROUGH: YearMonth = { year: 2026, month: 1 };

/** Northern-hemisphere-style base monthly means, coldest Jan, warmest Jul. */
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

describe("air-temperature warmest/coldest quarter", () => {
  it("picks the warmest and coldest running three-month quarters", () => {
    const profile = describeAirTemperatureQuarters(
      fullCycleObservations(),
      AVAILABLE_THROUGH
    );

    expect(profile).toMatchObject({
      kind: "air-temperature-quarter-profile",
      isForecast: false,
      status: "available",
      nativeUnit: "K",
      calendarMonthsCovered: 12,
      observationsUsed: 36,
      reason: null,
    });

    // Warmest quarter Jun–Aug: mean(295, 298, 297) = 296.666…
    expect(profile.warmestQuarter).toEqual({
      startMonth: 6,
      months: [6, 7, 8],
      meanKelvin: (295 + 298 + 297) / 3,
    });
    // Coldest quarter Dec–Feb, wrapping the year: mean(272, 270, 272) = 271.333…
    expect(profile.coldestQuarter).toEqual({
      startMonth: 12,
      months: [12, 1, 2],
      meanKelvin: (272 + 270 + 272) / 3,
    });
    expect(profile.rangeKelvin).toBeCloseTo(
      (295 + 298 + 297) / 3 - (272 + 270 + 272) / 3,
      9
    );
  });

  it("uses a smoothed range narrower than the month-to-month amplitude", () => {
    const profile = describeAirTemperatureQuarters(
      fullCycleObservations(),
      AVAILABLE_THROUGH
    );
    const cycle = describeAirTemperatureAnnualCycle(
      fullCycleObservations(),
      AVAILABLE_THROUGH
    );

    // Monthly peak-to-trough is 298 − 270 = 28 K; averaging over three months
    // pulls both extremes inward, so the quarter range must be strictly smaller.
    expect(cycle.amplitudeKelvin).toBeCloseTo(28, 9);
    expect(profile.rangeKelvin).not.toBeNull();
    expect(profile.rangeKelvin as number).toBeLessThan(
      cycle.amplitudeKelvin as number
    );
  });

  it("resolves ties to the earliest starting month deterministically", () => {
    // A flat cycle: every quarter has the same mean, so warmest and coldest both
    // resolve to the earliest candidate quarter (starting month 1).
    const flat: MonthlyClimateObservation[] = [];
    for (let month = 1; month <= 12; month++) {
      for (const year of YEARS) flat.push(air(285, month, year));
    }
    const profile = describeAirTemperatureQuarters(flat, AVAILABLE_THROUGH);

    expect(profile.status).toBe("available");
    expect(profile.warmestQuarter?.startMonth).toBe(1);
    expect(profile.coldestQuarter?.startMonth).toBe(1);
    expect(profile.rangeKelvin).toBeCloseTo(0, 9);
  });

  it("propagates the cycle status when not all months are covered", () => {
    // Only January covered → underlying cycle is insufficient; no quarter emitted.
    const partial: MonthlyClimateObservation[] = [];
    for (const year of YEARS) partial.push(air(270, 1, year));
    const profile = describeAirTemperatureQuarters(partial, AVAILABLE_THROUGH);

    expect(profile.status).toBe("insufficient-monthly-coverage");
    expect(profile.warmestQuarter).toBeNull();
    expect(profile.coldestQuarter).toBeNull();
    expect(profile.rangeKelvin).toBeNull();
    expect(profile.reason).toBe("not-all-calendar-months-covered");
    expect(profile.calendarMonthsCovered).toBe(1);
  });

  it("does not mix a non-temperature metric into the quarter means", () => {
    const observations = fullCycleObservations();
    // A precipitation value in the warmest month must be excluded, not averaged.
    observations.push({
      metricId: "precipitation-rate",
      dataMonth: { year: 2024, month: 7 },
      value: 999,
    });
    const profile = describeAirTemperatureQuarters(
      observations,
      AVAILABLE_THROUGH
    );

    expect(profile.status).toBe("available");
    expect(profile.warmestQuarter?.meanKelvin).toBeCloseTo(
      (295 + 298 + 297) / 3,
      9
    );
  });

  it("passes options through to the underlying cycle (years-per-month floor)", () => {
    // Two years per month falls below the default floor of three, but a floor of
    // two admits the cycle and a full quarter profile.
    const twoYears: MonthlyClimateObservation[] = [];
    for (let month = 1; month <= 12; month++) {
      for (const year of [2023, 2024]) {
        twoYears.push(air(BASE_MEAN_K[month - 1], month, year));
      }
    }

    // No calendar month clears the default floor of three years → no cycle at all.
    expect(
      describeAirTemperatureQuarters(twoYears, AVAILABLE_THROUGH).status
    ).toBe("no-usable-observations");
    const relaxed = describeAirTemperatureQuarters(
      twoYears,
      AVAILABLE_THROUGH,
      {
        minimumYearsPerMonth: 2,
      }
    );
    expect(relaxed.status).toBe("available");
    expect(relaxed.warmestQuarter?.startMonth).toBe(6);
  });

  it("preserves cited provenance and honest limitations", () => {
    const profile = describeAirTemperatureQuarters(
      fullCycleObservations(),
      AVAILABLE_THROUGH
    );
    expect(profile.source.shortName).toBeTruthy();
    expect(profile.source.version).toBeTruthy();
    expect(profile.limitations).toBe(AIR_TEMPERATURE_QUARTER_LIMITATIONS);
    expect(profile.limitations.length).toBeGreaterThanOrEqual(4);
  });

  it("derives directly from a supplied cycle via quartersFromCycle", () => {
    const cycle = describeAirTemperatureAnnualCycle(
      fullCycleObservations(),
      AVAILABLE_THROUGH
    );
    expect(quartersFromCycle(cycle)).toEqual(
      describeAirTemperatureQuarters(fullCycleObservations(), AVAILABLE_THROUGH)
    );
  });

  it("formats an available profile and an unavailable one honestly", () => {
    const profile = describeAirTemperatureQuarters(
      fullCycleObservations(),
      AVAILABLE_THROUGH
    );
    const text = formatAirTemperatureQuarters(profile);
    expect(text).toContain("Warmest 2 m air-temperature quarter Jun–Aug");
    expect(text).toContain("coldest Dec–Feb");
    expect(text).toContain("not a climate normal or extreme range");

    const partial: MonthlyClimateObservation[] = [];
    for (const year of YEARS) partial.push(air(270, 1, year));
    const unavailable = formatAirTemperatureQuarters(
      describeAirTemperatureQuarters(partial, AVAILABLE_THROUGH)
    );
    expect(unavailable).toContain(
      "No warmest/coldest 2 m air-temperature quarter"
    );
    expect(unavailable).toContain("1/12 calendar months covered");
  });
});
