import { describe, expect, it } from "vitest";
import { NDVI_SOURCE, type NdviMonthlyObservation } from "./phenology";
import { NDVI_METRIC } from "./phenologyBaseline";
import {
  NDVI_SEASONAL_PERCENTILE_LIMITATIONS,
  NDVI_PERCENTILE_METRIC,
  describeNdviSeasonalPercentile,
} from "./phenologySeasonalPercentile";
import type { YearMonth } from "./timeline";

const AVAILABLE_THROUGH: YearMonth = { year: 2026, month: 1 };
/** Northern-hemisphere latitude; the rank never depends on the value itself. */
const LATITUDE = 45;

const ndvi = (
  year: number,
  month: number,
  value: number | null,
  validFraction = 0.8
): NdviMonthlyObservation => ({
  month: { year, month },
  ndvi: value,
  validFraction,
});

/** Same-calendar-month prior-year record, one value per year from 2015 up. */
const priorYears = (
  month: number,
  values: readonly number[],
  validFraction = 0.8
): NdviMonthlyObservation[] =>
  values.map((value, index) => ndvi(2015 + index, month, value, validFraction));

describe("NDVI seasonal percentile of record", () => {
  it("ranks a target within its same-calendar-month record via the mid-rank convention", () => {
    const record = priorYears(
      7,
      [0.3, 0.32, 0.34, 0.36, 0.38, 0.4, 0.44, 0.46, 0.48, 0.5]
    );
    const result = describeNdviSeasonalPercentile(
      ndvi(2025, 7, 0.42),
      record,
      AVAILABLE_THROUGH,
      LATITUDE
    );

    expect(result).toMatchObject({
      kind: "ndvi-seasonal-percentile-of-record",
      isForecast: false,
      isTrend: false,
      claimScope:
        "empirical-rank-within-supplied-same-place-same-calendar-month-record-only",
      status: "available",
      sampleCount: 10,
      lessGreenRecordCount: 6,
      greenerRecordCount: 4,
      tiedRecordCount: 0,
      isLeastGreenInRecord: false,
      isGreenestInRecord: false,
      reason: null,
    });
    expect(result.percentileRank).toBeCloseTo(60, 10);
    expect(result.exceedanceProbability).toBeCloseTo(0.4, 10);
    expect(result.metric).toBe(NDVI_METRIC);
    expect(result.metric).toBe(NDVI_PERCENTILE_METRIC);
    expect(result.limitations).toBe(NDVI_SEASONAL_PERCENTILE_LIMITATIONS);
  });

  it("splits exact ties evenly between non-exceedance and exceedance", () => {
    const record = priorYears(
      3,
      [0.3, 0.32, 0.34, 0.34, 0.34, 0.36, 0.38, 0.4, 0.42, 0.44]
    );
    const result = describeNdviSeasonalPercentile(
      ndvi(2025, 3, 0.34),
      record,
      AVAILABLE_THROUGH,
      LATITUDE
    );

    expect(result).toMatchObject({
      status: "available",
      lessGreenRecordCount: 2,
      tiedRecordCount: 3,
      greenerRecordCount: 5,
    });
    // (lessGreen + tied/2)/n = (2 + 1.5)/10 = 0.35
    expect(result.percentileRank).toBeCloseTo(35, 10);
    expect(result.exceedanceProbability).toBeCloseTo(0.65, 10);
  });

  it("keeps non-exceedance and exceedance complementary and counts total to n", () => {
    const record = priorYears(
      9,
      [0.12, 0.18, 0.09, 0.24, 0.15, 0.3, 0.21, 0.27, 0.06, 0.33, 0.19, 0.22]
    );
    const result = describeNdviSeasonalPercentile(
      ndvi(2025, 9, 0.2),
      record,
      AVAILABLE_THROUGH,
      LATITUDE
    );

    expect(result.status).toBe("available");
    expect(
      result.lessGreenRecordCount! +
        result.tiedRecordCount! +
        result.greenerRecordCount!
    ).toBe(result.sampleCount);
    expect(
      result.percentileRank! / 100 + result.exceedanceProbability!
    ).toBeCloseTo(1, 10);
  });

  it("flags a least-green-in-record month at percentile zero", () => {
    const record = priorYears(
      1,
      [0.4, 0.42, 0.44, 0.46, 0.48, 0.5, 0.52, 0.54, 0.56, 0.58]
    );
    const result = describeNdviSeasonalPercentile(
      ndvi(2025, 1, 0.3),
      record,
      AVAILABLE_THROUGH,
      LATITUDE
    );

    expect(result).toMatchObject({
      status: "available",
      lessGreenRecordCount: 0,
      greenerRecordCount: 10,
      isLeastGreenInRecord: true,
      isGreenestInRecord: false,
    });
    expect(result.percentileRank).toBeCloseTo(0, 10);
    expect(result.exceedanceProbability).toBeCloseTo(1, 10);
  });

  it("flags a greenest-in-record month at percentile one hundred", () => {
    const record = priorYears(
      1,
      [0.4, 0.42, 0.44, 0.46, 0.48, 0.5, 0.52, 0.54, 0.56, 0.58]
    );
    const result = describeNdviSeasonalPercentile(
      ndvi(2025, 1, 0.7),
      record,
      AVAILABLE_THROUGH,
      LATITUDE
    );

    expect(result).toMatchObject({
      status: "available",
      lessGreenRecordCount: 10,
      greenerRecordCount: 0,
      isLeastGreenInRecord: false,
      isGreenestInRecord: true,
    });
    expect(result.percentileRank).toBeCloseTo(100, 10);
    expect(result.exceedanceProbability).toBeCloseTo(0, 10);
  });

  it("excludes the target's own year from the record without changing the rank", () => {
    const record = priorYears(
      7,
      [0.3, 0.32, 0.34, 0.36, 0.38, 0.4, 0.44, 0.46, 0.48, 0.5]
    );
    const withOwnYear = [...record, ndvi(2025, 7, 0.05)];
    const result = describeNdviSeasonalPercentile(
      ndvi(2025, 7, 0.42),
      withOwnYear,
      AVAILABLE_THROUGH,
      LATITUDE
    );

    expect(result.sampleCount).toBe(10);
    expect(result.baseline.exclusions.outOfBounds).toBe(1);
    expect(result.percentileRank).toBeCloseTo(60, 10);
  });

  it("passes through insufficient-samples without inventing a rank", () => {
    const record = priorYears(5, [0.3, 0.34, 0.38, 0.42, 0.46]);
    const result = describeNdviSeasonalPercentile(
      ndvi(2025, 5, 0.4),
      record,
      AVAILABLE_THROUGH,
      LATITUDE
    );

    expect(result.status).toBe("insufficient-samples");
    expect(result.percentileRank).toBeNull();
    expect(result.exceedanceProbability).toBeNull();
    expect(result.isLeastGreenInRecord).toBeNull();
    expect(result.reason).toBe("too-few-same-calendar-month-samples");
    expect(result.sampleCount).toBe(5);
  });

  it("honours a lowered minimum-sample floor supplied via options", () => {
    const record = priorYears(5, [0.3, 0.34, 0.38, 0.42, 0.46]);
    const result = describeNdviSeasonalPercentile(
      ndvi(2025, 5, 0.4),
      record,
      AVAILABLE_THROUGH,
      LATITUDE,
      { minimumSamples: 5 }
    );

    expect(result.status).toBe("available");
    expect(result.sampleCount).toBe(5);
    // lessGreen = {0.30,0.34,0.38} = 3, tied = 0 → 3/5 = 60
    expect(result.percentileRank).toBeCloseTo(60, 10);
  });

  it("does not rank a not-yet-published target month", () => {
    const record = priorYears(
      7,
      [0.3, 0.32, 0.34, 0.36, 0.38, 0.4, 0.44, 0.46, 0.48, 0.5]
    );
    const result = describeNdviSeasonalPercentile(
      ndvi(2027, 7, 0.42),
      record,
      AVAILABLE_THROUGH,
      LATITUDE
    );

    expect(result.status).not.toBe("available");
    expect(result.percentileRank).toBeNull();
    expect(result.reason).toBe("not-yet-published");
  });

  it("does not rank a target with no usable value", () => {
    const record = priorYears(
      7,
      [0.3, 0.32, 0.34, 0.36, 0.38, 0.4, 0.44, 0.46, 0.48, 0.5]
    );
    const result = describeNdviSeasonalPercentile(
      ndvi(2025, 7, null),
      record,
      AVAILABLE_THROUGH,
      LATITUDE
    );

    expect(result.status).not.toBe("available");
    expect(result.percentileRank).toBeNull();
    expect(result.lessGreenRecordCount).toBeNull();
  });

  it("preserves the cited MOD13A3 provenance through the baseline", () => {
    const record = priorYears(
      7,
      [0.3, 0.32, 0.34, 0.36, 0.38, 0.4, 0.44, 0.46, 0.48, 0.5]
    );
    const result = describeNdviSeasonalPercentile(
      ndvi(2025, 7, 0.42),
      record,
      AVAILABLE_THROUGH,
      LATITUDE
    );

    expect(result.baseline.metric.source).toBe(NDVI_SOURCE);
    expect(result.baseline.target.metric).toBe(NDVI_METRIC);
  });
});
