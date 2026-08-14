import { describe, it, expect } from "vitest";
import {
  seasonalMannKendall,
  sensSlope,
  trendSummary,
  trendClause,
  trendCsvHeaders,
  formatPerDecade,
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

  it("marks both CI limits unresolved when the ranks fall outside the sample", () => {
    // The shortest record the app will report a trend for: one season, three
    // years. z·√varS (3.75) exceeds the three pairwise slopes available, so
    // both ranks land outside the sample and the returned bounds are the
    // extreme observed slopes, not located confidence limits.
    const { months, values } = series([2000, 2001, 2002], [1], (y) => y - 2000);
    const sen = sensSlope(months, values);
    expect(sen.nPairs).toBe(3);
    expect(sen.lowerResolved).toBe(false);
    expect(sen.upperResolved).toBe(false);
    // Every pair rises by exactly 1/yr, so the clamped range excludes zero —
    // which is precisely why it must not be reported as a confidence interval.
    expect(sen.lowerPerYear).toBe(1);
    expect(sen.upperPerYear).toBe(1);
  });

  it("resolves both CI limits on a record long enough to contain them", () => {
    const { months, values } = series(
      Array.from({ length: 8 }, (_, i) => 2000 + i),
      [1, 7],
      (y, m) => (m === 1 ? 0.2 : 0.5) + (y - 2000) * 0.02
    );
    const sen = sensSlope(months, values);
    expect(sen.lowerResolved).toBe(true);
    expect(sen.upperResolved).toBe(true);
    expect(sen.lowerPerYear).toBeLessThanOrEqual(sen.slopePerYear);
    expect(sen.upperPerYear).toBeGreaterThanOrEqual(sen.slopePerYear);
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
    expect(t.testable).toBe(false);
    expect(t.significant).toBe(false);
    expect(t.direction).toBe("flat");
  });
});

describe("trend formatting", () => {
  const scale = PROBE_SCALES.ndvi;
  const kelvin = PROBE_SCALES.lst;

  const rising = (s: typeof scale) => {
    const { months, values } = series(
      Array.from({ length: 8 }, (_, i) => 2000 + i),
      [1, 7],
      (y, m) => (m === 1 ? 0.2 : 0.5) + (y - 2000) * 0.02
    );
    return trendSummary(months, values, s);
  };

  it("formats a per-decade rate with sign, adaptive precision, and unit", () => {
    expect(formatPerDecade(0.018, "")).toBe("+0.018/decade");
    expect(formatPerDecade(-2.4, "K")).toBe("−2.40 K/decade");
    expect(formatPerDecade(12.3, "K")).toBe("+12.3 K/decade");
  });

  it("clause names the slope and p when significant", () => {
    expect(trendClause(rising(scale))).toMatch(
      /^trend \+0\.2\d\d\/decade · p = 0\.\d{3}$/
    );
  });

  it("clause reports insufficient record explicitly", () => {
    const t = trendSummary([{ year: 2000, month: 1 }], [0.5], scale);
    expect(trendClause(t)).toBe("trend: insufficient record");
  });

  it("CSV headers name the method and carry the stats when testable", () => {
    const headers = trendCsvHeaders(rising(kelvin));
    expect(headers.some((h) => h.startsWith("# trend_method:"))).toBe(true);
    expect(headers.some((h) => /# trend_sens_slope:.*K\/decade/.test(h))).toBe(
      true
    );
    expect(headers.some((h) => /# trend_p_value: 0\.\d{4}/.test(h))).toBe(true);
    expect(headers.some((h) => /# trend_significant: true/.test(h))).toBe(true);
  });

  it("CSV headers state a numeric CI only when the ranks were located", () => {
    const headers = trendCsvHeaders(rising(kelvin));
    const slope = headers.find((h) => h.startsWith("# trend_sens_slope:"))!;
    expect(slope).toMatch(/\(95% CI [+−]\d.*K\/decade – [+−]\d.*K\/decade\)$/);
    expect(slope).not.toContain("not resolvable");
  });

  it("withholds the CI when its ranks fall outside a short record", () => {
    // Three Januaries rising by 1 K/yr: testable, but not significant. Before
    // this, the clamped bounds printed as "(95% CI +10.0 K/decade – +10.0
    // K/decade)" — a zero-width interval excluding zero, on the same export as
    // trend_significant: false. A reader trusting the interval would have
    // concluded a trend the test on the next line explicitly refused.
    const { months, values } = series(
      [2000, 2001, 2002],
      [1],
      (y) => 273 + (y - 2000)
    );
    const t = trendSummary(months, values, kelvin);
    expect(t.testable).toBe(true);
    expect(t.significant).toBe(false);

    const headers = trendCsvHeaders(t);
    const slope = headers.find((h) => h.startsWith("# trend_sens_slope:"))!;
    // The slope itself is still reported — only the interval is withheld.
    expect(slope).toContain("+10.0 K/decade");
    expect(slope).toContain(
      "(95% CI not resolvable from this record: both rank-based limits fall " +
        "outside the 3 within-season pairwise slopes it supplies, so the " +
        "interval is wider than the observed slope range)"
    );
    expect(headers).toContain(
      `# trend_significant: false (alpha ${TREND_ALPHA})`
    );
  });

  it("withholds the CI when every within-season pair is tied", () => {
    const { months, values } = series([2000, 2001, 2002], [1], () => 273.15);
    const t = trendSummary(months, values, kelvin);
    expect(t.testable).toBe(true);
    expect(t.varS).toBe(0);
    const slope = trendCsvHeaders(t).find((h) =>
      h.startsWith("# trend_sens_slope:")
    )!;
    expect(slope).toContain("Mann-Kendall variance is zero");
    expect(slope).not.toMatch(/95% CI [+−]/);
  });

  it("emits no trend headers for an untestable record", () => {
    expect(
      trendCsvHeaders(trendSummary([{ year: 2000, month: 1 }], [0.5], scale))
    ).toEqual([]);
  });
});
