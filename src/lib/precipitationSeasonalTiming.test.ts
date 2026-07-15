import { describe, expect, it } from "vitest";
import { summarizeMonthlyClimate } from "./climate";
import {
  precipitationAccumulation,
  type PrecipitationAccumulation,
} from "./precipitationAccumulation";
import {
  PRECIP_SEASONAL_TIMING_LIMITATIONS,
  PRECIP_SEASONAL_TIMING_MONTHS,
  precipitationSeasonalTiming,
} from "./precipitationSeasonalTiming";
import type { DatasetRef, YearMonth } from "./timeline";

/** Build a usable monthly accumulation for a given rate and month. */
function accum(rate: number, dataMonth: YearMonth): PrecipitationAccumulation {
  const summary = summarizeMonthlyClimate(
    { metricId: "precipitation-rate", dataMonth, value: rate },
    { year: dataMonth.year + 2, month: dataMonth.month }
  );
  const result = precipitationAccumulation(summary);
  if (result === null)
    throw new Error("expected a usable monthly accumulation");
  return result;
}

/**
 * A full calendar year (Jan..Dec of `year`) built from a 12-entry rate array,
 * one mean precipitation rate per calendar month. Missing entries default to a
 * dry (zero-rate) month, which is a usable observation.
 */
function yearFromRates(rates: readonly number[], year = 2026) {
  return Array.from({ length: 12 }, (_, i) =>
    accum(rates[i] ?? 0, { year, month: i + 1 })
  );
}

