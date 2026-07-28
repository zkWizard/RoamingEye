import { describe, expect, it } from "vitest";
import { CLIMATE_METRICS, type MonthlyClimateObservation } from "./climate";
import { describeAirTemperatureAnnualCycle } from "./airTemperatureSeasonalCycle";
import {
  AIR_TEMPERATURE_WARM_SEASON_LIMITATIONS,
  DEFAULT_WARM_SEASON_THRESHOLD_C,
  describeAirTemperatureWarmSeason,
  formatAirTemperatureWarmSeason,
  warmSeasonFromCycle,
} from "./airTemperatureWarmSeason";
import type { YearMonth } from "./timeline";

/** Availability checkpoint comfortably after every data month used below. */
const AVAILABLE_THROUGH: YearMonth = { year: 2026, month: 1 };

/**
 * Northern-hemisphere-style base monthly means, coldest Jan, warmest Jul. At the
 * default 5 °C (278.15 K) threshold, Apr–Oct (284…284 K) are at or above and the
 * shoulder months (Mar 278 K, Nov 277 K) fall just below — a clean 7-month
 * warm season with no wrap.
 */
const NH_MEAN_K = [
  270, 272, 278, 284, 290, 295, 298, 297, 291, 284, 277, 272,
] as const;

/**
 * Southern-hemisphere-style base monthly means, warmest Jan, coldest Jul. The
 * warm season straddles the December→January boundary (Oct…Apr at 5 °C).
 */
const SH_MEAN_K = [
  298, 297, 291, 284, 277, 272, 270, 272, 278, 284, 290, 295,
] as const;

/** Per-year offsets so each month's mean equals its base exactly (mean 0). */
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

/** Three years of every calendar month following the supplied base cycle. */
function fullCycle(baseMeanK: readonly number[]): MonthlyClimateObservation[] {
  const observations: MonthlyClimateObservation[] = [];
  for (let month = 1; month <= 12; month++) {
    for (const { year, offset } of YEAR_OFFSETS) {
      observations.push(air(baseMeanK[month - 1] + offset, month, year));
    }
  }
  return observations;
}

