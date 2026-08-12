import { describe, expect, it } from "vitest";
import {
  NDVI_SOURCE,
  NDVI_UNIT,
  summarizeAnnualNdviPhenology,
  type NdviMonthlyObservation,
} from "./phenology";
import {
  NDVI_RECORD_START,
  NDVI_RECORD_WINDOW_LIMITATIONS,
  describeNdviRecordWindow,
  ndviRecordWindowText,
} from "./phenologyRecordWindow";

/** Monthly observations for a contiguous run of calendar months in one year. */
function months(
  year: number,
  from: number,
  to: number,
  ndvi: number | null = 0.5
): NdviMonthlyObservation[] {
  const out: NdviMonthlyObservation[] = [];
  for (let month = from; month <= to; month++) {
    out.push({ month: { year, month }, ndvi, validFraction: 0.9 });
  }
  return out;
}

const LATEST = { year: 2026, month: 5 };

describe("NDVI annual record window", () => {
  it("reads the record start from the cited MOD13A3 layer", () => {
    expect(NDVI_RECORD_START).toEqual({ year: 2000, month: 3 });
  });

  it("separates the product's own first-year gap from dropped coverage", () => {
    // MOD13A3 begins 2000-03, so Jan and Feb 2000 were never observable.
    const [summary] = summarizeAnnualNdviPhenology(months(2000, 3, 12), 48.8);
    // The annual summary alone cannot tell those apart...
    expect(summary.coverage.omittedCalendarMonths).toEqual([1, 2]);
    // ...and still reports extrema, because ten months clears the sparse floor.
    expect(summary.coverage.isSparse).toBe(false);
    expect(summary.peak).not.toBeNull();

    const window = describeNdviRecordWindow(summary, LATEST);

    expect(window.status).toBe("available");
    expect(window.absentMonths).toEqual([
      { month: 1, availability: "before-record-start", reason: null },
      { month: 2, availability: "before-record-start", reason: null },
    ]);
    expect(window.unpublishedCalendarMonths).toEqual([1, 2]);
    expect(window.unobservedPublishedCalendarMonths).toEqual([]);
    expect(window.publishedCalendarMonths).toEqual([
      3, 4, 5, 6, 7, 8, 9, 10, 11, 12,
    ]);
    expect(window.isPartialRecordYear).toBe(true);
    expect(window.isCompleteCalendarYear).toBe(false);
    expect(window.extremaBasis).toBe("partial-calendar-year");
  });

  it("marks the current year's unpublished tail as not yet published", () => {
    const [summary] = summarizeAnnualNdviPhenology(months(2026, 1, 5), 48.8);

    const window = describeNdviRecordWindow(summary, LATEST);

    expect(window.unpublishedCalendarMonths).toEqual([6, 7, 8, 9, 10, 11, 12]);
    expect(window.unobservedPublishedCalendarMonths).toEqual([]);
    expect(
      window.absentMonths.every(
        (absent) =>
          absent.availability === "not-yet-published" && absent.reason === null
      )
    ).toBe(true);
    expect(window.isPartialRecordYear).toBe(true);
  });

  it("distinguishes an unsupplied month from one supplied without a value", () => {
    const [summary] = summarizeAnnualNdviPhenology(
      [
        ...months(2015, 1, 6),
        // July omitted entirely; August arrives with no usable observation.
        ...months(2015, 8, 8, null),
        ...months(2015, 9, 12),
      ],
      48.8
    );

    const window = describeNdviRecordWindow(summary, LATEST);

    expect(window.absentMonths).toEqual([
      { month: 7, availability: "published", reason: "not-supplied" },
      { month: 8, availability: "published", reason: "no-usable-observation" },
    ]);
    expect(window.unobservedPublishedCalendarMonths).toEqual([7, 8]);
    expect(window.unpublishedCalendarMonths).toEqual([]);
    // The product covers all twelve months of 2015; only the sampling fell short.
    expect(window.isPartialRecordYear).toBe(false);
    expect(window.extremaBasis).toBe("partial-calendar-year");
  });

  it("treats a zero-coverage month as observed by neither path", () => {
    const [summary] = summarizeAnnualNdviPhenology(
      [
        ...months(2015, 1, 5),
        { month: { year: 2015, month: 6 }, ndvi: 0.7, validFraction: 0 },
        ...months(2015, 7, 12),
      ],
      48.8
    );

    const window = describeNdviRecordWindow(summary, LATEST);

    expect(window.absentMonths).toEqual([
      { month: 6, availability: "published", reason: "no-usable-observation" },
    ]);
  });

  it("reports a fully observed mid-record year as comparable", () => {
    const [summary] = summarizeAnnualNdviPhenology(months(2015, 1, 12), 48.8);

    const window = describeNdviRecordWindow(summary, LATEST);

    expect(window.absentMonths).toEqual([]);
    expect(window.unpublishedCalendarMonths).toEqual([]);
    expect(window.unobservedPublishedCalendarMonths).toEqual([]);
    expect(window.observedCalendarMonths).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12,
    ]);
    expect(window.isPartialRecordYear).toBe(false);
    expect(window.isCompleteCalendarYear).toBe(true);
    expect(window.extremaBasis).toBe("complete-calendar-year");
  });

  it("classifies a pre-record month by the product bound, not the publication bound", () => {
    const [summary] = summarizeAnnualNdviPhenology(months(2000, 3, 12), 48.8);

    // An availableThrough earlier than the record itself must not relabel
    // January and February as merely "not yet published".
    const window = describeNdviRecordWindow(summary, { year: 1999, month: 6 });

    expect(window.absentMonths.slice(0, 2)).toEqual([
      { month: 1, availability: "before-record-start", reason: null },
      { month: 2, availability: "before-record-start", reason: null },
    ]);
    expect(window.publishedCalendarMonths).toEqual([]);
    expect(window.unobservedPublishedCalendarMonths).toEqual([]);
  });

  it("retains MOD13A3 provenance, units, and stated limits", () => {
    const [summary] = summarizeAnnualNdviPhenology(months(2015, 1, 12), 48.8);

    const window = describeNdviRecordWindow(summary, LATEST);

    expect(window.source).toEqual(NDVI_SOURCE);
    expect(window.source.shortName).toBe("MOD13A3");
    expect(window.source.doi).toBe("10.5067/MODIS/MOD13A3.061");
    expect(window.unit).toBe(NDVI_UNIT);
    expect(window.limitations).toEqual(NDVI_RECORD_WINDOW_LIMITATIONS);
  });

  it("withholds a classification when an input is unusable", () => {
    const [summary] = summarizeAnnualNdviPhenology(months(2015, 1, 12), 48.8);

    for (const latest of [
      { year: 2026, month: 13 },
      { year: 2026, month: 0 },
      { year: Number.NaN, month: 5 },
    ]) {
      const window = describeNdviRecordWindow(summary, latest);
      expect(window.status).toBe("unavailable");
      expect(window.reason).toBe(
        "latest published month is not a calendar month"
      );
      // Empty means "not determined" here, never "no months absent".
      expect(window.absentMonths).toEqual([]);
      expect(window.isCompleteCalendarYear).toBe(false);
    }

    const noYear = describeNdviRecordWindow(
      { ...summary, year: Number.NaN },
      LATEST
    );
    expect(noYear.status).toBe("unavailable");
    expect(noYear.reason).toBe("annual summary has no valid year");
  });
});

