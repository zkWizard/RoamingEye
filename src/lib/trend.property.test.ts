import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { seasonalMannKendall, sensSlope, trendSummary } from "./trend";
import { PROBE_SCALES } from "./probe";
import type { YearMonth } from "./timeline";

/**
 * Property-based tests for the trend estimators — the most consequential new
 * math in the tool, where a wrong sign or a mis-scaled slope would put a false
 * finding in someone's paper. Example tests check the cases we thought of;
 * these check the invariants a reviewer would sanity-check by hand, over
 * thousands of random seasonal series.
 *
 * On failure fast-check prints the shrunken counterexample and a seed.
 */

/** A random monthly series: `years` × `seasons`, arbitrary finite values. */
const seriesArb = fc
  .record({
    startYear: fc.integer({ min: 1990, max: 2010 }),
    years: fc.integer({ min: 3, max: 12 }),
    seasons: fc.subarray([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], {
      minLength: 1,
    }),
    // Per (year,season) value on a 0.01 grid in [−50, 50] — realistic
    // quantized data (colormap-inverted values are quantized anyway), which
    // keeps the arithmetic away from subnormal-double underflow artifacts
    // that no real satellite series exhibits.
    noise: fc.array(fc.integer({ min: -5000, max: 5000 }), {
      minLength: 12 * 12,
      maxLength: 12 * 12,
    }),
  })
  .map(({ startYear, years, seasons, noise }) => {
    const months: YearMonth[] = [];
    const values: number[] = [];
    let k = 0;
    for (let y = 0; y < years; y++) {
      for (const s of seasons) {
        months.push({ year: startYear + y, month: s });
        values.push(noise[k++ % noise.length] / 100);
      }
    }
    return { months, values };
  });

/** A clean 2-decimal number in [min, max], no subnormals. */
const quantized = (min: number, max: number) =>
  fc.integer({ min: min * 100, max: max * 100 }).map((x) => x / 100);

const scale = PROBE_SCALES.ndvi;

describe("trend estimator invariants (property-based)", () => {
  it("p-value ∈ [0,1], τ ∈ [−1,1], and the CI brackets the slope", () => {
    fc.assert(
      fc.property(seriesArb, ({ months, values }) => {
        const mk = seasonalMannKendall(months, values);
        expect(mk.pValue).toBeGreaterThanOrEqual(0);
        expect(mk.pValue).toBeLessThanOrEqual(1);
        expect(mk.tau).toBeGreaterThanOrEqual(-1.0000001);
        expect(mk.tau).toBeLessThanOrEqual(1.0000001);
        const sen = sensSlope(months, values);
        expect(sen.lowerPerYear).toBeLessThanOrEqual(sen.slopePerYear + 1e-9);
        expect(sen.upperPerYear).toBeGreaterThanOrEqual(
          sen.slopePerYear - 1e-9
        );
      })
    );
  });

  it("reversing time flips the sign of S and Sen's slope; |τ| and p unchanged", () => {
    fc.assert(
      fc.property(seriesArb, ({ months, values }) => {
        const forward = seasonalMannKendall(months, values);
        // True time reversal: reflect each month's year about the midpoint,
        // keeping its (season, value) — so within each season the time order
        // flips while values stay put. (Reversing the flat array would cross
        // season boundaries and is NOT a time reversal.)
        const years = months.map((m) => m.year);
        const mid = Math.min(...years) + Math.max(...years);
        const revMonths = months.map((m) => ({
          year: mid - m.year,
          month: m.month,
        }));
        const back = seasonalMannKendall(revMonths, values);
        expect(back.S).toBeCloseTo(-forward.S, 6);
        expect(back.pValue).toBeCloseTo(forward.pValue, 6);
        expect(Math.abs(back.tau)).toBeCloseTo(Math.abs(forward.tau), 6);
        // Sen's slope flips sign too.
        const fSlope = sensSlope(months, values).slopePerYear;
        const bSlope = sensSlope(revMonths, values).slopePerYear;
        expect(bSlope).toBeCloseTo(-fSlope, 6);
      })
    );
  });

  it("adding a constant leaves S, p, τ, and Sen's slope unchanged", () => {
    fc.assert(
      fc.property(
        seriesArb,
        quantized(-1000, 1000),
        ({ months, values }, c) => {
          const a = seasonalMannKendall(months, values);
          const shifted = values.map((v) => v + c);
          const b = seasonalMannKendall(months, shifted);
          expect(b.S).toBe(a.S);
          expect(b.pValue).toBeCloseTo(a.pValue, 6);
          expect(sensSlope(months, shifted).slopePerYear).toBeCloseTo(
            sensSlope(months, values).slopePerYear,
            6
          );
        }
      )
    );
  });

  it("scaling values by a>0 scales the slope by a; p and τ invariant", () => {
    fc.assert(
      fc.property(seriesArb, quantized(0.1, 20), ({ months, values }, a) => {
        const base = sensSlope(months, values).slopePerYear;
        const scaled = sensSlope(
          months,
          values.map((v) => v * a)
        ).slopePerYear;
        // Scale-free comparison (an absolute tolerance can't span the range).
        if (Math.abs(base) > 1e-9) {
          expect(scaled / base).toBeCloseTo(a, 6);
        } else {
          expect(Math.abs(scaled)).toBeLessThan(1e-6);
        }
        const p0 = seasonalMannKendall(months, values).pValue;
        const p1 = seasonalMannKendall(
          months,
          values.map((v) => v * a)
        ).pValue;
        expect(p1).toBeCloseTo(p0, 6);
      })
    );
  });

  it("a pure seasonal cycle (constant per month) is never significant", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 3, max: 12 }),
        fc.subarray([1, 4, 7, 10], { minLength: 2 }),
        fc.array(fc.double({ min: -10, max: 10, noNaN: true }), {
          minLength: 12,
          maxLength: 12,
        }),
        (years, seasons, perMonth) => {
          const months: YearMonth[] = [];
          const values: number[] = [];
          for (let y = 0; y < years; y++) {
            for (const s of seasons) {
              months.push({ year: 2000 + y, month: s });
              values.push(perMonth[s - 1]); // identical every year
            }
          }
          // No within-season variation → S = 0 → not significant, ever.
          expect(seasonalMannKendall(months, values).S).toBe(0);
          expect(trendSummary(months, values, scale).significant).toBe(false);
        }
      )
    );
  });

  it("a strictly increasing long series is always significant and rising", () => {
    fc.assert(
      fc.property(
        fc.subarray([1, 7], { minLength: 1, maxLength: 2 }),
        fc.array(fc.double({ min: 0.01, max: 5, noNaN: true }), {
          minLength: 200,
          maxLength: 200,
        }),
        (seasons, steps) => {
          const months: YearMonth[] = [];
          const values: number[] = [];
          let acc = 0;
          let k = 0;
          for (let y = 0; y < 8; y++) {
            for (const s of seasons) {
              acc += steps[k++ % steps.length]; // strictly increasing in time
              months.push({ year: 2000 + y, month: s });
              values.push(acc);
            }
          }
          const t = trendSummary(months, values, scale);
          expect(t.significant).toBe(true);
          expect(t.direction).toBe("rising");
          expect(t.slopePerYear).toBeGreaterThan(0);
        }
      )
    );
  });
});
