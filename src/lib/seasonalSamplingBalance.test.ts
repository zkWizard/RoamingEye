import { describe, expect, it } from "vitest";
import {
  seasonalSamplingBalance,
  seasonalSamplingClause,
  seasonalSamplingCsvHeaders,
} from "./seasonalSamplingBalance";
import { PROBE_SCALES, quantizationStep } from "./probe";
import type { YearMonth } from "./timeline";

const AIRTEMP = PROBE_SCALES.airtemp;

/** `years` of contiguous monthly months starting at January of `startYear`. */
function monthlyRecord(startYear: number, years: number): YearMonth[] {
  const months: YearMonth[] = [];
  for (let y = 0; y < years; y++) {
    for (let m = 1; m <= 12; m++)
      months.push({ year: startYear + y, month: m });
  }
  return months;
}

/**
 * A clean seasonal cycle with no trend: every January is the coldest month,
 * every July the warmest. Its true annual mean is exactly `base`.
 */
function seasonalCycle(months: YearMonth[], base: number, amplitude: number) {
  return months.map(
    (ym) => base + amplitude * Math.cos(((ym.month - 7) / 12) * 2 * Math.PI)
  );
}

describe("seasonalSamplingBalance", () => {
  it("reports no bias when every calendar month is sampled equally often", () => {
    const months = monthlyRecord(2001, 3);
    const balance = seasonalSamplingBalance(
      months,
      seasonalCycle(months, 288, 10)
    );

    expect(balance.coversFullYear).toBe(true);
    expect(balance.absentCalendarMonths).toEqual([]);
    expect(balance.samplesByCalendarMonth).toEqual(new Array(12).fill(3));
    expect(balance.recordMean).toBeCloseTo(288, 10);
    expect(balance.calendarBalancedMean).toBeCloseTo(288, 10);
    expect(balance.seasonalSamplingBias).toBeCloseTo(0, 10);
  });

  it("measures the warm bias left by a record that drops its winters", () => {
    const months = monthlyRecord(2001, 3);
    const values: (number | null)[] = seasonalCycle(months, 288, 10);
    // Two of the three Januaries and Februaries came back as no-data, the way
    // a masked or unpublished winter month does. Every calendar month still
    // carries at least one sample, so the balanced mean stays computable.
    let droppedJan = 0;
    let droppedFeb = 0;
    months.forEach((ym, i) => {
      if (ym.month === 1 && droppedJan++ < 2) values[i] = null;
      if (ym.month === 2 && droppedFeb++ < 2) values[i] = null;
    });

    const balance = seasonalSamplingBalance(months, values);
    expect(balance.samplesByCalendarMonth[0]).toBe(1);
    expect(balance.samplesByCalendarMonth[1]).toBe(1);
    expect(balance.absentCalendarMonths).toEqual([]);
    // The surviving months skew summer-heavy, so the plain mean runs warm and
    // the balanced mean sits below it.
    expect(balance.recordMean!).toBeGreaterThan(288);
    expect(balance.calendarBalancedMean).toBeCloseTo(288, 10);
    expect(balance.seasonalSamplingBias!).toBeLessThan(0);
    expect(balance.calendarBalancedMean! - balance.recordMean!).toBeCloseTo(
      balance.seasonalSamplingBias!,
      12
    );
  });

  it("withholds the balanced mean when a calendar month is wholly absent", () => {
    const months = monthlyRecord(2001, 2);
    const values: (number | null)[] = seasonalCycle(months, 288, 10);
    months.forEach((ym, i) => {
      if (ym.month === 7 || ym.month === 8) values[i] = null;
    });

    const balance = seasonalSamplingBalance(months, values);
    expect(balance.absentCalendarMonths).toEqual([7, 8]);
    // Never gap-filled from the ten months that survived.
    expect(balance.calendarBalancedMean).toBeNull();
    expect(balance.seasonalSamplingBias).toBeNull();
    expect(balance.recordMean).not.toBeNull();
  });

  it("marks a sub-annual request as not covering a full year", () => {
    const months: YearMonth[] = [
      { year: 2001, month: 4 },
      { year: 2001, month: 5 },
      { year: 2001, month: 6 },
    ];
    const balance = seasonalSamplingBalance(months, [280, 285, 290]);

    expect(balance.coversFullYear).toBe(false);
    expect(balance.absentCalendarMonths).toEqual([]);
    expect(balance.calendarBalancedMean).toBeNull();
    expect(balance.recordMean).toBeCloseTo(285, 10);
  });

  it("counts no usable sample for null, undefined, or non-finite values", () => {
    const months = monthlyRecord(2001, 1);
    const values: (number | null)[] = new Array(12).fill(null);
    values[0] = Number.NaN;
    values[1] = 290;

    const balance = seasonalSamplingBalance(months, values);
    expect(balance.samplesByCalendarMonth[0]).toBe(0);
    expect(balance.recordMean).toBe(290);
    expect(balance.absentCalendarMonths).toHaveLength(11);
    expect(balance.calendarBalancedMean).toBeNull();
  });

  it("reports nothing at all for an empty record", () => {
    const balance = seasonalSamplingBalance([], []);
    expect(balance.coversFullYear).toBe(false);
    expect(balance.recordMean).toBeNull();
    expect(balance.seasonalSamplingBias).toBeNull();
  });

  it("ignores months outside 1-12 rather than indexing past the calendar", () => {
    const months = [
      { year: 2001, month: 0 },
      { year: 2001, month: 13 },
      { year: 2001, month: 6 },
    ] as YearMonth[];
    const balance = seasonalSamplingBalance(months, [1, 2, 300]);

    expect(balance.samplesByCalendarMonth).toHaveLength(12);
    expect(balance.recordMean).toBe(300);
    expect(balance.coversFullYear).toBe(false);
  });
});