describe("NDVI record window text", () => {
  it("names both kinds of absence without describing greenness", () => {
    const [summary] = summarizeAnnualNdviPhenology(
      [...months(2000, 3, 6), ...months(2000, 8, 12)],
      48.8
    );

    const text = ndviRecordWindowText(
      describeNdviRecordWindow(summary, LATEST)
    );

    expect(text).toBe(
      "2000: 9 of 12 calendar months observed; 2 not published by MOD13A3; " +
        "1 published but not observed · partial calendar year; extrema not " +
        "comparable with complete years"
    );
    expect(text).not.toMatch(/green|health|productiv|biomass|habitat/i);
  });

  it("states a complete year plainly", () => {
    const [summary] = summarizeAnnualNdviPhenology(months(2015, 1, 12), 48.8);

    expect(
      ndviRecordWindowText(describeNdviRecordWindow(summary, LATEST))
    ).toBe("2015: 12 of 12 calendar months observed · full calendar year");
  });

  it("surfaces the reason when no classification was made", () => {
    const [summary] = summarizeAnnualNdviPhenology(months(2015, 1, 12), 48.8);

    expect(
      ndviRecordWindowText(
        describeNdviRecordWindow(summary, { year: 2026, month: 13 })
      )
    ).toBe(
      "2015 NDVI record coverage unavailable: latest published month is not a calendar month"
    );
  });
});
