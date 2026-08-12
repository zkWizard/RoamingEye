import { describe, expect, it } from "vitest";
import {
  MINIMUM_ANOMALY_BASELINE_YEARS,
  anomalyBaselineCsvHeaders,
  anomalyBaselineDepth,
} from "./anomalyBaselineDepth";
import { anomalySeries } from "./probe";
import type { YearMonth } from "./timeline";

/** `years` of contiguous monthly months starting at January of `startYear`. */
function monthlyRecord(startYear: number, years: number): YearMonth[] {
  const months: YearMonth[] = [];
  for (let y = 0; y < years; y++) {
    for (let m = 1; m <= 12; m++) {
      months.push({ year: startYear + y, month: m });
    }
  }
  return months;
}

/** A clean 2 m air-temperature seasonal cycle in kelvin — no trend. */
function seasonalCycle(months: readonly YearMonth[]): number[] {
  return months.map(
    (ym) => 288 + 10 * Math.cos(((ym.month - 7) / 12) * 2 * Math.PI)
  );
}

describe("anomalyBaselineDepth", () => {
  it("counts the years backing every calendar month of a full record", () => {
    const months = monthlyRecord(2001, 4);
    const depth = anomalyBaselineDepth(months, seasonalCycle(months));

    expect(depth.yearsByCalendarMonth).toEqual(new Array(12).fill(4));
    expect(depth.calendarMonthsCovered).toBe(12);
    expect(depth.minYears).toBe(4);
    expect(depth.maxYears).toBe(4);
    expect(depth.selfReferentialCalendarMonths).toEqual([]);
    expect(depth.selfReferentialEntryCount).toBe(0);
  });

  it("flags the calendar months whose anomaly is zero by construction", () => {
    const months = monthlyRecord(2001, 3);
    const values: (number | null)[] = seasonalCycle(months);
    // Two of the three Augusts came back as no-data, the way a masked month
    // does. August then rests on a single year, so its surviving anomaly is
    // its own value minus itself.
    let droppedAugusts = 0;
    months.forEach((ym, i) => {
      if (ym.month === 8 && droppedAugusts++ < 2) values[i] = null;
    });

    const depth = anomalyBaselineDepth(months, values);
    expect(depth.yearsByCalendarMonth[7]).toBe(1);
    expect(depth.selfReferentialCalendarMonths).toEqual([8]);
    expect(depth.selfReferentialEntryCount).toBe(1);
    expect(depth.minYears).toBe(1);
    expect(depth.maxYears).toBe(3);
    expect(depth.calendarMonthsCovered).toBe(12);

    // The defect the depth is measuring: the sole August reports an exact
    // zero that is indistinguishable from a measured "exactly average".
    const anomalies = anomalySeries(months, values);
    const soleAugust = months.findIndex(
      (ym, i) => ym.month === 8 && values[i] !== null
    );
    expect(anomalies[soleAugust]).toBe(0);
  });

  it("treats a calendar month with no usable value as uncovered", () => {
    const months = monthlyRecord(2001, 2);
    const values: (number | null)[] = seasonalCycle(months);
    months.forEach((ym, i) => {
      if (ym.month === 3) values[i] = null;
    });

    const depth = anomalyBaselineDepth(months, values);
    expect(depth.yearsByCalendarMonth[2]).toBe(0);
    expect(depth.calendarMonthsCovered).toBe(11);
    // A month with no baseline already exports a blank anomaly, so it is not
    // a fabricated zero and must not be reported as one.
    expect(depth.selfReferentialCalendarMonths).toEqual([]);
    expect(depth.minYears).toBe(2);
  });

  it("counts distinct years so a repeated month cannot deepen the baseline", () => {
    const months: YearMonth[] = [
      { year: 2020, month: 6 },
      { year: 2020, month: 6 },
    ];

    const depth = anomalyBaselineDepth(months, [0.4, 0.6]);
    expect(depth.yearsByCalendarMonth[5]).toBe(1);
    expect(depth.selfReferentialCalendarMonths).toEqual([6]);
    // Both rows sit on the same degenerate mean, so both are flagged.
    expect(depth.selfReferentialEntryCount).toBe(2);
  });

  it("excludes non-finite values exactly as the climatology does", () => {
    const months: YearMonth[] = [
      { year: 2020, month: 5 },
      { year: 2021, month: 5 },
    ];

    const depth = anomalyBaselineDepth(months, [0.4, Number.NaN]);
    expect(depth.yearsByCalendarMonth[4]).toBe(1);
    expect(depth.selfReferentialCalendarMonths).toEqual([5]);
  });

  it("ignores entries carrying an out-of-range calendar month", () => {
    const months = [
      { year: 2020, month: 0 },
      { year: 2020, month: 13 },
      { year: 2020, month: 4 },
    ];

    const depth = anomalyBaselineDepth(months, [0.1, 0.2, 0.3]);
    expect(depth.calendarMonthsCovered).toBe(1);
    expect(depth.yearsByCalendarMonth[3]).toBe(1);
  });

  it("reports an empty record without inventing a depth", () => {
    const depth = anomalyBaselineDepth([], []);
    expect(depth.minYears).toBeNull();
    expect(depth.maxYears).toBeNull();
    expect(depth.calendarMonthsCovered).toBe(0);
    expect(depth.selfReferentialCalendarMonths).toEqual([]);
  });

  it("keeps two years as the floor for a non-degenerate departure", () => {
    expect(MINIMUM_ANOMALY_BASELINE_YEARS).toBe(2);
  });
});