describe("precipitation seasonal timing (circular centroid)", () => {
  it("points the centroid at the sole wet month with full concentration", () => {
    // All water in July (month 7): the resultant vector sits exactly at July's
    // mid-month angle and is perfectly concentrated.
    const rates = new Array(12).fill(0);
    rates[6] = 0.005; // July
    const timing = precipitationSeasonalTiming(yearFromRates(rates));

    expect(timing).not.toBeNull();
    expect(timing).toMatchObject({
      kind: "derived-precip-seasonal-timing",
      isForecast: false,
      monthCount: 12,
      centroidCalendarMonth: 7,
      centroidMonthName: "Jul",
      startMonth: { year: 2026, month: 1 },
      endMonth: { year: 2026, month: 12 },
    });
    // Mid-month angle for month 7 is 30·(7 − 0.5) = 195°.
    expect(timing?.phaseDegrees).toBeCloseTo(195, 9);
    expect(timing?.centroidMonth).toBeCloseTo(7, 9);
    expect(timing?.concentration).toBeCloseTo(1, 9);
  });

  it("matches the closed-form circular mean of two equal-length months", () => {
    // Equal depths in January (31 days, 15°) and March (31 days, 75°): equal
    // rates give equal depths, so the mean direction is exactly their bisector
    // at 45° → centroid month 2.0 (February) with R = cos(30°).
    const rates = new Array(12).fill(0);
    rates[0] = 0.0002; // Jan (31 days)
    rates[2] = 0.0002; // Mar (31 days)
    const timing = precipitationSeasonalTiming(yearFromRates(rates));

    expect(timing?.phaseDegrees).toBeCloseTo(45, 6);
    expect(timing?.centroidMonth).toBeCloseTo(2, 6);
    expect(timing?.centroidCalendarMonth).toBe(2);
    expect(timing?.centroidMonthName).toBe("Feb");
    expect(timing?.concentration).toBeCloseTo(Math.cos(Math.PI / 6), 6);
  });

  it("resolves a December/January split to the year boundary, not midyear", () => {
    // The circular-statistics payoff: equal water in December (345°) and
    // January (15°) — both 31-day months — must centroid at the Dec/Jan turn
    // (nearest month January), never average to July.
    const rates = new Array(12).fill(0);
    rates[0] = 0.0003; // Jan (31 days)
    rates[11] = 0.0003; // Dec (31 days)
    const timing = precipitationSeasonalTiming(yearFromRates(rates));

    expect(timing?.phaseDegrees).toBeCloseTo(0, 6);
    expect(timing?.centroidCalendarMonth).toBe(1);
    expect(timing?.centroidMonthName).toBe("Jan");
    // Balanced across the boundary, so still strongly concentrated (cos 15°).
    expect(timing?.concentration).toBeCloseTo(Math.cos(Math.PI / 12), 6);
  });

  it("withholds a direction when two antipodal months cancel exactly", () => {
    // January (15°) and July (195°) are antipodal and equal-length (both 31
    // days); equal rates give equal depths that cancel, leaving no preferred
    // timing. The centroid is withheld rather than guessed, but the (near-zero)
    // concentration and the positive total are still reported.
    const rates = new Array(12).fill(0);
    rates[0] = 0.0004; // Jan
    rates[6] = 0.0004; // Jul
    const timing = precipitationSeasonalTiming(yearFromRates(rates));

    expect(timing).not.toBeNull();
    expect(timing?.phaseDegrees).toBeNull();
    expect(timing?.centroidMonth).toBeNull();
    expect(timing?.centroidCalendarMonth).toBeNull();
    expect(timing?.centroidMonthName).toBeNull();
    expect(timing?.concentration).toBeLessThan(1e-6);
    expect(timing?.totalMm).toBeGreaterThan(0);
  });

  it("keeps concentration in [0, 1] and totals honest for a broad regime", () => {
    // A gently peaked summer regime: still a defined centroid, but far from a
    // single spike, so 0 < R < 1.
    const rates = [1, 1, 2, 3, 4, 5, 5, 4, 3, 2, 1, 1].map((w) => w * 0.0001);
    const timing = precipitationSeasonalTiming(yearFromRates(rates));

    expect(timing).not.toBeNull();
    expect(timing!.concentration).toBeGreaterThan(0);
    expect(timing!.concentration).toBeLessThan(1);
    // Summer-weighted, so the centroid lands in the warm half of the year.
    expect(timing!.centroidCalendarMonth).toBeGreaterThanOrEqual(6);
    expect(timing!.centroidCalendarMonth).toBeLessThanOrEqual(8);
    // Total equals the sum of the twelve monthly depths.
    const expectedTotal = yearFromRates(rates).reduce(
      (sum, m) => sum + m.totalMm,
      0
    );
    expect(timing!.totalMm).toBeCloseTo(expectedTotal, 9);
  });

  it("spans a non-calendar twelve-month cycle (Jul..Jun)", () => {
    // A complete annual cycle need not start in January; a July→June run still
    // covers every calendar month once.
    const run = Array.from({ length: 12 }, (_, i) => {
      const monthIndex = i + 6; // 0-based offset from July 2025
      const year = 2025 + Math.floor(monthIndex / 12);
      const month = (monthIndex % 12) + 1;
      // All water in the following March (month 3) for a predictable centroid.
      const rate = month === 3 ? 0.004 : 0;
      return accum(rate, { year, month });
    });
    const timing = precipitationSeasonalTiming(run);

    expect(timing?.monthCount).toBe(12);
    expect(timing?.startMonth).toEqual({ year: 2025, month: 7 });
    expect(timing?.endMonth).toEqual({ year: 2026, month: 6 });
    expect(timing?.centroidCalendarMonth).toBe(3);
    expect(timing?.centroidMonthName).toBe("Mar");
  });

  it("is order-independent", () => {
    const rates = new Array(12).fill(0);
    rates[4] = 0.003; // May
    const ordered = yearFromRates(rates);
    const shuffled = [...ordered].reverse();

    const a = precipitationSeasonalTiming(ordered);
    const b = precipitationSeasonalTiming(shuffled);
    expect(b?.centroidCalendarMonth).toBe(a?.centroidCalendarMonth);
    expect(b?.phaseDegrees).toBeCloseTo(a!.phaseDegrees!, 12);
    expect(b?.startMonth).toEqual(a?.startMonth);
    expect(b?.endMonth).toEqual(a?.endMonth);
  });

  it("returns null for a bone-dry (zero-total) year", () => {
    expect(precipitationSeasonalTiming(yearFromRates([]))).toBeNull();
  });

  it("returns null unless the run is exactly twelve months", () => {
    const eleven = Array.from({ length: 11 }, (_, i) =>
      accum(0.0002, { year: 2026, month: i + 1 })
    );
    const thirteen = [
      ...yearFromRates(new Array(12).fill(0.0002)),
      accum(0.0002, { year: 2027, month: 1 }),
    ];
    expect(precipitationSeasonalTiming(eleven)).toBeNull();
    expect(precipitationSeasonalTiming(thirteen)).toBeNull();
    expect(precipitationSeasonalTiming([])).toBeNull();
  });

  it("returns null on a gap or a duplicated month", () => {
    // Drop April, then pad back to twelve by duplicating March: the run has the
    // right length but is not a strictly consecutive cycle.
    const withGap = [
      ...Array.from({ length: 3 }, (_, i) =>
        accum(0.0002, { year: 2026, month: i + 1 })
      ),
      accum(0.0002, { year: 2026, month: 3 }), // duplicate March
      ...Array.from({ length: 8 }, (_, i) =>
        accum(0.0002, { year: 2026, month: i + 5 })
      ),
    ];
    expect(withGap).toHaveLength(12);
    expect(precipitationSeasonalTiming(withGap)).toBeNull();
  });

  it("returns null when the twelve months mix cited products", () => {
    const run = yearFromRates(new Array(12).fill(0.0002));
    const otherSource: DatasetRef = {
      ...run[5].source,
      version: `${run[5].source.version}-alt`,
    };
    const mixed = run.map((m, i) =>
      i === 5 ? { ...m, source: otherSource } : m
    );
    expect(precipitationSeasonalTiming(mixed)).toBeNull();
  });

  it("returns null when any monthly total is non-finite or negative", () => {
    const base = yearFromRates(new Array(12).fill(0.0002));
    const withNaN = base.map((m, i) =>
      i === 3 ? { ...m, totalMm: Number.NaN } : m
    );
    const withNegative = base.map((m, i) =>
      i === 8 ? { ...m, totalMm: -1 } : m
    );
    expect(precipitationSeasonalTiming(withNaN)).toBeNull();
    expect(precipitationSeasonalTiming(withNegative)).toBeNull();
  });

  it("preserves the shared cited provenance", () => {
    const run = yearFromRates(new Array(12).fill(0.0002));
    const timing = precipitationSeasonalTiming(run);
    expect(timing?.source).toEqual(run[0].source);
  });

  it("exposes stable public constants and honest limitations", () => {
    expect(PRECIP_SEASONAL_TIMING_MONTHS).toBe(12);
    expect(PRECIP_SEASONAL_TIMING_LIMITATIONS).toMatch(/Markham/);
    expect(PRECIP_SEASONAL_TIMING_LIMITATIONS).toMatch(/not a .*forecast/i);
    expect(PRECIP_SEASONAL_TIMING_LIMITATIONS).toMatch(/whole-month/);
  });
});
