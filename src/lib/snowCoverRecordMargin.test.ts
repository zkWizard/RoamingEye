import { describe, expect, it } from "vitest";
import { SNOW_COVER_DATASET } from "./snowCover";
import type { SnowCoverObservation } from "./snowCover";
import {
  SNOW_COVER_RECORD_LIMITATIONS,
  describeSnowCoverRecordMargin,
} from "./snowCoverRecordMargin";

const AVAILABLE_THROUGH = { year: 2026, month: 1 };

const snowMonth = (
  year: number,
  month: number,
  snowCoveredPercent: number | null,
  validFraction = 0.9
): SnowCoverObservation => ({
  dataMonth: { year, month },
  snowCoveredPercent,
  validFraction,
});

/** Same-calendar-month prior-year record, one value per year from 2015 up. */
const priorYears = (
  month: number,
  values: readonly (number | null)[],
  validFraction = 0.9
): SnowCoverObservation[] =>
  values.map((value, index) =>
    snowMonth(2015 + index, month, value, validFraction)
  );

/** Ten-year March record: least-snow 10 (2015), most-snow 60 (2024). */
const MARCH_RECORD = priorYears(3, [10, 15, 20, 25, 30, 35, 40, 45, 50, 60]);

describe("snow-cover same-month record margin", () => {
  it("flags a new most-in-record month with its exceedance margin and holder", () => {
    const result = describeSnowCoverRecordMargin(
      snowMonth(2025, 3, 68),
      MARCH_RECORD,
      AVAILABLE_THROUGH
    );

    expect(result).toMatchObject({
      kind: "snow-cover-same-month-record-standing",
      isForecast: false,
      isTrend: false,
      claimScope:
        "record-standing-within-supplied-same-place-same-calendar-month-record-only",
      status: "available",
      calendarMonth: 3,
      sampleCount: 10,
      targetValue: 68,
      priorMostValue: 60,
      priorMostMonth: { year: 2024, month: 3 },
      priorLeastValue: 10,
      priorLeastMonth: { year: 2015, month: 3 },
      standing: "most-in-record",
      reason: null,
    });
    expect(result.marginBelowMost).toBeCloseTo(-8, 10);
    expect(result.marginAboveLeast).toBeCloseTo(58, 10);
    expect(result.recordExceedanceMargin).toBeCloseTo(8, 10);
    expect(result.dataset).toBe(SNOW_COVER_DATASET);
    expect(result.limitations).toBe(SNOW_COVER_RECORD_LIMITATIONS);
  });

  it("flags a new least-in-record month with its exceedance margin and holder", () => {
    const result = describeSnowCoverRecordMargin(
      snowMonth(2025, 3, 4),
      MARCH_RECORD,
      AVAILABLE_THROUGH
    );

    expect(result).toMatchObject({
      status: "available",
      standing: "least-in-record",
      targetValue: 4,
      priorLeastValue: 10,
      priorLeastMonth: { year: 2015, month: 3 },
    });
    expect(result.marginAboveLeast).toBeCloseTo(-6, 10);
    expect(result.marginBelowMost).toBeCloseTo(56, 10);
    expect(result.recordExceedanceMargin).toBeCloseTo(6, 10);
  });

  it("reports a value strictly within the record range with no exceedance margin", () => {
    const result = describeSnowCoverRecordMargin(
      snowMonth(2025, 3, 33),
      MARCH_RECORD,
      AVAILABLE_THROUGH
    );

    expect(result).toMatchObject({
      status: "available",
      standing: "within-record-range",
      targetValue: 33,
      priorMostValue: 60,
      priorLeastValue: 10,
      recordExceedanceMargin: null,
    });
    // Both margins stay positive inside the range.
    expect(result.marginBelowMost).toBeCloseTo(27, 10);
    expect(result.marginAboveLeast).toBeCloseTo(23, 10);
  });

  it("distinguishes tying the most-in-record extreme from breaking it", () => {
    const result = describeSnowCoverRecordMargin(
      snowMonth(2025, 3, 60),
      MARCH_RECORD,
      AVAILABLE_THROUGH
    );

    expect(result).toMatchObject({
      status: "available",
      standing: "ties-most-in-record",
      recordExceedanceMargin: null,
    });
    expect(result.marginBelowMost).toBeCloseTo(0, 10);
    // The earliest holder of the tied extreme is reported.
    expect(result.priorMostMonth).toEqual({ year: 2024, month: 3 });
  });

  it("distinguishes tying the least-in-record extreme from breaking it", () => {
    const result = describeSnowCoverRecordMargin(
      snowMonth(2025, 3, 10),
      MARCH_RECORD,
      AVAILABLE_THROUGH
    );

    expect(result).toMatchObject({
      status: "available",
      standing: "ties-least-in-record",
      recordExceedanceMargin: null,
    });
    expect(result.marginAboveLeast).toBeCloseTo(0, 10);
    expect(result.priorLeastMonth).toEqual({ year: 2015, month: 3 });
  });

  it("reports ties-flat-record when the prior record has no spread", () => {
    const flat = priorYears(
      3,
      Array.from({ length: 10 }, () => 25)
    );
    const result = describeSnowCoverRecordMargin(
      snowMonth(2025, 3, 25),
      flat,
      AVAILABLE_THROUGH
    );

    expect(result).toMatchObject({
      status: "available",
      standing: "ties-flat-record",
      priorMostValue: 25,
      priorLeastValue: 25,
      recordExceedanceMargin: null,
    });
    expect(result.marginBelowMost).toBeCloseTo(0, 10);
    expect(result.marginAboveLeast).toBeCloseTo(0, 10);
  });

  it("resolves tied extremes to the earliest holder", () => {
    // 2015 and 2017 both hold the max (60); 2016 and 2019 both hold the min (10).
    const record = priorYears(3, [60, 10, 60, 20, 10, 30, 35, 40, 45, 50]);
    const result = describeSnowCoverRecordMargin(
      snowMonth(2025, 3, 33),
      record,
      AVAILABLE_THROUGH
    );

    expect(result.priorMostMonth).toEqual({ year: 2015, month: 3 });
    expect(result.priorLeastMonth).toEqual({ year: 2016, month: 3 });
  });

  it("passes through an under-sampled record with a null standing", () => {
    const result = describeSnowCoverRecordMargin(
      snowMonth(2025, 3, 40),
      priorYears(3, [10, 20, 30]),
      AVAILABLE_THROUGH
    );

    expect(result).toMatchObject({
      status: "insufficient-samples",
      standing: null,
      targetValue: null,
      priorMostValue: null,
      priorLeastValue: null,
      recordExceedanceMargin: null,
      reason: "too-few-same-calendar-month-samples",
    });
  });

  it("passes through a not-yet-published target with a null standing", () => {
    const result = describeSnowCoverRecordMargin(
      // Target month sits after the availability frontier.
      snowMonth(2026, 3, 40),
      priorYears(3, [10, 15, 20, 25, 30, 35, 40, 45, 50, 60]),
      AVAILABLE_THROUGH
    );

    expect(result.status).toBe("not-yet-published");
    expect(result.standing).toBeNull();
    expect(result.reason).toBe("target-not-yet-published");
  });

  it("keeps the record within the same calendar month", () => {
    // A February target must not borrow the March record's extremes.
    const result = describeSnowCoverRecordMargin(
      snowMonth(2025, 2, 40),
      MARCH_RECORD,
      AVAILABLE_THROUGH
    );

    expect(result.status).toBe("insufficient-samples");
    expect(result.calendarMonth).toBe(2);
    expect(result.standing).toBeNull();
  });

  it("honors a caller-supplied minimum-sample override", () => {
    const result = describeSnowCoverRecordMargin(
      snowMonth(2025, 3, 40),
      priorYears(3, [10, 20, 30, 50]),
      AVAILABLE_THROUGH,
      { minimumSamples: 4 }
    );

    expect(result).toMatchObject({
      status: "available",
      standing: "within-record-range",
      sampleCount: 4,
      priorMostValue: 50,
      priorLeastValue: 10,
    });
  });
});
