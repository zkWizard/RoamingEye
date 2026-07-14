import { describe, expect, it } from "vitest";
import { SNOW_COVER_DATASET } from "./snowCover";
import type { SnowCoverObservation } from "./snowCover";
import {
  SNOW_COVER_PERCENTILE_LIMITATIONS,
  describeSnowCoverPercentile,
} from "./snowCoverPercentile";

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

describe("snow-cover percentile of record", () => {
  it("ranks a target within its same-calendar-month record via the mid-rank convention", () => {
    const record = priorYears(2, [10, 15, 20, 25, 30, 35, 45, 50, 55, 60]);
    const result = describeSnowCoverPercentile(
      snowMonth(2025, 2, 40),
      record,
      AVAILABLE_THROUGH
    );

    expect(result).toMatchObject({
      kind: "snow-cover-percentile-of-record",
      isForecast: false,
      isTrend: false,
      claimScope:
        "empirical-rank-within-supplied-same-place-same-calendar-month-record-only",
      status: "available",
      calendarMonth: 2,
      sampleCount: 10,
      lowerRecordCount: 6,
      higherRecordCount: 4,
      tiedRecordCount: 0,
      isLeastInRecord: false,
      isGreatestInRecord: false,
      reason: null,
    });
    expect(result.percentileRank).toBeCloseTo(60, 10);
    expect(result.exceedanceProbability).toBeCloseTo(0.4, 10);
    expect(result.dataset).toBe(SNOW_COVER_DATASET);
    expect(result.limitations).toBe(SNOW_COVER_PERCENTILE_LIMITATIONS);
  });

  it("splits exact ties evenly between non-exceedance and exceedance", () => {
    const record = priorYears(3, [10, 20, 30, 30, 30, 40, 50, 60, 70, 80]);
    const result = describeSnowCoverPercentile(
      snowMonth(2025, 3, 30),
      record,
      AVAILABLE_THROUGH
    );

    expect(result).toMatchObject({
      status: "available",
      lowerRecordCount: 2,
      tiedRecordCount: 3,
      higherRecordCount: 5,
    });
    // (below + tied/2)/n = (2 + 1.5)/10 = 0.35
    expect(result.percentileRank).toBeCloseTo(35, 10);
    expect(result.exceedanceProbability).toBeCloseTo(0.65, 10);
  });

  it("keeps non-exceedance and exceedance complementary and counts total to n", () => {
    const record = priorYears(
      9,
      [12, 18, 9, 24, 15, 30, 21, 27, 6, 33, 19, 22]
    );
    const result = describeSnowCoverPercentile(
      snowMonth(2025, 9, 20),
      record,
      AVAILABLE_THROUGH
    );

    expect(result.status).toBe("available");
    expect(
      result.lowerRecordCount! +
        result.tiedRecordCount! +
        result.higherRecordCount!
    ).toBe(result.sampleCount);
    expect(
      result.percentileRank! / 100 + result.exceedanceProbability!
    ).toBeCloseTo(1, 10);
  });

  it("flags a least-in-record month at percentile zero", () => {
    const record = priorYears(1, [40, 45, 50, 55, 60, 65, 70, 75, 80, 85]);
    const result = describeSnowCoverPercentile(
      snowMonth(2025, 1, 20),
      record,
      AVAILABLE_THROUGH
    );

    expect(result).toMatchObject({
      status: "available",
      lowerRecordCount: 0,
      higherRecordCount: 10,
      isLeastInRecord: true,
      isGreatestInRecord: false,
    });
    expect(result.percentileRank).toBeCloseTo(0, 10);
    expect(result.exceedanceProbability).toBeCloseTo(1, 10);
  });

  it("flags a greatest-in-record month at percentile one hundred", () => {
    const record = priorYears(1, [40, 45, 50, 55, 60, 65, 70, 75, 80, 85]);
    const result = describeSnowCoverPercentile(
      snowMonth(2025, 1, 95),
      record,
      AVAILABLE_THROUGH
    );

    expect(result).toMatchObject({
      status: "available",
      lowerRecordCount: 10,
      higherRecordCount: 0,
      isLeastInRecord: false,
      isGreatestInRecord: true,
    });
    expect(result.percentileRank).toBeCloseTo(100, 10);
    expect(result.exceedanceProbability).toBeCloseTo(0, 10);
  });

  it("excludes the target's own year from the record without changing the rank", () => {
    const record = priorYears(2, [10, 15, 20, 25, 30, 35, 45, 50, 55, 60]);
    const withOwnYear = [...record, snowMonth(2025, 2, 5)];
    const result = describeSnowCoverPercentile(
      snowMonth(2025, 2, 40),
      withOwnYear,
      AVAILABLE_THROUGH
    );

    expect(result.sampleCount).toBe(10);
    expect(result.exclusions.outOfBounds).toBe(1);
    expect(result.percentileRank).toBeCloseTo(60, 10);
  });

  it("drops duplicate years, keeping only the first observation per year", () => {
    const record = priorYears(2, [10, 15, 20, 25, 30, 35, 45, 50, 55, 60]);
    const withDuplicate = [...record, snowMonth(2015, 2, 99)];
    const result = describeSnowCoverPercentile(
      snowMonth(2025, 2, 40),
      withDuplicate,
      AVAILABLE_THROUGH
    );

    expect(result.sampleCount).toBe(10);
    expect(result.exclusions.duplicateYear).toBe(1);
    expect(result.percentileRank).toBeCloseTo(60, 10);
  });

  it("ignores same-place observations from other calendar months", () => {
    const record = priorYears(2, [10, 15, 20, 25, 30, 35, 45, 50, 55, 60]);
    const withOtherMonth = [...record, snowMonth(2016, 8, 0)];
    const result = describeSnowCoverPercentile(
      snowMonth(2025, 2, 40),
      withOtherMonth,
      AVAILABLE_THROUGH
    );

    expect(result.sampleCount).toBe(10);
    expect(result.exclusions.wrongCalendarMonth).toBe(1);
    expect(result.percentileRank).toBeCloseTo(60, 10);
  });

  it("passes through insufficient-samples without inventing a rank", () => {
    const record = priorYears(5, [10, 20, 30, 40, 50]);
    const result = describeSnowCoverPercentile(
      snowMonth(2025, 5, 35),
      record,
      AVAILABLE_THROUGH
    );

    expect(result.status).toBe("insufficient-samples");
    expect(result.percentileRank).toBeNull();
    expect(result.exceedanceProbability).toBeNull();
    expect(result.isLeastInRecord).toBeNull();
    expect(result.reason).toBe("too-few-same-calendar-month-samples");
    expect(result.sampleCount).toBe(5);
  });

  it("honours a lowered minimum-sample floor supplied via options", () => {
    const record = priorYears(5, [10, 20, 30, 40, 50]);
    const result = describeSnowCoverPercentile(
      snowMonth(2025, 5, 35),
      record,
      AVAILABLE_THROUGH,
      { minimumSamples: 5 }
    );

    expect(result.status).toBe("available");
    expect(result.sampleCount).toBe(5);
    // below = {10,20,30} = 3, tied = 0 → 3/5 = 60
    expect(result.percentileRank).toBeCloseTo(60, 10);
  });

  it("reports insufficient-coverage when enough years exist but coverage thins them", () => {
    // Ten same-month years exist, but low validFraction fails the coverage floor.
    const record = priorYears(6, [10, 15, 20, 25, 30, 35, 45, 50, 55, 60], 0.2);
    const result = describeSnowCoverPercentile(
      snowMonth(2025, 6, 40),
      record,
      AVAILABLE_THROUGH
    );

    expect(result.status).toBe("insufficient-coverage");
    expect(result.reason).toBe("baseline-coverage-below-threshold");
    expect(result.exclusions.insufficientCoverage).toBe(10);
    expect(result.percentileRank).toBeNull();
  });

  it("ranks against baseline months whose sampler supplied no coverage", () => {
    const record = priorYears(2, [10, 15, 20, 25, 30, 35, 45, 50, 55, 60]).map(
      (observation) => ({
        dataMonth: observation.dataMonth,
        snowCoveredPercent: observation.snowCoveredPercent,
      })
    );
    const result = describeSnowCoverPercentile(
      { dataMonth: { year: 2025, month: 2 }, snowCoveredPercent: 40 },
      record,
      AVAILABLE_THROUGH
    );

    expect(result.status).toBe("available");
    expect(result.sampleCount).toBe(10);
    expect(
      result.samples.every((sample) => sample.validFraction === null)
    ).toBe(true);
    expect(result.percentileRank).toBeCloseTo(60, 10);
  });

  it("does not rank a not-yet-published target month", () => {
    const record = priorYears(2, [10, 15, 20, 25, 30, 35, 45, 50, 55, 60]);
    const result = describeSnowCoverPercentile(
      snowMonth(2027, 2, 40),
      record,
      AVAILABLE_THROUGH
    );

    expect(result.status).toBe("not-yet-published");
    expect(result.percentileRank).toBeNull();
    expect(result.reason).toBe("target-not-yet-published");
  });

  it("does not rank a target with no usable value", () => {
    const record = priorYears(2, [10, 15, 20, 25, 30, 35, 45, 50, 55, 60]);
    const result = describeSnowCoverPercentile(
      snowMonth(2025, 2, null),
      record,
      AVAILABLE_THROUGH
    );

    expect(result.status).toBe("no-data");
    expect(result.percentileRank).toBeNull();
    expect(result.lowerRecordCount).toBeNull();
  });

  it("rejects an invalid target month rather than inventing a rank", () => {
    const record = priorYears(2, [10, 15, 20, 25, 30, 35, 45, 50, 55, 60]);
    const result = describeSnowCoverPercentile(
      snowMonth(2025, 13, 40),
      record,
      AVAILABLE_THROUGH
    );

    expect(result.status).toBe("invalid");
    expect(result.calendarMonth).toBeNull();
    expect(result.percentileRank).toBeNull();
  });

  it("preserves the cited MOD10CM provenance on every state", () => {
    const record = priorYears(2, [10, 15, 20, 25, 30, 35, 45, 50, 55, 60]);
    const ranked = describeSnowCoverPercentile(
      snowMonth(2025, 2, 40),
      record,
      AVAILABLE_THROUGH
    );
    const unranked = describeSnowCoverPercentile(
      snowMonth(2025, 2, null),
      record,
      AVAILABLE_THROUGH
    );

    expect(ranked.dataset).toBe(SNOW_COVER_DATASET);
    expect(unranked.dataset).toBe(SNOW_COVER_DATASET);
    expect(ranked.target.dataset).toBe(SNOW_COVER_DATASET);
  });
});
