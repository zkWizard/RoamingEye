import { describe, expect, it } from "vitest";
import type { MonthlyClimateObservation } from "./climate";
import { describeAirTemperatureAnnualCycle } from "./airTemperatureSeasonalCycle";
import {
  AIR_TEMPERATURE_WARMTH_INDEX_LIMITATIONS,
  KELVIN_TO_CELSIUS_OFFSET,
  KIRA_BASE_TEMPERATURE_C,
  describeAirTemperatureWarmthIndex,
  formatAirTemperatureWarmthIndex,
  warmthIndexFromCycle,
} from "./airTemperatureWarmthIndex";
import type { YearMonth } from "./timeline";

/** Availability checkpoint comfortably after every data month used below. */
const AVAILABLE_THROUGH: YearMonth = { year: 2026, month: 1 };

/** Northern-hemisphere-style base monthly means, coldest Jan, warmest Jul. */
const BASE_MEAN_K = [
  270, 272, 278, 284, 290, 295, 298, 297, 291, 284, 277, 272,
] as const;

/** Three distinct years so each calendar month clears the years-per-month floor. */
const YEARS = [2023, 2024, 2025] as const;

/** Kira base of 5 °C expressed in kelvin (278.15 K). */
const BASE_KELVIN = KIRA_BASE_TEMPERATURE_C + KELVIN_TO_CELSIUS_OFFSET;

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

/** Independent reference sums straight from the definition, for a base in K. */
function expectedIndices(baseKelvin: number): {
  wi: number;
  ci: number;
  warm: number;
  cold: number;
} {
  let wi = 0;
  let ci = 0;
  let warm = 0;
  let cold = 0;
  for (const meanKelvin of BASE_MEAN_K) {
    const departure = meanKelvin - baseKelvin;
    if (departure > 0) {
      wi += departure;
      warm += 1;
    } else if (departure < 0) {
      ci += departure;
      cold += 1;
    }
  }
  return { wi, ci, warm, cold };
}

