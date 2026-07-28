import { describe, expect, it } from "vitest";
import {
  MINIMUM_MONTHS_FOR_ANNUAL_EXTREMA,
  NDVI_SOURCE,
  NDVI_UNIT,
  meteorologicalSeasonForMonth,
  summarizeAnnualNdviPhenology,
} from "./phenology";

describe("annual NDVI phenology summaries", () => {
  it("reports observed annual extrema, coverage, units, and NASA provenance", () => {
    const [summary] = summarizeAnnualNdviPhenology(
      [
        { month: { year: 2025, month: 3 }, ndvi: 0.24, validFraction: 0.9 },
        { month: { year: 2025, month: 4 }, ndvi: 0.39, validFraction: 0.8 },
        { month: { year: 2025, month: 5 }, ndvi: 0.61, validFraction: 0.7 },
        { month: { year: 2025, month: 6 }, ndvi: 0.82, validFraction: 0.6 },
        { month: { year: 2025, month: 7 }, ndvi: 0.74, validFraction: 0.8 },
        { month: { year: 2025, month: 8 }, ndvi: 0.42, validFraction: 0.9 },
      ],
      48.8
    );

    expect(summary).toMatchObject({
      year: 2025,
      hemisphere: "northern",
      peak: {
        month: { year: 2025, month: 6 },
        ndvi: 0.82,
        meteorologicalSeason: "summer",
      },
      trough: { month: { year: 2025, month: 3 }, ndvi: 0.24 },
      seasonalRange: 0.58,
      coverage: {
        suppliedCalendarMonths: [3, 4, 5, 6, 7, 8],
        omittedCalendarMonths: [1, 2, 9, 10, 11, 12],
        validMonthCount: 6,
        missingMonthCount: 0,
        invalidRecordCount: 0,
        validFractionReportedCount: 6,
        validFractionUnavailableCount: 0,
        minimumValidFraction: 0.6,
        isSparse: false,
      },
      source: NDVI_SOURCE,
      unit: NDVI_UNIT,
    });
  });

  it("uses the opposite calendar-season convention in the southern hemisphere", () => {
    const [summary] = summarizeAnnualNdviPhenology(
      [1, 2, 3, 4, 5, 6].map((month) => ({
        month: { year: 2025, month },
        ndvi: month === 6 ? 0.8 : 0.2 + month / 100,
      })),
      -33.9
    );

    expect(summary.hemisphere).toBe("southern");
    expect(summary.peak?.meteorologicalSeason).toBe("winter");
    expect(meteorologicalSeasonForMonth(6, "northern")).toBe("summer");
  });

  it("keeps sparse, missing, invalid, and duplicate records explicit", () => {
    const [summary] = summarizeAnnualNdviPhenology(
      [
        { month: { year: 2025, month: 1 }, ndvi: 0.2, validFraction: 0.8 },
        { month: { year: 2025, month: 2 }, ndvi: null, validFraction: 0 },
        { month: { year: 2025, month: 3 }, ndvi: 0.3, validFraction: 0.7 },
        { month: { year: 2025, month: 4 }, ndvi: 1.2 },
        { month: { year: 2025, month: 5 }, ndvi: 0.4 },
        { month: { year: 2025, month: 5 }, ndvi: 0.5 },
      ],
      0
    );

    expect(MINIMUM_MONTHS_FOR_ANNUAL_EXTREMA).toBe(6);
    expect(summary).toMatchObject({
      hemisphere: "equatorial",
      peak: null,
      trough: null,
      seasonalRange: null,
      coverage: {
        suppliedCalendarMonths: [1, 2, 3, 4, 5],
        omittedCalendarMonths: [6, 7, 8, 9, 10, 11, 12],
        validMonthCount: 2,
        missingMonthCount: 1,
        invalidRecordCount: 3,
        validFractionReportedCount: 2,
        validFractionUnavailableCount: 0,
        minimumValidFraction: 0.7,
        isSparse: true,
      },
    });
  });

  it("preserves unavailable spatial coverage instead of assuming complete coverage", () => {
    const [summary] = summarizeAnnualNdviPhenology(
      [1, 2, 3, 4, 5, 6].map((month) => ({
        month: { year: 2025, month },
        ndvi: 0.2 + month / 100,
      })),
      48.8
    );

    expect(summary.coverage).toEqual({
      suppliedCalendarMonths: [1, 2, 3, 4, 5, 6],
      omittedCalendarMonths: [7, 8, 9, 10, 11, 12],
      validMonthCount: 6,
      missingMonthCount: 0,
      invalidRecordCount: 0,
      validFractionReportedCount: 0,
      validFractionUnavailableCount: 6,
      minimumValidFraction: null,
      isSparse: false,
    });
    expect(summary.peak?.month).toEqual({ year: 2025, month: 6 });
    expect(summary.source).toBe(NDVI_SOURCE);
    expect(summary.unit).toBe(NDVI_UNIT);
  });

  it("distinguishes omitted months from supplied unusable and duplicate records", () => {
    const [summary] = summarizeAnnualNdviPhenology(
      [
        { month: { year: 2025, month: 12 }, ndvi: null },
        { month: { year: 2025, month: 2 }, ndvi: 1.5 },
        { month: { year: 2025, month: 7 }, ndvi: 0.4 },
        { month: { year: 2025, month: 7 }, ndvi: 0.5 },
        { month: { year: 2025, month: 0 }, ndvi: 0.2 },
      ],
      45
    );

    expect(summary.coverage).toMatchObject({
      suppliedCalendarMonths: [2, 7, 12],
      omittedCalendarMonths: [1, 3, 4, 5, 6, 8, 9, 10, 11],
      validMonthCount: 0,
      missingMonthCount: 1,
      invalidRecordCount: 4,
    });
  });

  it("withholds every record in a duplicate month regardless of input order", () => {
    const records = [
      { month: { year: 2025, month: 1 }, ndvi: 0.1 },
      { month: { year: 2025, month: 2 }, ndvi: 0.2 },
      { month: { year: 2025, month: 3 }, ndvi: 0.3 },
      { month: { year: 2025, month: 4 }, ndvi: 0.4 },
      { month: { year: 2025, month: 5 }, ndvi: 0.5 },
      { month: { year: 2025, month: 6 }, ndvi: 0.6 },
      { month: { year: 2025, month: 6 }, ndvi: 0.95 },
      { month: { year: 2025, month: 7 }, ndvi: 0.7 },
    ];

    const [forward] = summarizeAnnualNdviPhenology(records, 45);
    const [reversed] = summarizeAnnualNdviPhenology([...records].reverse(), 45);

    expect(forward).toEqual(reversed);
    expect(forward).toMatchObject({
      coverage: {
        validMonthCount: 6,
        invalidRecordCount: 2,
        isSparse: false,
      },
      peak: { month: { year: 2025, month: 7 }, ndvi: 0.7 },
      trough: { month: { year: 2025, month: 1 }, ndvi: 0.1 },
      seasonalRange: 0.6,
    });
  });
});