describe("seasonalSamplingClause", () => {
  it("stays silent when the record is seasonally balanced", () => {
    const months = monthlyRecord(2001, 3);
    const balance = seasonalSamplingBalance(
      months,
      seasonalCycle(months, 288, 10)
    );
    expect(seasonalSamplingClause(balance, AIRTEMP)).toBeNull();
  });

  it("stays silent for a sub-annual record, which has no annual mean to miss", () => {
    const balance = seasonalSamplingBalance(
      [
        { year: 2001, month: 4 },
        { year: 2001, month: 5 },
      ],
      [280, 285]
    );
    expect(seasonalSamplingClause(balance, AIRTEMP)).toBeNull();
  });

  it("stays silent when the bias is finer than one quantization step", () => {
    const months = monthlyRecord(2001, 2);
    const values: (number | null)[] = seasonalCycle(months, 288, 10);
    // Drop one month whose value sits essentially on the annual mean, so the
    // re-weighting moves the mean by far less than the inversion can resolve.
    const aprilIndex = months.findIndex((ym) => ym.month === 4);
    values[aprilIndex] = null;

    const balance = seasonalSamplingBalance(months, values);
    expect(Math.abs(balance.seasonalSamplingBias!)).toBeLessThan(
      quantizationStep(AIRTEMP)
    );
    expect(seasonalSamplingClause(balance, AIRTEMP)).toBeNull();
  });

  it("names the absent calendar months instead of quoting a bias it cannot compute", () => {
    const months = monthlyRecord(2001, 2);
    const values: (number | null)[] = seasonalCycle(months, 288, 10);
    months.forEach((ym, i) => {
      if (ym.month === 1 || ym.month === 12) values[i] = null;
    });

    const clause = seasonalSamplingClause(
      seasonalSamplingBalance(months, values),
      AIRTEMP
    );
    expect(clause).toBe(
      "mean covers 10 of 12 calendar months (no Jan, Dec), so it is not an annual mean" +
        "; min and max share those months and are not annual extremes"
    );
  });

  it("disclaims the extremes beside the mean, which are reduced from the same gapped months", () => {
    const months = monthlyRecord(2001, 2);
    const values: (number | null)[] = seasonalCycle(months, 288, 10);
    // Lose every January: the coldest calendar month never enters the record,
    // so the reported min is the coldest of the eleven that survived — not the
    // coldest month of the year at this point.
    months.forEach((ym, i) => {
      if (ym.month === 1) values[i] = null;
    });

    const balance = seasonalSamplingBalance(months, values);
    expect(balance.absentCalendarMonths).toEqual([1]);
    const clause = seasonalSamplingClause(balance, AIRTEMP)!;
    expect(clause).toContain("min and max");
    expect(clause).toContain("not annual extremes");
  });

  it("leaves the extremes unqualified when every calendar month is sampled", () => {
    // All twelve calendar months carry a sample, so the extremes are drawn from
    // the full calendar and only the mean's weighting is uneven. Disclaiming
    // them here would withhold a number the record actually supports.
    const months = monthlyRecord(2001, 3);
    const values: (number | null)[] = seasonalCycle(months, 288, 10);
    let droppedJan = 0;
    months.forEach((ym, i) => {
      if (ym.month === 1 && droppedJan++ < 2) values[i] = null;
    });

    const balance = seasonalSamplingBalance(months, values);
    expect(balance.absentCalendarMonths).toEqual([]);
    const clause = seasonalSamplingClause(balance, AIRTEMP)!;
    expect(clause).not.toContain("extremes");
  });

  it("quantifies a resolvable bias in the scale's own units", () => {
    const months = monthlyRecord(2001, 3);
    const values: (number | null)[] = seasonalCycle(months, 288, 10);
    let droppedJan = 0;
    months.forEach((ym, i) => {
      if (ym.month === 1 && droppedJan++ < 2) values[i] = null;
    });

    const balance = seasonalSamplingBalance(months, values);
    const clause = seasonalSamplingClause(balance, AIRTEMP)!;
    expect(clause).toMatch(/^uneven calendar-month sampling: balanced mean /);
    // The dropped months were the coldest, so the balanced mean is the cooler
    // of the two and the reported offset is negative.
    expect(clause).toContain("(-");
    expect(clause).toContain(AIRTEMP.unit);
    expect(balance.seasonalSamplingBias!).toBeLessThan(0);
  });
});