describe("air-temperature Kira warmth/coldness index", () => {
  it("accumulates the mean cycle's excess and deficit against the 5 °C base", () => {
    const profile = describeAirTemperatureWarmthIndex(
      fullCycleObservations(),
      AVAILABLE_THROUGH
    );
    const expected = expectedIndices(BASE_KELVIN);

    expect(profile).toMatchObject({
      kind: "air-temperature-warmth-index-profile",
      isForecast: false,
      status: "available",
      unit: "°C·month",
      baseTemperatureC: 5,
      calendarMonthsCovered: 12,
      observationsUsed: 36,
      reason: null,
    });
    expect(profile.warmthIndexDegreeMonths).toBeCloseTo(expected.wi, 9);
    expect(profile.coldnessIndexDegreeMonths).toBeCloseTo(expected.ci, 9);
    expect(profile.warmMonths).toBe(expected.warm);
    expect(profile.coldMonths).toBe(expected.cold);
    // Jan/Feb/Mar/Nov/Dec sit below the 278.15 K base and Apr–Oct above it, so
    // this cycle has both a positive WI and a negative CI.
    expect(profile.warmthIndexDegreeMonths).toBeGreaterThan(0);
    expect(profile.coldnessIndexDegreeMonths).toBeLessThan(0);
    expect(profile.warmMonths).toBe(7);
    expect(profile.coldMonths).toBe(5);
    // WI and |CI| for a spelled-out reference: warm months Apr(284)…Oct(284),
    // cold months Jan(270),Feb(272),Mar(278),Nov(277),Dec(272), base 278.15 K.
    expect(profile.coldnessIndexDegreeMonths).toBeCloseTo(-21.75, 9);
  });

  it("keeps WI non-negative and CI non-positive on a cold cycle", () => {
    // A cold cycle: shift every month far below the base so all months are cold.
    const cold: MonthlyClimateObservation[] = [];
    for (let month = 1; month <= 12; month++) {
      for (const year of YEARS) cold.push(air(250, month, year));
    }
    const profile = describeAirTemperatureWarmthIndex(cold, AVAILABLE_THROUGH);

    expect(profile.status).toBe("available");
    expect(profile.warmthIndexDegreeMonths).toBe(0);
    // Each of twelve months is 250 − 278.15 = −28.15 K below the base.
    expect(profile.coldnessIndexDegreeMonths).toBeCloseTo(
      12 * (250 - BASE_KELVIN),
      9
    );
    expect(profile.warmMonths).toBe(0);
    expect(profile.coldMonths).toBe(12);
  });

  it("counts a month exactly at the base in neither tally", () => {
    // Every month sits exactly on the base → both indices zero, both tallies zero.
    const atBase: MonthlyClimateObservation[] = [];
    for (let month = 1; month <= 12; month++) {
      for (const year of YEARS) atBase.push(air(BASE_KELVIN, month, year));
    }
    const profile = describeAirTemperatureWarmthIndex(
      atBase,
      AVAILABLE_THROUGH
    );

    expect(profile.status).toBe("available");
    expect(profile.warmthIndexDegreeMonths).toBe(0);
    expect(profile.coldnessIndexDegreeMonths).toBe(0);
    expect(profile.warmMonths).toBe(0);
    expect(profile.coldMonths).toBe(0);
  });

  it("honours a custom base temperature", () => {
    // A base of 10 °C (283.15 K) makes the cold-half months contribute to CI.
    const profile = describeAirTemperatureWarmthIndex(
      fullCycleObservations(),
      AVAILABLE_THROUGH,
      { baseTemperatureC: 10 }
    );
    const expected = expectedIndices(10 + KELVIN_TO_CELSIUS_OFFSET);

    expect(profile.baseTemperatureC).toBe(10);
    expect(profile.warmthIndexDegreeMonths).toBeCloseTo(expected.wi, 9);
    expect(profile.coldnessIndexDegreeMonths).toBeCloseTo(expected.ci, 9);
    expect(profile.coldnessIndexDegreeMonths).toBeLessThan(0);
  });

  it("is a lower bound relationship: WI − |CI| equals 12·(annualMean − base)", () => {
    // Σ max(0,d) + Σ min(0,d) = Σ d over all twelve months, an identity that
    // must hold exactly regardless of the base.
    const profile = describeAirTemperatureWarmthIndex(
      fullCycleObservations(),
      AVAILABLE_THROUGH
    );
    const meanOfMeans =
      BASE_MEAN_K.reduce((sum, v) => sum + v, 0) / BASE_MEAN_K.length;
    const netDegreeMonths = 12 * (meanOfMeans - BASE_KELVIN);
    expect(
      (profile.warmthIndexDegreeMonths as number) +
        (profile.coldnessIndexDegreeMonths as number)
    ).toBeCloseTo(netDegreeMonths, 9);
  });

  it("rejects a non-finite base temperature as invalid", () => {
    const profile = describeAirTemperatureWarmthIndex(
      fullCycleObservations(),
      AVAILABLE_THROUGH,
      { baseTemperatureC: Number.NaN }
    );
    expect(profile.status).toBe("invalid");
    expect(profile.warmthIndexDegreeMonths).toBeNull();
    expect(profile.coldnessIndexDegreeMonths).toBeNull();
    expect(profile.reason).toBe("invalid-base-temperature");
  });

  it("propagates the cycle status when not all months are covered", () => {
    // Only January covered → underlying cycle is insufficient; no index emitted.
    const partial: MonthlyClimateObservation[] = [];
    for (const year of YEARS) partial.push(air(270, 1, year));
    const profile = describeAirTemperatureWarmthIndex(
      partial,
      AVAILABLE_THROUGH
    );

    expect(profile.status).toBe("insufficient-monthly-coverage");
    expect(profile.warmthIndexDegreeMonths).toBeNull();
    expect(profile.coldnessIndexDegreeMonths).toBeNull();
    expect(profile.warmMonths).toBeNull();
    expect(profile.coldMonths).toBeNull();
    expect(profile.reason).toBe("not-all-calendar-months-covered");
    expect(profile.calendarMonthsCovered).toBe(1);
  });

  it("does not mix a non-temperature metric into the sums", () => {
    const observations = fullCycleObservations();
    // A precipitation value in the warmest month must be excluded, not summed.
    observations.push({
      metricId: "precipitation-rate",
      dataMonth: { year: 2024, month: 7 },
      value: 999,
    });
    const profile = describeAirTemperatureWarmthIndex(
      observations,
      AVAILABLE_THROUGH
    );
    const expected = expectedIndices(BASE_KELVIN);

    expect(profile.status).toBe("available");
    expect(profile.warmthIndexDegreeMonths).toBeCloseTo(expected.wi, 9);
  });

  it("passes cycle options through to the underlying cycle", () => {
    // Two years per month falls below the default floor of three.
    const twoYears: MonthlyClimateObservation[] = [];
    for (let month = 1; month <= 12; month++) {
      for (const year of [2023, 2024]) {
        twoYears.push(air(BASE_MEAN_K[month - 1], month, year));
      }
    }

    expect(
      describeAirTemperatureWarmthIndex(twoYears, AVAILABLE_THROUGH).status
    ).toBe("no-usable-observations");
    const relaxed = describeAirTemperatureWarmthIndex(
      twoYears,
      AVAILABLE_THROUGH,
      { minimumYearsPerMonth: 2 }
    );
    expect(relaxed.status).toBe("available");
    expect(relaxed.warmthIndexDegreeMonths).toBeGreaterThan(0);
  });

  it("preserves cited provenance and honest limitations", () => {
    const profile = describeAirTemperatureWarmthIndex(
      fullCycleObservations(),
      AVAILABLE_THROUGH
    );
    expect(profile.source.shortName).toBeTruthy();
    expect(profile.source.version).toBeTruthy();
    expect(profile.limitations).toBe(AIR_TEMPERATURE_WARMTH_INDEX_LIMITATIONS);
    expect(profile.limitations.length).toBeGreaterThanOrEqual(4);
  });

  it("derives directly from a supplied cycle via warmthIndexFromCycle", () => {
    const cycle = describeAirTemperatureAnnualCycle(
      fullCycleObservations(),
      AVAILABLE_THROUGH
    );
    expect(warmthIndexFromCycle(cycle)).toEqual(
      describeAirTemperatureWarmthIndex(
        fullCycleObservations(),
        AVAILABLE_THROUGH
      )
    );
  });

  it("formats an available profile and an unavailable one honestly", () => {
    const profile = describeAirTemperatureWarmthIndex(
      fullCycleObservations(),
      AVAILABLE_THROUGH
    );
    const text = formatAirTemperatureWarmthIndex(profile);
    expect(text).toContain("Kira Warmth Index");
    expect(text).toContain("Coldness Index");
    expect(text).toContain("base 5 °C");
    expect(text).toContain("not a climate normal, day-resolved sum");

    const partial: MonthlyClimateObservation[] = [];
    for (const year of YEARS) partial.push(air(270, 1, year));
    const unavailable = formatAirTemperatureWarmthIndex(
      describeAirTemperatureWarmthIndex(partial, AVAILABLE_THROUGH)
    );
    expect(unavailable).toContain(
      "No Kira warmth/coldness index for 2 m air temperature"
    );
    expect(unavailable).toContain("1/12 calendar months covered");
  });
});