describe("air-temperature thermal warm season", () => {
  it("counts the warm months and locates a non-wrapping window (NH)", () => {
    const profile = describeAirTemperatureWarmSeason(
      fullCycle(NH_MEAN_K),
      AVAILABLE_THROUGH
    );

    expect(profile).toMatchObject({
      kind: "air-temperature-warm-season",
      isForecast: false,
      status: "available",
      nativeUnit: "K",
      thresholdC: DEFAULT_WARM_SEASON_THRESHOLD_C,
      calendarMonthsCovered: 12,
      observationsUsed: 36,
      regime: "seasonal",
      reason: null,
    });
    expect(profile.thresholdKelvin).toBeCloseTo(278.15, 9);
    // Apr(4)…Oct(10) are at or above 5 °C; the shoulders fall just below.
    expect(profile.monthsAtOrAboveThreshold).toBe(7);
    expect(profile.warmSeason).toEqual({
      startMonth: 4,
      endMonth: 10,
      lengthMonths: 7,
      wrapsYearBoundary: false,
    });
    expect(profile.monthlyFlags).toHaveLength(12);
    expect(profile.monthlyFlags[2]).toMatchObject({
      calendarMonth: 3,
      atOrAboveThreshold: false,
    });
    expect(profile.monthlyFlags[3]).toMatchObject({
      calendarMonth: 4,
      atOrAboveThreshold: true,
    });
  });

  it("reports a single contiguous window across the year boundary (SH)", () => {
    const profile = describeAirTemperatureWarmSeason(
      fullCycle(SH_MEAN_K),
      AVAILABLE_THROUGH
    );

    // Oct…Apr is warm; on the cyclic year that is one 7-month window, not two.
    expect(profile.monthsAtOrAboveThreshold).toBe(7);
    expect(profile.warmSeason).toEqual({
      startMonth: 10,
      endMonth: 4,
      lengthMonths: 7,
      wrapsYearBoundary: true,
    });
    expect(profile.regime).toBe("seasonal");
  });

  it("treats a month exactly at the threshold as within the warm season", () => {
    // 4.85 °C → 278.0 K exactly; March's 278 K base now qualifies (at-or-above).
    const profile = describeAirTemperatureWarmSeason(
      fullCycle(NH_MEAN_K),
      AVAILABLE_THROUGH,
      { thresholdC: 4.85 }
    );

    expect(profile.thresholdKelvin).toBeCloseTo(278.0, 9);
    expect(profile.monthlyFlags[2]).toMatchObject({
      calendarMonth: 3,
      atOrAboveThreshold: true,
    });
    // Mar(3)…Oct(10) inclusive.
    expect(profile.monthsAtOrAboveThreshold).toBe(8);
    expect(profile.warmSeason).toMatchObject({
      startMonth: 3,
      endMonth: 10,
      lengthMonths: 8,
    });
  });

  it("honours a configurable, stricter threshold", () => {
    const profile = describeAirTemperatureWarmSeason(
      fullCycle(NH_MEAN_K),
      AVAILABLE_THROUGH,
      { thresholdC: 15 }
    );

    // 15 °C → 288.15 K; only May…Sep clear it.
    expect(profile.monthsAtOrAboveThreshold).toBe(5);
    expect(profile.warmSeason).toEqual({
      startMonth: 5,
      endMonth: 9,
      lengthMonths: 5,
      wrapsYearBoundary: false,
    });
  });

  it("classifies a year-round warm regime", () => {
    const profile = describeAirTemperatureWarmSeason(
      fullCycle([300, 300, 300, 300, 300, 300, 300, 300, 300, 300, 300, 300]),
      AVAILABLE_THROUGH
    );

    expect(profile.regime).toBe("year-round");
    expect(profile.monthsAtOrAboveThreshold).toBe(12);
    expect(profile.warmSeason).toEqual({
      startMonth: 1,
      endMonth: 12,
      lengthMonths: 12,
      wrapsYearBoundary: false,
    });
  });

  it("classifies a too-cold regime with no warm season", () => {
    const profile = describeAirTemperatureWarmSeason(
      fullCycle([260, 260, 260, 260, 260, 260, 260, 260, 260, 260, 260, 260]),
      AVAILABLE_THROUGH
    );

    expect(profile.regime).toBe("none");
    expect(profile.monthsAtOrAboveThreshold).toBe(0);
    expect(profile.warmSeason).toBeNull();
  });

  it("withholds counts but exposes covered flags for a partial cycle", () => {
    const observations = fullCycle(NH_MEAN_K).filter(
      (o) => o.dataMonth.month !== 12
    );
    const profile = describeAirTemperatureWarmSeason(
      observations,
      AVAILABLE_THROUGH
    );

    expect(profile.status).toBe("insufficient-monthly-coverage");
    expect(profile.calendarMonthsCovered).toBe(11);
    expect(profile.monthsAtOrAboveThreshold).toBeNull();
    expect(profile.warmSeason).toBeNull();
    expect(profile.regime).toBeNull();
    // The months it does have are still flagged.
    expect(profile.monthlyFlags).toHaveLength(11);
    expect(profile.reason).toBe("not-all-calendar-months-covered");
  });

  it("returns no-usable-observations when nothing meets the floor", () => {
    const profile = describeAirTemperatureWarmSeason(
      [air(288, 1, 2024), air(289, 1, 2025)],
      AVAILABLE_THROUGH
    );

    expect(profile.status).toBe("no-usable-observations");
    expect(profile.calendarMonthsCovered).toBe(0);
    expect(profile.monthsAtOrAboveThreshold).toBeNull();
    expect(profile.monthlyFlags).toEqual([]);
    expect(profile.reason).toBe("no-calendar-month-met-year-floor");
  });

  it("propagates an invalid configuration from the underlying cycle", () => {
    const profile = describeAirTemperatureWarmSeason(
      fullCycle(NH_MEAN_K),
      AVAILABLE_THROUGH,
      { minimumYearsPerMonth: 0 }
    );

    expect(profile.status).toBe("invalid");
    expect(profile.monthsAtOrAboveThreshold).toBeNull();
    expect(profile.reason).toBe("invalid-configuration");
  });

  it("rejects a non-finite threshold before classifying", () => {
    const profile = describeAirTemperatureWarmSeason(
      fullCycle(NH_MEAN_K),
      AVAILABLE_THROUGH,
      { thresholdC: Number.NaN }
    );

    expect(profile.status).toBe("invalid");
    expect(profile.monthsAtOrAboveThreshold).toBeNull();
    expect(profile.monthlyFlags).toEqual([]);
    expect(profile.reason).toBe("invalid-threshold");
  });

  it("preserves the cited MERRA-2 metric and dataset provenance", () => {
    const profile = describeAirTemperatureWarmSeason(
      fullCycle(NH_MEAN_K),
      AVAILABLE_THROUGH
    );

    expect(profile.metric).toBe(CLIMATE_METRICS["air-temperature-2m"]);
    expect(profile.source).toBe(CLIMATE_METRICS["air-temperature-2m"].source);
    expect(profile.limitations).toBe(AIR_TEMPERATURE_WARM_SEASON_LIMITATIONS);
    expect(profile.limitations.length).toBeGreaterThan(0);
  });

  it("matches warmSeasonFromCycle on the same cycle and threshold", () => {
    const observations = fullCycle(NH_MEAN_K);
    const cycle = describeAirTemperatureAnnualCycle(
      observations,
      AVAILABLE_THROUGH
    );

    expect(warmSeasonFromCycle(cycle)).toEqual(
      describeAirTemperatureWarmSeason(observations, AVAILABLE_THROUGH)
    );
    expect(warmSeasonFromCycle(cycle, 15)).toEqual(
      describeAirTemperatureWarmSeason(observations, AVAILABLE_THROUGH, {
        thresholdC: 15,
      })
    );
  });
});

