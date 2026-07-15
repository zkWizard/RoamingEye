import { describe, expect, it } from "vitest";
import {
  AEROSOL_SOURCE,
  AEROSOL_UNIT,
  AEROSOL_WAVELENGTH_NM,
  type AerosolObservation,
} from "./aerosolLoading";
import {
  AEROSOL_SEASONAL_TIMING_LIMITATIONS,
  CALENDAR_MONTHS_IN_YEAR,
  describeAerosolSeasonalTiming,
  formatAerosolSeasonalTiming,
  MINIMUM_AEROSOL_SEASONAL_TIMING_VALID_FRACTION,
  MINIMUM_AEROSOL_SEASONAL_TIMING_YEARS_PER_MONTH,
} from "./aerosolSeasonalTiming";

const AVAILABLE_THROUGH = { year: 2026, month: 12 };
const DEFAULT_YEARS = [2020, 2021, 2022] as const;

/** One usable monthly AOD observation for a fixed place. */
function obs(
  year: number,
  month: number,
  value: number | null,
  validFraction = 0.95
): AerosolObservation {
  return { dataMonth: { year, month }, value, validFraction };
}

/**
 * A full mean annual cycle built from a 12-entry array of per-calendar-month AOD
 * values, replicated identically across `years` so every calendar month clears
 * the per-month year floor and its mean equals the supplied value.
 */
function cycleFromMeans(
  means: readonly number[],
  years: readonly number[] = DEFAULT_YEARS,
  validFraction = 0.95
): AerosolObservation[] {
  const observations: AerosolObservation[] = [];
  for (const year of years) {
    for (let month = 1; month <= 12; month++) {
      observations.push(obs(year, month, means[month - 1] ?? 0, validFraction));
    }
  }
  return observations;
}