describe("seasonalSamplingCsvHeaders", () => {
  it("stays silent for a record spread evenly across the calendar", () => {
    const months = monthlyRecord(2001, 3);
    const balance = seasonalSamplingBalance(
      months,
      seasonalCycle(months, 288, 10)
    );

    expect(seasonalSamplingCsvHeaders(balance, AIRTEMP)).toEqual([]);
  });

  it("stays silent for a sub-annual request", () => {
    // Four consecutive months have no annual mean to be biased away from, so
    // the export gains nothing by qualifying one.
    const months: YearMonth[] = [
      { year: 2001, month: 5 },
      { year: 2001, month: 6 },
      { year: 2001, month: 7 },
      { year: 2001, month: 8 },
    ];
    const balance = seasonalSamplingBalance(months, [280, 285, 290, 288]);

    expect(balance.coversFullYear).toBe(false);
    expect(seasonalSamplingCsvHeaders(balance, AIRTEMP)).toEqual([]);
  });

  it("stays silent when the bias is finer than the colormap resolves", () => {
    // A flat record: re-weighting the calendar cannot move a constant, so the
    // bias is zero and printing it would imply the method saw something.
    const months = monthlyRecord(2001, 3);
    const values: (number | null)[] = months.map(() => 288);
    values[0] = null;

    const balance = seasonalSamplingBalance(months, values);
    expect(Math.abs(balance.seasonalSamplingBias!)).toBeLessThan(
      quantizationStep(AIRTEMP)
    );
    expect(seasonalSamplingCsvHeaders(balance, AIRTEMP)).toEqual([]);
  });

  it("names the absent calendar months and disclaims mean and extremes", () => {
    const months = monthlyRecord(2001, 3);
    const values: (number | null)[] = seasonalCycle(months, 288, 10);
    months.forEach((ym, i) => {
      if (ym.month === 1 || ym.month === 2) values[i] = null;
    });

    const headers = seasonalSamplingCsvHeaders(
      seasonalSamplingBalance(months, values),
      AIRTEMP
    );
    expect(headers).toHaveLength(2);
    expect(headers[0]).toContain("2 of 12 calendar months return");
    expect(headers[0]).toContain("(Jan Feb)");
    expect(headers[0]).toContain("not an annual mean");
    // The extremes are reduced from the very same surviving months, so an
    // export that disclaimed only the mean would read as a claim that the
    // lowest and highest rows survived the gap.
    expect(headers[0]).toContain("not annual extremes");
    expect(headers[1]).toContain("never estimated or gap-filled");
  });

  it("agrees with the singular when exactly one calendar month is absent", () => {
    const months = monthlyRecord(2001, 3);
    const values: (number | null)[] = seasonalCycle(months, 288, 10);
    months.forEach((ym, i) => {
      if (ym.month === 1) values[i] = null;
    });

    const headers = seasonalSamplingCsvHeaders(
      seasonalSamplingBalance(months, values),
      AIRTEMP
    );
    expect(headers[0]).toContain("1 of 12 calendar months returns");
    expect(headers[0]).toContain("(Jan)");
  });

  it("quantifies a resolvable bias in the scale's own units", () => {
    const months = monthlyRecord(2001, 3);
    const values: (number | null)[] = seasonalCycle(months, 288, 10);
    let droppedJan = 0;
    months.forEach((ym, i) => {
      if (ym.month === 1 && droppedJan++ < 2) values[i] = null;
    });

    const balance = seasonalSamplingBalance(months, values);
    // Every calendar month still carries a sample, so this is the bias branch
    // rather than the absent-months one.
    expect(balance.absentCalendarMonths).toEqual([]);
    const headers = seasonalSamplingCsvHeaders(balance, AIRTEMP);
    expect(headers).toHaveLength(2);
    expect(headers[0]).toContain("# seasonal_sampling_bias:");
    expect(headers[0]).toContain(AIRTEMP.unit);
    // The under-sampled months were the coldest, so equal weighting pulls the
    // mean down and the offset is signed negative.
    expect(headers[0]).toContain("(-");
    expect(headers[1]).toContain("not a measurement");
  });

  it("keeps every line a single comma-free CSV field", () => {
    const months = monthlyRecord(2001, 3);
    const absent: (number | null)[] = seasonalCycle(months, 288, 10);
    months.forEach((ym, i) => {
      if (ym.month === 1 || ym.month === 11) absent[i] = null;
    });
    const uneven: (number | null)[] = seasonalCycle(months, 288, 10);
    let droppedJan = 0;
    months.forEach((ym, i) => {
      if (ym.month === 1 && droppedJan++ < 2) uneven[i] = null;
    });

    const lines = [
      ...seasonalSamplingCsvHeaders(
        seasonalSamplingBalance(months, absent),
        AIRTEMP
      ),
      ...seasonalSamplingCsvHeaders(
        seasonalSamplingBalance(months, uneven),
        AIRTEMP
      ),
    ];
    expect(lines).toHaveLength(4);
    for (const line of lines) {
      // The header contract documented on csvHeaderText in probe.ts: a naive
      // split(",") consumer must never tear one of these into ragged cells.
      expect(line.startsWith("# ")).toBe(true);
      expect(line).not.toContain(",");
      expect(line).not.toContain('"');
      expect(line).not.toMatch(/[\r\n]/);
    }
  });
});
