import { describe, expect, it } from "vitest";
import type { MonthlyClimateObservation } from "./climate";
import { describeAirTemperatureAnnualCycle } from "./airTemperatureSeasonalCycle";
import {
  AIR_TEMPERATURE_CONTINENTALITY_LIMITATIONS,
  CONRAD_LATITUDE_OFFSET_DEGREES,
  CONRAD_OFFSET,
  CONRAD_RANGE_COEFFICIENT,
  describeAirTemperatureContinentality,
} from "./airTemperatureContinentality";
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

/**
 * Twelve monthly means whose coldest month is January (`coldestKelvin`) and
 * whose warmest is July (`coldestKelvin + rangeKelvin`), so the mean annual
 * cycle amplitude is exactly `rangeKelvin`. All other months sit at the midpoint
 * so they never become the extreme.
 */
function meansWithRange(coldestKelvin: number, rangeKelvin: number): number[] {
  const midpoint = coldestKelvin + rangeKelvin / 2;
  const means = new Array<number>(12).fill(midpoint);
  means[0] = coldestKelvin; // January, coldest
  means[6] = coldestKelvin + rangeKelvin; // July, warmest
  return means;
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

/** Reference implementation of Conrad's index for cross-checking the module. */
function conrad(rangeKelvin: number, latitudeDegrees: number): number {
  const latitudeTerm = Math.sin(
    ((Math.abs(latitudeDegrees) + CONRAD_LATITUDE_OFFSET_DEGREES) * Math.PI) /
      180
  );
  return (
    (CONRAD_RANGE_COEFFICIENT * rangeKelvin) / latitudeTerm - CONRAD_OFFSET
  );
}

describe("air-temperature continentality (Conrad's index)", () => {
  it("computes and classifies a strongly continental interior", () => {
    // Verkhoyansk-like: ~63 K annual range near 67.5° latitude → index ≈ 96.
    const cycle = cycleFor(meansWithRange(240, 63));
    const result = describeAirTemperatureContinentality(cycle, 67.5);

    expect(result).toMatchObject({
      kind: "air-temperature-continentality-index",
      isForecast: false,
      status: "available",
      nativeUnit: "K",
      latitudeDegrees: 67.5,
      category: "continental",
      reason: null,
    });
    expect(result.annualRangeKelvin).toBeCloseTo(63, 6);
    expect(result.conradIndex).toBeCloseTo(conrad(63, 67.5), 6);
    expect(result.conradIndex).toBeGreaterThan(90);
    expect(result.statement).toContain("Conrad continentality index");
    expect(result.limitations).toBe(AIR_TEMPERATURE_CONTINENTALITY_LIMITATIONS);
    expect(result.source.shortName).toBeTruthy();
  });

  it("computes a near-zero index for an extreme oceanic station", () => {
    // Faroe-like: ~8 K annual range near 62° latitude → index ≈ 0.
    const cycle = cycleFor(meansWithRange(276, 8));
    const result = describeAirTemperatureContinentality(cycle, 62);

    expect(result.status).toBe("available");
    expect(result.category).toBe("oceanic");
    expect(result.conradIndex).toBeCloseTo(conrad(8, 62), 6);
    expect(result.conradIndex).toBeLessThan(5);
  });

  it("is symmetric across hemispheres via absolute latitude", () => {
    const cycle = cycleFor(meansWithRange(250, 40));
    const north = describeAirTemperatureContinentality(cycle, 55);
    const south = describeAirTemperatureContinentality(cycle, -55);

    expect(south.conradIndex).toBeCloseTo(north.conradIndex ?? NaN, 9);
    expect(south.latitudeDegrees).toBe(-55);
    expect(north.latitudeDegrees).toBe(55);
  });

  it("walks the conventional category bands with the range", () => {
    // Fixed 45° latitude; increasing annual range climbs the bands.
    const cases: Array<[number, string]> = [
      [10, "oceanic"],
      [22, "sub-oceanic"],
      [35, "sub-continental"],
      [45, "continental"],
    ];
    for (const [range, expected] of cases) {
      const cycle = cycleFor(meansWithRange(255, range));
      const result = describeAirTemperatureContinentality(cycle, 45);
      expect(result.category).toBe(expected);
      expect(result.conradIndex).toBeCloseTo(conrad(range, 45), 6);
    }
  });

  it("stays defined at the equator without a singularity", () => {
    const cycle = cycleFor(meansWithRange(297, 3));
    const result = describeAirTemperatureContinentality(cycle, 0);

    expect(result.status).toBe("available");
    expect(Number.isFinite(result.conradIndex ?? NaN)).toBe(true);
    expect(result.conradIndex).toBeCloseTo(conrad(3, 0), 6);
  });

  it("withholds an index when the annual cycle is incomplete", () => {
    // Only nine calendar months supplied → no full-cycle amplitude.
    const cycle = cycleFor(
      meansWithRange(260, 30),
      [1, 2, 3, 4, 5, 6, 7, 8, 9]
    );
    const result = describeAirTemperatureContinentality(cycle, 50);

    expect(result.status).toBe("insufficient-cycle");
    expect(result.conradIndex).toBeNull();
    expect(result.annualRangeKelvin).toBeNull();
    expect(result.category).toBeNull();
    expect(result.reason).toBe("cycle-not-full");
    expect(result.statement).toContain("mean annual cycle incomplete");
  });

  it("rejects an out-of-range latitude but keeps the annual range", () => {
    const cycle = cycleFor(meansWithRange(260, 30));
    const result = describeAirTemperatureContinentality(cycle, 100);

    expect(result.status).toBe("invalid-latitude");
    expect(result.conradIndex).toBeNull();
    expect(result.category).toBeNull();
    expect(result.latitudeDegrees).toBeNull();
    expect(result.annualRangeKelvin).toBeCloseTo(30, 6);
    expect(result.reason).toBe("invalid-latitude");
  });

  it("rejects a non-finite latitude", () => {
    const cycle = cycleFor(meansWithRange(260, 30));
    const result = describeAirTemperatureContinentality(cycle, Number.NaN);

    expect(result.status).toBe("invalid-latitude");
    expect(result.conradIndex).toBeNull();
  });
});
