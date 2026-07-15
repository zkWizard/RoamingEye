import { describe, expect, it } from "vitest";
import { CLIMATE_METRICS } from "./climate";
import {
  PRECIPITATION_PERCENTILE_LIMITATIONS,
  PRECIPITATION_PERCENTILE_METRIC,
  describePrecipitationPercentile,
  type PrecipitationObservation,
} from "./precipitationPercentile";

const AVAILABLE_THROUGH = { year: 2026, month: 1 };

// Native precipitation rates are small (kg/m²/s); a light drizzle is ~1e-5.
// Scaling by 1e-6 keeps the fixtures in a realistic band while the ranks stay
// exact integers, so the mid-rank arithmetic is easy to read.
const RATE = 1e-6;

const precipMonth = (
  year: number,
  month: number,
  value: number | null,
  validFraction = 0.9
): PrecipitationObservation => ({
  dataMonth: { year, month },
  value: value === null ? null : value * RATE,
  validFraction,
});

/** Same-calendar-month prior-year record, one value per year from 2015 up. */
const priorYears = (
  month: number,
  values: readonly number[],
  validFraction = 0.9
): PrecipitationObservation[] =>
  values.map((value, index) =>
    precipMonth(2015 + index, month, value, validFraction)
  );

describe("precipitation percentile of record", () => {
  it("ranks a target within its same-calendar-month record via the mid-rank convention", () => {
    const record = priorYears(
      7,
      [100, 105, 110, 115, 120, 125, 135, 140, 145, 150]
    );
    const result = describePrecipitationPercentile(
      precipMonth(2025, 7, 130),
      record,
      AVAILABLE_THROUGH
    );

    expect(result).toMatchObject({
      kind: "precipitation-percentile-of-record",
      isForecast: false,
      isTrend: false,
      claimScope:
        "empirical-rank-within-supplied-same-place-same-calendar-month-record-only",
      status: "available",
      sampleCount: 10,
      drierRecordCount: 6,
      wetterRecordCount: 4,
      tiedRecordCount: 0,
      isDriestInRecord: false,
      isWettestInRecord: false,
      reason: null,
    });
    expect(result.percentileRank).toBeCloseTo(60, 10);
    expect(result.exceedanceProbability).toBeCloseTo(0.4, 10);
    expect(result.metric).toBe(CLIMATE_METRICS["precipitation-rate"]);
    expect(result.metric).toBe(PRECIPITATION_PERCENTILE_METRIC);
    expect(result.limitations).toBe(PRECIPITATION_PERCENTILE_LIMITATIONS);
  });

  it("splits exact ties evenly between non-exceedance and exceedance", () => {
    const record = priorYears(
      3,
      [100, 110, 120, 120, 120, 130, 140, 150, 160, 170]
    );
    const result = describePrecipitationPercentile(
      precipMonth(2025, 3, 120),
      record,
      AVAILABLE_THROUGH
    );

    expect(result).toMatchObject({
      status: "available",
      drierRecordCount: 2,
      tiedRecordCount: 3,
      wetterRecordCount: 5,
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
    const result = describePrecipitationPercentile(
      precipMonth(2025, 9, 20),
      record,
      AVAILABLE_THROUGH
    );

    expect(result.status).toBe("available");
    expect(
      result.drierRecordCount! +
        result.tiedRecordCount! +
        result.wetterRecordCount!
    ).toBe(result.sampleCount);
    expect(
      result.percentileRank! / 100 + result.exceedanceProbability!
    ).toBeCloseTo(1, 10);
  });

  it("flags a driest-in-record month at percentile zero", () => {
    const record = priorYears(
      1,
      [140, 150, 160, 170, 180, 190, 200, 210, 220, 230]
    );
    const result = describePrecipitationPercentile(
      precipMonth(2025, 1, 120),
      record,
      AVAILABLE_THROUGH
    );

    expect(result).toMatchObject({
      status: "available",
      drierRecordCount: 0,
      wetterRecordCount: 10,
      isDriestInRecord: true,
      isWettestInRecord: false,
    });
    expect(result.percentileRank).toBeCloseTo(0, 10);
    expect(result.exceedanceProbability).toBeCloseTo(1, 10);
  });

  it("flags a wettest-in-record month at percentile one hundred", () => {
    const record = priorYears(
      1,
      [140, 150, 160, 170, 180, 190, 200, 210, 220, 230]
    );
    const result = describePrecipitationPercentile(
      precipMonth(2025, 1, 260),
      record,
      AVAILABLE_THROUGH
    );

    expect(result).toMatchObject({
      status: "available",
      drierRecordCount: 10,
      wetterRecordCount: 0,
      isDriestInRecord: false,
      isWettestInRecord: true,
    });
    expect(result.percentileRank).toBeCloseTo(100, 10);
    expect(result.exceedanceProbability).toBeCloseTo(0, 10);
  });

  it("excludes the target's own year from the record without changing the rank", () => {
    const record = priorYears(
      7,
      [100, 105, 110, 115, 120, 125, 135, 140, 145, 150]
    );
    const withOwnYear = [...record, precipMonth(2025, 7, 5)];
    const result = describePrecipitationPercentile(
      precipMonth(2025, 7, 130),
      withOwnYear,
      AVAILABLE_THROUGH
    );

    expect(result.sampleCount).toBe(10);
    expect(result.baseline.exclusions.outOfBounds).toBe(1);
    expect(result.percentileRank).toBeCloseTo(60, 10);
  });

  it("passes through insufficient-samples without inventing a rank", () => {
    const record = priorYears(5, [100, 110, 120, 130, 140]);
    const result = describePrecipitationPercentile(
      precipMonth(2025, 5, 125),
      record,
      AVAILABLE_THROUGH
    );

    expect(result.status).toBe("insufficient-samples");
    expect(result.percentileRank).toBeNull();
    expect(result.exceedanceProbability).toBeNull();
    expect(result.isWettestInRecord).toBeNull();
    expect(result.reason).toBe("too-few-same-calendar-month-samples");
    expect(result.sampleCount).toBe(5);
  });

  it("honours a lowered minimum-sample floor supplied via options", () => {
    const record = priorYears(5, [100, 110, 120, 130, 140]);
    const result = describePrecipitationPercentile(
      precipMonth(2025, 5, 125),
      record,
      AVAILABLE_THROUGH,
      { minimumSamples: 5 }
    );

    expect(result.status).toBe("available");
    expect(result.sampleCount).toBe(5);
    // below = {100,110,120} = 3, tied = 0 → 3/5 = 60
    expect(result.percentileRank).toBeCloseTo(60, 10);
  });

  it("does not rank a not-yet-published target month", () => {
    const record = priorYears(
      7,
      [100, 105, 110, 115, 120, 125, 135, 140, 145, 150]
    );
    const result = describePrecipitationPercentile(
      precipMonth(2027, 7, 130),
      record,
      AVAILABLE_THROUGH
    );

    expect(result.status).toBe("not-yet-published");
    expect(result.percentileRank).toBeNull();
    expect(result.reason).toBe("target-not-yet-published");
  });

  it("does not rank a target with no usable value", () => {
    const record = priorYears(
      7,
      [100, 105, 110, 115, 120, 125, 135, 140, 145, 150]
    );
    const result = describePrecipitationPercentile(
      precipMonth(2025, 7, null),
      record,
      AVAILABLE_THROUGH
    );

    expect(result.status).not.toBe("available");
    expect(result.percentileRank).toBeNull();
    expect(result.drierRecordCount).toBeNull();
  });

  it("does not rank a target below the coverage floor", () => {
    const record = priorYears(
      7,
      [100, 105, 110, 115, 120, 125, 135, 140, 145, 150]
    );
    const result = describePrecipitationPercentile(
      precipMonth(2025, 7, 130, 0.2),
      record,
      AVAILABLE_THROUGH
    );

    expect(result.status).toBe("insufficient-coverage");
    expect(result.percentileRank).toBeNull();
    expect(result.reason).toBe("target-coverage-below-threshold");
  });

  it("preserves the cited precipitation provenance through the baseline", () => {
    const record = priorYears(
      7,
      [100, 105, 110, 115, 120, 125, 135, 140, 145, 150]
    );
    const result = describePrecipitationPercentile(
      precipMonth(2025, 7, 130),
      record,
      AVAILABLE_THROUGH
    );

    expect(result.baseline.metric.source).toBe(
      CLIMATE_METRICS["precipitation-rate"].source
    );
    expect(result.baseline.target.metric).toBe(
      CLIMATE_METRICS["precipitation-rate"]
    );
  });
});
