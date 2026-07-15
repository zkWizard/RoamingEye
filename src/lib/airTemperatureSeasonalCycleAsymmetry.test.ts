import { describe, expect, it } from "vitest";
import { CLIMATE_METRICS, type MonthlyClimateObservation } from "./climate";
import {
  AIR_TEMPERATURE_CYCLE_ASYMMETRY_LIMITATIONS,
  describeAirTemperatureSeasonalCycleAsymmetry,
  formatAirTemperatureCycleAsymmetry,
} from "./airTemperatureSeasonalCycleAsymmetry";
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
 * Three years of every calendar month following the supplied 12-month base
 * cycle (indexed Jan..Dec). Each month's mean equals its base value exactly.
 */
function threeYearsOf(
  baseMeanK: readonly number[]
): MonthlyClimateObservation[] {
  const yearOffsets = [
    { year: 2023, offset: -0.5 },
    { year: 2024, offset: 0 },
    { year: 2025, offset: 0.5 },
  ];
  const observations: MonthlyClimateObservation[] = [];
  for (let month = 1; month <= 12; month++) {
    for (const { year, offset } of yearOffsets) {
      observations.push(air(baseMeanK[month - 1] + offset, month, year));
    }
  }
  return observations;
}

/** Symmetric northern cycle: coldest Jan (1), warmest Jul (7) → 6/6 split. */
const SYMMETRIC_MEAN_K = [
  270, 272, 278, 284, 290, 295, 298, 295, 290, 284, 278, 272,
] as const;

/**
 * Maritime-lag cycle: coldest Feb (2), warmest Sep (9) → warming arc Feb→Sep is
 * 7 months, cooling arc Sep→Feb is 5 months (slow warming, fast cooling).
 */
const MARITIME_LAG_MEAN_K = [
  281, 280, 282, 285, 289, 293, 296, 298, 299, 295, 289, 284,
] as const;

