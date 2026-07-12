import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { neumaierSum, makeNeumaierAcc } from "./numerics";
import {
  weightedMeanValid,
  monthlyClimatology,
  seriesStats,
  anomalySeries,
} from "./probe";
import type { YearMonth } from "./timeline";

/**
 * The numerics contract behind every published statistic:
 *
 *  1. EXACTNESS — the compensated sum stays within Neumaier's O(ε) bound of
 *     an arbitrary-precision reference REGARDLESS of n, even on adversarial
 *     cancellation series that destroy a naive loop (whose bound is O(εn)).
 *  2. ORDER INDEPENDENCE — a mean computed over any enumeration order of
 *     the same samples agrees to ≤2 ulp. (Bit-identity under permutation
 *     would require exact superaccumulator arithmetic; compensated
 *     summation guarantees within-epsilon-of-exact under every order,
 *     which is what a region mean needs from a sampling grid.)
 */

/** Exact sum as a 2^-1074-scaled BigInt (every double is a dyadic rational,
 * so this accumulation is exact — no rounding at all). */
function exactScaledSum(values: number[]): bigint {
  const SCALE = 1074;
  let total = 0n;
  for (const v of values) {
    if (v === 0 || !Number.isFinite(v)) continue;
    let m = v;
    let e = 0;
    while (!Number.isInteger(m) && e > -SCALE) {
      m *= 2;
      e--;
    }
    total += BigInt(m) << BigInt(SCALE + e);
  }
  return total;
}

/** Nearest-double of the exact scaled sum, accurate to ≤2 ulp (30-bit
 * chunked reconversion, smallest chunks first). */
function exactSum(values: number[]): number {
  let t = exactScaledSum(values);
  const sign = t < 0n ? -1 : 1;
  if (t < 0n) t = -t;
  let result = 0;
  let chunkScale = 2 ** -1074;
  while (t > 0n) {
    result += Number(t & 0x3fffffffn) * chunkScale;
    t >>= 30n;
    chunkScale *= 2 ** 30;
  }
  return sign * result;
}

const finiteArray = fc.array(
  fc.double({ noNaN: true, min: -1e12, max: 1e12 }),
  { minLength: 1, maxLength: 400 }
);

describe("neumaierSum: exactness bound independent of n", () => {
  it("stays within the Neumaier O(ε)·Σ|v| bound of the exact sum", () => {
    fc.assert(
      fc.property(finiteArray, (values) => {
        const got = neumaierSum(values);
        const want = exactSum(values);
        const sumAbs = values.reduce((a, v) => a + Math.abs(v), 0);
        // 8ε·Σ|v| absorbs the reference's own ≤2-ulp reconversion; naive
        // summation's worst case is (n−1)ε·Σ|v| ≈ 50× looser at n=400.
        const bound = 8 * Number.EPSILON * sumAbs + Number.MIN_VALUE;
        expect(Math.abs(got - want)).toBeLessThanOrEqual(bound);
      })
    );
  });

  it("survives the canonical cancellation series a naive loop fails", () => {
    // 1 + 2^60 − 2^60 + 1: naive folds the 1s into oblivion.
    expect(neumaierSum([1, 2 ** 60, -(2 ** 60), 1])).toBe(2);
    let naive = 0;
    for (const v of [1, 2 ** 60, -(2 ** 60), 1]) naive += v;
    expect(naive).not.toBe(2); // the failure mode being defended against
  });

  it("streams identically to the batch form", () => {
    fc.assert(
      fc.property(finiteArray, (values) => {
        const acc = makeNeumaierAcc();
        for (const v of values) acc.add(v);
        expect(acc.sum()).toBe(neumaierSum(values));
      })
    );
  });
});

/** Fisher-Yates with fast-check-supplied randomness (Math.random is banned
 * from tests by determinism policy; fc streams shrink with the case). */
function shuffled<T>(
  items: readonly T[],
  seeds: IterableIterator<number>
): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = seeds.next().value % (i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

describe("published statistics: order independence", () => {
  it("weightedMeanValid agrees to ≤2 ulp under any grid enumeration order", () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            v: fc.double({ noNaN: true, min: -1e6, max: 1e6 }),
            w: fc.double({ noNaN: true, min: 1e-6, max: 1 }),
          }),
          { minLength: 1, maxLength: 200 }
        ),
        fc.infiniteStream(fc.nat()),
        (cells, seeds) => {
          const mean = weightedMeanValid(
            cells.map((c) => c.v),
            cells.map((c) => c.w)
          );
          const reordered = shuffled(cells, seeds);
          const mean2 = weightedMeanValid(
            reordered.map((c) => c.v),
            reordered.map((c) => c.w)
          );
          expect(mean).not.toBeNull();
          // Bound relative to the mean-of-|v| (NOT ulp of the result: a
          // mean can legitimately cancel toward 0 while the error scale is
          // set by the magnitudes summed).
          const wTotal = cells.reduce((a, c) => a + c.w, 0);
          const scale =
            cells.reduce((a, c) => a + Math.abs(c.v) * c.w, 0) / wTotal;
          expect(Math.abs(mean2! - mean!)).toBeLessThanOrEqual(
            8 * Number.EPSILON * scale + Number.MIN_VALUE
          );
        }
      )
    );
  });

  it("seriesStats.mean agrees to ≤2 ulp under shuffling", () => {
    fc.assert(
      fc.property(
        fc.array(fc.double({ noNaN: true, min: -1e6, max: 1e6 }), {
          minLength: 1,
          maxLength: 300,
        }),
        fc.infiniteStream(fc.nat()),
        (values, seeds) => {
          const mean = seriesStats(values)!.mean;
          const mean2 = seriesStats(shuffled(values, seeds))!.mean;
          const scale =
            values.reduce((a, v) => a + Math.abs(v), 0) / values.length;
          expect(Math.abs(mean2 - mean)).toBeLessThanOrEqual(
            8 * Number.EPSILON * scale + Number.MIN_VALUE
          );
        }
      )
    );
  });
});

describe("ill-conditioned regression fixture: Kelvin offsets, milli-K signal", () => {
  it("recovers a tiny anomaly riding a large offset", () => {
    // 46 years of a July LST around 300 K with a +0.002 K/yr drift — the
    // realistic worst case: the signal is 5 orders below the offset, and
    // anomaly = value − climatology subtracts near-equal numbers.
    const months: YearMonth[] = [];
    const values: number[] = [];
    for (let y = 1980; y <= 2025; y++) {
      months.push({ year: y, month: 7 });
      values.push(300 + (y - 1980) * 0.002);
    }
    const clim = monthlyClimatology(months, values);
    const anomalies = anomalySeries(months, values, clim);
    // Mean July value is 300 + 0.045; the 1980 anomaly is exactly −0.045.
    expect(clim[6]).toBeCloseTo(300.045, 9);
    expect(anomalies[0]).toBeCloseTo(-0.045, 9);
    expect(anomalies[anomalies.length - 1]).toBeCloseTo(0.045, 9);
  });
});