describe("anomalyBaselineCsvHeaders", () => {
  it("states an even baseline depth without a caveat line", () => {
    const months = monthlyRecord(2001, 4);
    const headers = anomalyBaselineCsvHeaders(
      anomalyBaselineDepth(months, seasonalCycle(months))
    );

    expect(headers).toEqual([
      "# anomaly_baseline_years: 4 per calendar month over 12 of 12 calendar months",
    ]);
  });

  it("names the calendar months whose anomaly is not a measured departure", () => {
    const months = monthlyRecord(2001, 3);
    const values: (number | null)[] = seasonalCycle(months);
    let droppedAugusts = 0;
    months.forEach((ym, i) => {
      if (ym.month === 8 && droppedAugusts++ < 2) values[i] = null;
    });

    const headers = anomalyBaselineCsvHeaders(
      anomalyBaselineDepth(months, values)
    );
    expect(headers[0]).toContain("1-3 per calendar month");
    expect(headers[1]).toContain("calendar month(s) 08");
    expect(headers[1]).toContain("1 row report");
    expect(headers[1]).toContain("exactly zero by construction");
  });

  it("counts every affected row when a calendar month repeats a year", () => {
    const headers = anomalyBaselineCsvHeaders(
      anomalyBaselineDepth(
        [
          { year: 2020, month: 6 },
          { year: 2020, month: 6 },
        ],
        [0.4, 0.6]
      )
    );
    expect(headers[1]).toContain("2 rows report");
  });

  it("says so plainly when no observation backs the baseline", () => {
    expect(anomalyBaselineCsvHeaders(anomalyBaselineDepth([], []))).toEqual([
      "# anomaly_baseline_years: no usable observations in this record",
    ]);
  });

  it("keeps every header line a single comma-free CSV field", () => {
    const months = monthlyRecord(2001, 2);
    const values: (number | null)[] = seasonalCycle(months);
    values[months.findIndex((ym) => ym.year === 2002 && ym.month === 11)] =
      null;

    for (const line of anomalyBaselineCsvHeaders(
      anomalyBaselineDepth(months, values)
    )) {
      expect(line.startsWith("# ")).toBe(true);
      expect(line).not.toContain(",");
      expect(line).not.toMatch(/[\r\n]/);
    }
  });
});