describe("air-temperature seasonal-cycle asymmetry", () => {
  it("splits a symmetric Jan/Jul cycle into an even 6/6 warming/cooling pair", () => {
    const summary = describeAirTemperatureSeasonalCycleAsymmetry(
      threeYearsOf(SYMMETRIC_MEAN_K),
      AVAILABLE_THROUGH
    );

    expect(summary).toMatchObject({
      kind: "derived-air-temperature-seasonal-cycle-asymmetry",
      isForecast: false,
      claimScope: "descriptive-air-temperature-only",
      status: "available",
      nativeUnit: "K",
      warmingArcMonths: 6,
      coolingArcMonths: 6,
      asymmetryMonths: 0,
      dominantLimb: "balanced",
      coldestMonth: 1,
      warmestMonth: 7,
      coldestMonthName: "Jan",
      warmestMonthName: "Jul",
      calendarMonthsCovered: 12,
      reason: null,
    });
    // Amplitude 298 − 270 = 28 K split evenly over each 6-month limb.
    expect(summary.amplitudeKelvin).toBeCloseTo(28, 9);
    expect(summary.meanWarmingRateKelvinPerMonth).toBeCloseTo(28 / 6, 9);
    expect(summary.meanCoolingRateKelvinPerMonth).toBeCloseTo(28 / 6, 9);
    expect(summary.source.shortName).toBe(
      CLIMATE_METRICS["air-temperature-2m"].source.shortName
    );
  });

  it("reports a longer warming limb and slower warming for a maritime-lag cycle", () => {
    const summary = describeAirTemperatureSeasonalCycleAsymmetry(
      threeYearsOf(MARITIME_LAG_MEAN_K),
      AVAILABLE_THROUGH
    );

    expect(summary.status).toBe("available");
    expect(summary.coldestMonth).toBe(2);
    expect(summary.warmestMonth).toBe(9);
    expect(summary.warmingArcMonths).toBe(7);
    expect(summary.coolingArcMonths).toBe(5);
    expect(summary.asymmetryMonths).toBe(2);
    expect(summary.dominantLimb).toBe("warming");

    // Shared amplitude (299 − 280 = 19 K); slower mean warming than cooling.
    expect(summary.amplitudeKelvin).toBeCloseTo(19, 9);
    expect(summary.meanWarmingRateKelvinPerMonth).toBeCloseTo(19 / 7, 9);
    expect(summary.meanCoolingRateKelvinPerMonth).toBeCloseTo(19 / 5, 9);
    expect(summary.meanWarmingRateKelvinPerMonth).toBeLessThan(
      summary.meanCoolingRateKelvinPerMonth as number
    );
  });

  it("warming and cooling arcs always sum to twelve months", () => {
    const summary = describeAirTemperatureSeasonalCycleAsymmetry(
      threeYearsOf(MARITIME_LAG_MEAN_K),
      AVAILABLE_THROUGH
    );
    expect(
      (summary.warmingArcMonths as number) +
        (summary.coolingArcMonths as number)
    ).toBe(12);
  });

  it("reports flat when the warmest and coldest climatological months coincide", () => {
    // Every month identical → argmax and argmin both resolve to January.
    const flat = new Array(12).fill(288);
    const summary = describeAirTemperatureSeasonalCycleAsymmetry(
      threeYearsOf(flat),
      AVAILABLE_THROUGH
    );

    expect(summary.status).toBe("flat");
    expect(summary.reason).toBe("no-within-year-temperature-range");
    expect(summary.coldestMonth).toBe(1);
    expect(summary.warmestMonth).toBe(1);
    expect(summary.warmingArcMonths).toBeNull();
    expect(summary.coolingArcMonths).toBeNull();
    expect(summary.meanWarmingRateKelvinPerMonth).toBeNull();
  });

  it("withholds limbs when not every calendar month is covered", () => {
    // Drop December entirely: only 11 calendar months clear the year floor.
    const observations = threeYearsOf(SYMMETRIC_MEAN_K).filter(
      (obs) => obs.dataMonth.month !== 12
    );
    const summary = describeAirTemperatureSeasonalCycleAsymmetry(
      observations,
      AVAILABLE_THROUGH
    );

    expect(summary.status).toBe("insufficient-monthly-coverage");
    expect(summary.calendarMonthsCovered).toBe(11);
    expect(summary.warmingArcMonths).toBeNull();
    expect(summary.dominantLimb).toBeNull();
    expect(summary.amplitudeKelvin).toBeNull();
  });

  it("reports no-usable-observations when nothing clears the coverage floors", () => {
    const summary = describeAirTemperatureSeasonalCycleAsymmetry(
      [],
      AVAILABLE_THROUGH
    );
    expect(summary.status).toBe("no-usable-observations");
    expect(summary.warmingArcMonths).toBeNull();
    expect(summary.calendarMonthsCovered).toBe(0);
  });

  it("flags an invalid configuration without throwing", () => {
    const summary = describeAirTemperatureSeasonalCycleAsymmetry(
      threeYearsOf(SYMMETRIC_MEAN_K),
      AVAILABLE_THROUGH,
      { minimumYearsPerMonth: 0 }
    );
    expect(summary.status).toBe("invalid");
    expect(summary.warmingArcMonths).toBeNull();
  });

  it("excludes non-temperature metrics rather than mixing them in", () => {
    const observations: MonthlyClimateObservation[] = [
      ...threeYearsOf(SYMMETRIC_MEAN_K),
      {
        metricId: "precipitation-rate",
        dataMonth: { year: 2024, month: 7 },
        value: 5,
      },
      {
        metricId: "soil-moisture",
        dataMonth: { year: 2024, month: 1 },
        value: 3,
      },
    ];
    const summary = describeAirTemperatureSeasonalCycleAsymmetry(
      observations,
      AVAILABLE_THROUGH
    );
    expect(summary.status).toBe("available");
    expect(summary.exclusions.wrongMetric).toBe(2);
    expect(summary.warmestMonth).toBe(7);
  });

  it("carries the honest limitations and a cited MERRA-2 source", () => {
    const summary = describeAirTemperatureSeasonalCycleAsymmetry(
      threeYearsOf(SYMMETRIC_MEAN_K),
      AVAILABLE_THROUGH
    );
    expect(summary.limitations).toBe(
      AIR_TEMPERATURE_CYCLE_ASYMMETRY_LIMITATIONS
    );
    expect(summary.limitations.length).toBeGreaterThanOrEqual(4);
    expect(summary.source.shortName.length).toBeGreaterThan(0);
    expect(summary.source.version.length).toBeGreaterThan(0);
  });

  it("formats available and unavailable summaries honestly", () => {
    const available = formatAirTemperatureCycleAsymmetry(
      describeAirTemperatureSeasonalCycleAsymmetry(
        threeYearsOf(MARITIME_LAG_MEAN_K),
        AVAILABLE_THROUGH
      )
    );
    expect(available).toContain("Feb→Sep");
    expect(available).toContain("longer warming limb");
    expect(available).toContain("not a climate normal");

    const unavailable = formatAirTemperatureCycleAsymmetry(
      describeAirTemperatureSeasonalCycleAsymmetry([], AVAILABLE_THROUGH)
    );
    expect(unavailable).toContain(
      "No 2 m air-temperature seasonal-cycle asymmetry"
    );
    expect(unavailable).toContain("0/12 calendar months covered");
  });
});