describe("formatAirTemperatureWarmSeason", () => {
  it("reads out a seasonal warm-season window", () => {
    const text = formatAirTemperatureWarmSeason(
      describeAirTemperatureWarmSeason(fullCycle(NH_MEAN_K), AVAILABLE_THROUGH)
    );

    expect(text).toContain("Thermal warm season 7/12 months at or above 5 °C");
    expect(text).toContain("longest window 7 months (Apr–Oct)");
    expect(text).toContain("not a daily-mean or frost-free growing season");
    expect(text).toContain(
      CLIMATE_METRICS["air-temperature-2m"].source.shortName
    );
  });

  it("notes when the warm-season window wraps the year boundary", () => {
    const text = formatAirTemperatureWarmSeason(
      describeAirTemperatureWarmSeason(fullCycle(SH_MEAN_K), AVAILABLE_THROUGH)
    );

    expect(text).toContain("(Oct–Apr, across the year boundary)");
  });

  it("reads out a year-round warm regime", () => {
    const text = formatAirTemperatureWarmSeason(
      describeAirTemperatureWarmSeason(
        fullCycle([300, 300, 300, 300, 300, 300, 300, 300, 300, 300, 300, 300]),
        AVAILABLE_THROUGH
      )
    );

    expect(text).toContain("Thermal warm season year-round");
  });

  it("reads out an absent warm season", () => {
    const text = formatAirTemperatureWarmSeason(
      describeAirTemperatureWarmSeason(
        fullCycle([260, 260, 260, 260, 260, 260, 260, 260, 260, 260, 260, 260]),
        AVAILABLE_THROUGH
      )
    );

    expect(text).toContain("No month's mean 2 m air temperature reaches 5 °C");
  });

  it("explains when no full cycle is available", () => {
    const text = formatAirTemperatureWarmSeason(
      describeAirTemperatureWarmSeason([air(288, 1, 2024)], AVAILABLE_THROUGH)
    );

    expect(text).toContain("No thermal warm season at or above 5 °C");
    expect(text).toContain("0/12 calendar months covered");
  });
});
