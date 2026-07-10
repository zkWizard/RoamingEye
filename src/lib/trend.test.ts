import { describe, it, expect } from "vitest";
import {
  seasonalMannKendall,
  sensSlope,
  trendSummary,
  TREND_ALPHA,
} from "./trend";
import type { YearMonth } from "./timeline";
import { PROBE_SCALES } from "./probe";

/** Build a monthly series from per-year values for a fixed set of months. */
function series(
  years: number[],
  monthsUsed: number[],
  valueAt: (year: number, month: number) => number | null
): { months: YearMonth[]; values: (number | null)[] } {
  const months: YearMonth[] = [];
  const values: (number | null)[] = [];
  for (const year of years) {
    for (const month of monthsUsed) {
      months.push({ year, month });
      values.push(valueAt(year, month));
    }
  }
  return { months, values };
}

describe("seasonalMannKendall", () => {
  it("matches a hand-computed small example exactly", () => {
    // Two seasons (Jan, Jul), three years, +0.1/yr in each season, no ties.
    const { months, values } = series([2000, 2001, 2002], [1, 7], (y, m) =>
      m === 1 ? 0.2 + (y - 2000) * 0.1 : 0.5 + (y - 2000) * 0.1
    );
    const mk = seasonalMannKendall(months, values);
    // Each season: S = +3 (all three pairs rising); variance 3·2·11/18 = 3.667.
    expect(mk.S).toBe(6);
    expect(mk.varS).toBeCloseTo(7.3333, 3);
    expect(mk.nSeasons).toBe(2);
    expect(mk.n).toBe(6);
    // 6 comparable pairs, all concordant → τ = 1.
    expect(mk.tau).toBeCloseTo(1, 6);
    // z = (6−1)/√7.333 ≈ 1.846 → two-sided p ≈ 0.065 (a 3-year record is
    // short — real but not yet significant, which is honest).
    expect(mk.z).toBeCloseTo(1.846, 2);
    expect(mk.pValue).toBeCloseTo(0.065, 2);
  });

  it("does not flag a pure seasonal cycle as a trend", () => {
    // Strong Jan/Jul contrast, flat across years: the plain MK test would
    // false-positive on the seasonal ordering; the seasonal test must not.
    const { months, values } = series(
      [2000, 2001, 2002, 2003, 2004],
      [1, 7],
      (_, m) => (m === 1 ? 0.2 : 0.8)
    );
    const mk = seasonalMannKendall(months, values);
    expect(mk.S).toBe(0);
    expect(mk.pValue).toBe(1);
  });

  it("finds a significant trend in a long monotone series", () => {
    const { months, values } = series(
      [2000, 2001, 2002, 2003, 2004, 2005, 2006, 2007],
      [1, 7],
      (y, m) => (m === 1 ? 0.2 : 0.5) + (y - 2000) * 0.05
    );
    const mk = seasonalMannKendall(months, values);
    expect(mk.pValue).toBeLessThan(TREND_ALPHA);
    expect(mk.S).toBeGreaterThan(0);
  });

  it("returns a null result for a series with no comparable pair", () => {
    const mk = seasonalMannKendall([{ year: 2000, month: 1 }], [0.5]);
    expect(mk.S).toBe(0);
    expect(mk.pValue).toBe(1);
    expect(mk.nSeasons).toBe(0);
  });
});

describe("sensSlope", () => {
  it("recovers the injected rate as the median pairwise slope", () => {
    const { months, values } = series(
      [2000, 2001, 2002, 2003],
      [1, 7],
      (y, m) => (m === 1 ? 0.2 : 0.5) + (y - 2000) * 0.1
    );
    const sen = sensSlope(months, values);
    expect(sen.slopePerYear).toBeCloseTo(0.1, 6);
    expect(sen.nPairs).toBe(12); // C(4,2) per season × 2 seasons
    expect(sen.lowerPerYear).toBeLessThanOrEqual(sen.slopePerYear);
    expect(sen.upperPerYear).toBeGreaterThanOrEqual(sen.slopePerYear);
  });

  it("is robust to a single outlier (median, not mean)", () => {
    // One wild year shouldn't drag the slope the way least-squares would.
    const { months, values } = series(
      [2000, 2001, 2002, 2003, 2004],
      [1],
      (y) => (y === 2002 ? 9.9 : (y - 2000) * 0.1)
    );
    const sen = sensSlope(months, values);
    expect(sen.slopePerYear).toBeCloseTo(0.1, 1);
  });
});

describe("trendSummary", () => {
  const scale = PROBE_SCALES.ndvi;

  it("reports a rising, significant trend with per-decade magnitude", () => {
    const { months, values } = series(
      Array.from({ length: 8 }, (_, i) => 2000 + i),
      [1, 7],
      (y, m) => (m === 1 ? 0.2 : 0.5) + (y - 2000) * 0.02
    );
    const t = trendSummary(months, values, scale);
    expect(t.significant).toBe(true);
    expect(t.direction).toBe("rising");
    expect(t.perDecade).toBeCloseTo(0.2, 2); // 0.02/yr × 10
  });

  it("calls a short record flat even if the formula p is low", () => {
    // Two years: not enough record to claim a trend, whatever the arithmetic.
    const { months, values } = series(
      [2000, 2001],
      [1, 4, 7, 10],
      (y, m) => (y - 2000) * 0.3 + m * 0.001
    );
    const t = trendSummary(months, values, scale);
    expect(t.significant).toBe(false);
    expect(t.direction).toBe("flat");
  });
});
