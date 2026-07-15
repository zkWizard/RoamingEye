import { describe, expect, it } from "vitest";
import type { MonthlyClimateObservation } from "./climate";
import { describeAirTemperatureAnnualCycle } from "./airTemperatureSeasonalCycle";
import {
  AIR_TEMPERATURE_SEASONALITY_LIMITATIONS,
  MONTHS_REQUIRED_FOR_SEASONALITY,
  SEASONALITY_BIO4_SCALE,
  describeAirTemperatureSeasonality,
} from "./airTemperatureSeasonality";
import type { YearMonth } from "./timeline";

/** Availability checkpoint comfortably after every data month used below. */
const AVAILABLE_THROUGH: YearMonth = { year: 2026, month: 1 };

/** Three distinct years so every calendar month clears the years-per-month floor. */
const YEARS = [2023, 2024, 2025] as const;

/** One usable air-temperature observation. */
function air(
  value: number,
  month: number,
  year: number
): MonthlyClimateObservation {
  return { metricId: "air-temperature-2m", dataMonth: { year, month }, value };
}

/** Build a full-cycle annual descriptor whose per-month mean equals `baseK[m-1]`. */
function cycleFor(
  baseK: readonly number[],
  months: readonly number[] = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]
) {
  const observations: MonthlyClimateObservation[] = [];
  for (const month of months) {
    for (const year of YEARS) {
      observations.push(air(baseK[month - 1], month, year));
    }
  }
  return describeAirTemperatureAnnualCycle(observations, AVAILABLE_THROUGH);
}

/** Reference sample standard deviation (n − 1) of a set of values. */
function sampleSd(values: readonly number[]): number {
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const variance =
    values.reduce((sum, value) => sum + (value - mean) ** 2, 0) /
    (values.length - 1);
  return Math.sqrt(variance);
}

describe("air-temperature temperature seasonality (WorldClim BIO4)", () => {
  it("computes the sample-SD seasonality and BIO4 for a full cycle", () => {
    // A gentle sinusoidal-ish cycle: interior mid-latitude means in kelvin.
    const means = [255, 257, 263, 272, 281, 288, 291, 289, 282, 272, 263, 257];
    const cycle = cycleFor(means);
    const result = describeAirTemperatureSeasonality(cycle);

    const expectedSd = sampleSd(means);
    expect(result).toMatchObject({
      kind: "air-temperature-seasonality-bio4",
      isForecast: false,
      status: "available",
      nativeUnit: "K",
      monthsUsed: 12,
      reason: null,
    });
    expect(result.annualMeanKelvin).toBeCloseTo(
      means.reduce((a, b) => a + b, 0) / 12,
      9
    );
    expect(result.seasonalityKelvin).toBeCloseTo(expectedSd, 9);
    expect(result.bio4).toBeCloseTo(SEASONALITY_BIO4_SCALE * expectedSd, 9);
    expect(result.statement).toContain(
      "Temperature seasonality (WorldClim BIO4)"
    );
    expect(result.limitations).toBe(AIR_TEMPERATURE_SEASONALITY_LIMITATIONS);
    expect(result.source.shortName).toBeTruthy();
  });

  it("is offset-invariant: shifting every month by a constant leaves the SD unchanged", () => {
    const means = [250, 252, 258, 268, 279, 286, 289, 287, 279, 268, 258, 252];
    const warmer = means.map((value) => value + 15);
    const base = describeAirTemperatureSeasonality(cycleFor(means));
    const shifted = describeAirTemperatureSeasonality(cycleFor(warmer));

    expect(shifted.seasonalityKelvin).toBeCloseTo(
      base.seasonalityKelvin ?? NaN,
      9
    );
    expect(shifted.bio4).toBeCloseTo(base.bio4 ?? NaN, 9);
    // The centre moves by exactly the applied shift; the spread does not.
    expect(shifted.annualMeanKelvin).toBeCloseTo(
      (base.annualMeanKelvin ?? NaN) + 15,
      9
    );
  });

  it("reports zero seasonality for a perfectly flat cycle", () => {
    const cycle = cycleFor(new Array<number>(12).fill(288));
    const result = describeAirTemperatureSeasonality(cycle);

    expect(result.status).toBe("available");
    expect(result.seasonalityKelvin).toBeCloseTo(0, 12);
    expect(result.bio4).toBeCloseTo(0, 12);
    expect(result.annualMeanKelvin).toBeCloseTo(288, 12);
  });

  it("keeps BIO4 exactly 100× the kelvin standard deviation", () => {
    const means = [260, 262, 268, 277, 286, 293, 296, 294, 287, 277, 268, 262];
    const result = describeAirTemperatureSeasonality(cycleFor(means));

    expect(result.bio4).toBeCloseTo(
      SEASONALITY_BIO4_SCALE * (result.seasonalityKelvin ?? NaN),
      9
    );
  });

  it("ranks a high-latitude interior as more seasonal than a maritime site", () => {
    const interior = [
      240, 244, 255, 268, 282, 292, 296, 292, 280, 265, 251, 243,
    ];
    const maritime = [
      278, 278, 280, 283, 286, 289, 291, 291, 289, 285, 281, 279,
    ];
    const interiorResult = describeAirTemperatureSeasonality(
      cycleFor(interior)
    );
    const maritimeResult = describeAirTemperatureSeasonality(
      cycleFor(maritime)
    );

    expect(interiorResult.seasonalityKelvin ?? 0).toBeGreaterThan(
      maritimeResult.seasonalityKelvin ?? 0
    );
    expect(interiorResult.bio4 ?? 0).toBeGreaterThan(maritimeResult.bio4 ?? 0);
  });

  it("withholds a seasonality when the annual cycle is incomplete", () => {
    // Only nine calendar months supplied → no full cycle.
    const cycle = cycleFor(
      [255, 257, 263, 272, 281, 288, 291, 289, 282, 272, 263, 257],
      [1, 2, 3, 4, 5, 6, 7, 8, 9]
    );
    const result = describeAirTemperatureSeasonality(cycle);

    expect(result.status).toBe("insufficient-cycle");
    expect(result.seasonalityKelvin).toBeNull();
    expect(result.bio4).toBeNull();
    expect(result.annualMeanKelvin).toBeNull();
    expect(result.monthsUsed).toBe(9);
    expect(result.reason).toBe("cycle-not-full");
    expect(result.statement).toContain("mean annual cycle incomplete");
  });

  it("preserves provenance even when no seasonality is computed", () => {
    const cycle = cycleFor(
      [255, 257, 263, 272, 281, 288, 291, 289, 282, 272, 263, 257],
      [1, 2, 3]
    );
    const result = describeAirTemperatureSeasonality(cycle);

    expect(result.status).toBe("insufficient-cycle");
    expect(result.source.shortName).toBeTruthy();
    expect(result.metric.id).toBe("air-temperature-2m");
    expect(result.limitations).toBe(AIR_TEMPERATURE_SEASONALITY_LIMITATIONS);
  });

  it("requires all twelve calendar months", () => {
    expect(MONTHS_REQUIRED_FOR_SEASONALITY).toBe(12);
  });
});
