import { describe, expect, it } from "vitest";
import type { MonthlyClimateObservation } from "./climate";
import { describeAirTemperatureAnnualCycle } from "./airTemperatureSeasonalCycle";
import {
  AIR_TEMPERATURE_FREEZE_SEASON_LIMITATIONS,
  describeAirTemperatureFreezeSeason,
} from "./airTemperatureFreezeSeason";
import { FREEZING_POINT_K } from "./airTemperatureFreeze";
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
 * Build a full-cycle annual descriptor whose per-month mean equals `baseK[m-1]`
 * exactly (identical value in each of three years), then classify its freeze
 * season. `months` optionally restricts which calendar months are emitted, to
 * force a partial (insufficient) cycle.
 */
function freezeSeasonFor(
  baseK: readonly number[],
  months: readonly number[] = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]
) {
  const observations: MonthlyClimateObservation[] = [];
  for (const month of months) {
    for (const year of YEARS) {
      observations.push(air(baseK[month - 1], month, year));
    }
  }
  const cycle = describeAirTemperatureAnnualCycle(
    observations,
    AVAILABLE_THROUGH
  );
  return describeAirTemperatureFreezeSeason(cycle);
}

/** Northern-hemisphere-style cycle: Dec–Mar means below freezing, rest above. */
const SEASONAL_FREEZE_K = [
  268, 270, 272, 278, 285, 290, 293, 292, 287, 280, 274, 270,
] as const;

describe("air-temperature freeze season", () => {
  it("locates a single contiguous freeze season with onset and thaw", () => {
    const season = freezeSeasonFor(SEASONAL_FREEZE_K);

    expect(season).toMatchObject({
      kind: "air-temperature-freeze-season",
      isForecast: false,
      status: "classified",
      regime: "seasonal-freeze",
      nativeUnit: "K",
      freezingPointKelvin: FREEZING_POINT_K,
      belowFreezingMonths: 4,
      frostFreeMonths: 8,
      freezeRunCount: 1,
      freezeOnsetMonth: 12, // Dec: predecessor Nov (274 K) is above freezing
      thawMonth: 4, // Apr: predecessor Mar (272 K) is below freezing
      reason: null,
    });
    // Below-freezing months are reported in Jan→Dec order, not run order.
    expect(season.belowFreezingCalendarMonths).toEqual([1, 2, 3, 12]);
    expect(season.limitations).toBe(AIR_TEMPERATURE_FREEZE_SEASON_LIMITATIONS);
    expect(season.statement).toContain("Dec onset");
    expect(season.statement).toContain("Apr thaw");
    expect(season.source.shortName).toBeTruthy();
  });

  it("classifies an all-warm cycle as frost-free with no boundaries", () => {
    const warm = SEASONAL_FREEZE_K.map((k) => k + 20);
    const season = freezeSeasonFor(warm);

    expect(season).toMatchObject({
      status: "classified",
      regime: "frost-free",
      belowFreezingMonths: 0,
      frostFreeMonths: 12,
      freezeRunCount: 0,
      freezeOnsetMonth: null,
      thawMonth: null,
    });
    expect(season.belowFreezingCalendarMonths).toEqual([]);
    expect(season.statement).toContain("frost-free");
  });

  it("classifies an all-cold cycle as perennially frozen with no boundaries", () => {
    const cold = SEASONAL_FREEZE_K.map((k) => k - 20);
    const season = freezeSeasonFor(cold);

    expect(season).toMatchObject({
      status: "classified",
      regime: "perennial-freeze",
      belowFreezingMonths: 12,
      frostFreeMonths: 0,
      // One run around the whole circle, but no above-freezing month to bound it.
      freezeRunCount: 1,
      freezeOnsetMonth: null,
      thawMonth: null,
    });
    expect(season.statement).toContain("all 12 months");
  });

  it("withholds onset and thaw when the freeze season is split", () => {
    // Frozen in Jan–Feb and again in Jul–Aug: two disjoint spells.
    const split = [270, 270, 280, 285, 290, 288, 271, 272, 286, 284, 282, 278];
    const season = freezeSeasonFor(split);

    expect(season).toMatchObject({
      status: "classified",
      regime: "intermittent-freeze",
      belowFreezingMonths: 4,
      frostFreeMonths: 8,
      freezeRunCount: 2,
      freezeOnsetMonth: null,
      thawMonth: null,
    });
    expect(season.belowFreezingCalendarMonths).toEqual([1, 2, 7, 8]);
    expect(season.statement).toContain("2 separate spells");
  });

  it("treats a mean exactly at the freezing point as not frozen", () => {
    const atFreezing = SEASONAL_FREEZE_K.map(() => FREEZING_POINT_K);
    const season = freezeSeasonFor(atFreezing);

    expect(season.regime).toBe("frost-free");
    expect(season.belowFreezingMonths).toBe(0);
  });

  it("returns insufficient-cycle for a partial annual cycle, keeping provenance", () => {
    // Only nine calendar months supplied: the annual cycle is incomplete.
    const season = freezeSeasonFor(
      SEASONAL_FREEZE_K,
      [1, 2, 3, 4, 5, 6, 7, 8, 9]
    );

    expect(season).toMatchObject({
      status: "insufficient-cycle",
      regime: null,
      belowFreezingMonths: 0,
      freezeRunCount: 0,
      freezeOnsetMonth: null,
      thawMonth: null,
      reason: "cycle-not-full",
    });
    expect(season.belowFreezingCalendarMonths).toEqual([]);
    expect(season.source.shortName).toBeTruthy();
    expect(season.statement).toContain("incomplete");
  });
});