describe("aerosol seasonal timing (circular centroid)", () => {
  it("points the centroid at the sole haze month with full concentration", () => {
    // All column loading in July (month 7): the resultant sits exactly at July's
    // mid-month angle and is perfectly concentrated.
    const means = new Array(12).fill(0);
    means[6] = 0.4; // July
    const timing = describeAerosolSeasonalTiming(
      cycleFromMeans(means),
      AVAILABLE_THROUGH
    );

    expect(timing).toMatchObject({
      kind: "derived-aerosol-seasonal-timing",
      isForecast: false,
      status: "available",
      source: AEROSOL_SOURCE,
      wavelengthNm: AEROSOL_WAVELENGTH_NM,
      unit: AEROSOL_UNIT,
      calendarMonthsCovered: 12,
      centroidCalendarMonth: 7,
      centroidMonthName: "Jul",
      reason: null,
    });
    // Mid-month angle for month 7 is 30·(7 − 0.5) = 195°.
    expect(timing.phaseDegrees).toBeCloseTo(195, 9);
    expect(timing.centroidMonth).toBeCloseTo(7, 9);
    expect(timing.concentration).toBeCloseTo(1, 9);
    expect(timing.observationsUsed).toBe(36);
  });

  it("matches the closed-form circular mean of two equal months", () => {
    // Equal loading in January (15°) and March (75°): the mean direction is
    // exactly their bisector at 45° → centroid month 2.0 (February) with
    // R = cos(30°). Angular bins are equal, so no day-length weighting applies.
    const means = new Array(12).fill(0);
    means[0] = 0.3; // Jan
    means[2] = 0.3; // Mar
    const timing = describeAerosolSeasonalTiming(
      cycleFromMeans(means),
      AVAILABLE_THROUGH
    );

    expect(timing.phaseDegrees).toBeCloseTo(45, 9);
    expect(timing.centroidMonth).toBeCloseTo(2, 9);
    expect(timing.centroidCalendarMonth).toBe(2);
    expect(timing.centroidMonthName).toBe("Feb");
    expect(timing.concentration).toBeCloseTo(Math.cos(Math.PI / 6), 9);
  });

  it("resolves a December/January split to the year boundary, not midyear", () => {
    // The circular-statistics payoff: equal loading in December (345°) and
    // January (15°) must centroid at the Dec/Jan turn (nearest month January),
    // never average to July.
    const means = new Array(12).fill(0);
    means[0] = 0.25; // Jan
    means[11] = 0.25; // Dec
    const timing = describeAerosolSeasonalTiming(
      cycleFromMeans(means),
      AVAILABLE_THROUGH
    );

    expect(timing.phaseDegrees).toBeCloseTo(0, 9);
    expect(timing.centroidCalendarMonth).toBe(1);
    expect(timing.centroidMonthName).toBe("Jan");
    // Balanced across the boundary, so still strongly concentrated (cos 15°).
    expect(timing.concentration).toBeCloseTo(Math.cos(Math.PI / 12), 9);
  });

  it("withholds a direction when two antipodal months cancel exactly", () => {
    // January (15°) and July (195°) are antipodal; equal loading cancels, leaving
    // no preferred timing. The direction is withheld rather than guessed, but the
    // (near-zero) concentration is still reported and the status stays available.
    const means = new Array(12).fill(0);
    means[0] = 0.35; // Jan
    means[6] = 0.35; // Jul
    const timing = describeAerosolSeasonalTiming(
      cycleFromMeans(means),
      AVAILABLE_THROUGH
    );

    expect(timing.status).toBe("available");
    expect(timing.phaseDegrees).toBeNull();
    expect(timing.centroidMonth).toBeNull();
    expect(timing.centroidCalendarMonth).toBeNull();
    expect(timing.centroidMonthName).toBeNull();
    expect(timing.concentration).not.toBeNull();
    expect(timing.concentration!).toBeLessThan(1e-6);
    expect(timing.reason).toBe("no-preferred-timing");
  });

  it("reports zero concentration and no direction for an all-clean cycle", () => {
    // Every calendar month a perfectly clean column (AOD 0): the weighted vector
    // is 0/0, so no direction, but the full cycle is still available.
    const timing = describeAerosolSeasonalTiming(
      cycleFromMeans(new Array(12).fill(0)),
      AVAILABLE_THROUGH
    );

    expect(timing.status).toBe("available");
    expect(timing.calendarMonthsCovered).toBe(12);
    expect(timing.concentration).toBe(0);
    expect(timing.centroidCalendarMonth).toBeNull();
    expect(timing.reason).toBe("zero-total-loading");
  });

  it("keeps concentration in (0, 1) for a broad, gently peaked regime", () => {
    // A gently peaked summer haze regime: a defined centroid, but far from a
    // single spike, so 0 < R < 1 and the centroid sits in the warm half.
    const means = [1, 1, 2, 3, 4, 5, 5, 4, 3, 2, 1, 1].map((w) => w * 0.05);
    const timing = describeAerosolSeasonalTiming(
      cycleFromMeans(means),
      AVAILABLE_THROUGH
    );

    expect(timing.concentration).not.toBeNull();
    expect(timing.concentration!).toBeGreaterThan(0);
    expect(timing.concentration!).toBeLessThan(1);
    expect(timing.centroidCalendarMonth).toBeGreaterThanOrEqual(6);
    expect(timing.centroidCalendarMonth).toBeLessThanOrEqual(8);
  });

  it("exposes an auditable January→December mean cycle", () => {
    const means = Array.from({ length: 12 }, (_unused, i) => 0.1 + i * 0.01);
    const timing = describeAerosolSeasonalTiming(
      cycleFromMeans(means),
      AVAILABLE_THROUGH
    );

    expect(timing.monthlyMeans.map((m) => m.calendarMonth)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12,
    ]);
    for (const entry of timing.monthlyMeans) {
      expect(entry.yearsUsed).toBe(3);
      expect(entry.meanAod).toBeCloseTo(means[entry.calendarMonth - 1], 12);
    }
  });

  it("is order-independent", () => {
    const means = new Array(12).fill(0);
    means[4] = 0.3; // May
    const ordered = cycleFromMeans(means);
    const shuffled = [...ordered].reverse();

    const a = describeAerosolSeasonalTiming(ordered, AVAILABLE_THROUGH);
    const b = describeAerosolSeasonalTiming(shuffled, AVAILABLE_THROUGH);
    expect(b.centroidCalendarMonth).toBe(a.centroidCalendarMonth);
    expect(b.phaseDegrees).toBeCloseTo(a.phaseDegrees!, 12);
    expect(b.concentration).toBeCloseTo(a.concentration!, 12);
  });

  it("withholds a centroid unless all twelve calendar months are covered", () => {
    // Drop every March observation: only eleven calendar months clear the floor.
    const observations = cycleFromMeans(new Array(12).fill(0.2)).filter(
      (o) => o.dataMonth.month !== 3
    );
    const timing = describeAerosolSeasonalTiming(
      observations,
      AVAILABLE_THROUGH
    );

    expect(timing.status).toBe("insufficient-monthly-coverage");
    expect(timing.calendarMonthsCovered).toBe(11);
    expect(timing.centroidCalendarMonth).toBeNull();
    expect(timing.concentration).toBeNull();
    expect(timing.reason).toBe("not-all-calendar-months-covered");
  });

  it("drops a calendar month that falls below the per-month year floor", () => {
    // February has only two distinct years — below the default floor of three —
    // so it is excluded and the cycle is incomplete.
    const observations = cycleFromMeans(new Array(12).fill(0.2)).filter(
      (o) => !(o.dataMonth.month === 2 && o.dataMonth.year === 2022)
    );
    const timing = describeAerosolSeasonalTiming(
      observations,
      AVAILABLE_THROUGH
    );

    expect(timing.status).toBe("insufficient-monthly-coverage");
    expect(timing.calendarMonthsCovered).toBe(11);
  });

  it("reports no usable observations when nothing clears the floor", () => {
    const timing = describeAerosolSeasonalTiming([], AVAILABLE_THROUGH);
    expect(timing.status).toBe("no-usable-observations");
    expect(timing.calendarMonthsCovered).toBe(0);
    expect(timing.concentration).toBeNull();
    expect(timing.reason).toBe("no-calendar-month-met-year-floor");
  });

  it("excludes not-yet-published, no-data, low-coverage, and duplicate months", () => {
    const observations = cycleFromMeans(new Array(12).fill(0.2));
    // A future (not-yet-published) month, a no-data month, a low-coverage month,
    // an invalid calendar month, and a duplicate (year, month) pair.
    observations.push(obs(2030, 6, 0.5)); // beyond AVAILABLE_THROUGH
    observations.push(obs(2023, 6, null)); // no-data
    observations.push(obs(2023, 7, 0.5, 0.1)); // below 60% coverage
    observations.push(obs(2023, 13, 0.5)); // not a calendar month
    observations.push(obs(2020, 1, 0.9)); // duplicate of an existing Jan 2020

    const timing = describeAerosolSeasonalTiming(
      observations,
      AVAILABLE_THROUGH
    );

    expect(timing.exclusions.notYetPublished).toBe(1);
    expect(timing.exclusions.missing).toBe(1);
    expect(timing.exclusions.insufficientCoverage).toBe(1);
    expect(timing.exclusions.notCalendarMonth).toBe(1);
    expect(timing.exclusions.duplicateYearMonth).toBe(1);
    // The base cycle is untouched, so a centroid is still available.
    expect(timing.status).toBe("available");
    expect(timing.calendarMonthsCovered).toBe(12);
  });

  it("rejects an invalid configuration", () => {
    const timing = describeAerosolSeasonalTiming(
      cycleFromMeans(new Array(12).fill(0.2)),
      AVAILABLE_THROUGH,
      { minimumYearsPerMonth: 0 }
    );
    expect(timing.status).toBe("invalid");
    expect(timing.reason).toBe("invalid-configuration");
    expect(timing.concentration).toBeNull();
  });

  it("preserves the cited provenance", () => {
    const timing = describeAerosolSeasonalTiming(
      cycleFromMeans(new Array(12).fill(0.2)),
      AVAILABLE_THROUGH
    );
    expect(timing.source).toEqual(AEROSOL_SOURCE);
    expect(timing.unit).toBe(AEROSOL_UNIT);
    expect(timing.wavelengthNm).toBe(AEROSOL_WAVELENGTH_NM);
  });

  it("formats an available centroid and an unavailable one honestly", () => {
    const means = new Array(12).fill(0);
    means[6] = 0.4;
    const available = describeAerosolSeasonalTiming(
      cycleFromMeans(means),
      AVAILABLE_THROUGH
    );
    const text = formatAerosolSeasonalTiming(available);
    expect(text).toMatch(/centred on Jul/);
    expect(text).toMatch(/not a season-onset date/);

    const empty = describeAerosolSeasonalTiming([], AVAILABLE_THROUGH);
    expect(formatAerosolSeasonalTiming(empty)).toMatch(
      /No aerosol seasonal-timing centroid/
    );
  });

  it("exposes stable public constants and honest limitations", () => {
    expect(CALENDAR_MONTHS_IN_YEAR).toBe(12);
    expect(MINIMUM_AEROSOL_SEASONAL_TIMING_YEARS_PER_MONTH).toBe(3);
    expect(MINIMUM_AEROSOL_SEASONAL_TIMING_VALID_FRACTION).toBeCloseTo(0.6, 12);
    const joined = AEROSOL_SEASONAL_TIMING_LIMITATIONS.join(" ");
    expect(joined).toMatch(/whole-column optical thickness/);
    expect(joined).toMatch(/whole-month/);
    expect(joined).toMatch(/not a .*forecast/i);
    expect(joined).toMatch(/non-negative/);
  });
});
