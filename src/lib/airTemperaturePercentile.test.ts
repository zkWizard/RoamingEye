import { describe, expect, it } from "vitest";
import { CLIMATE_METRICS } from "./climate";
import {
  AIR_TEMPERATURE_PERCENTILE_LIMITATIONS,
  AIR_TEMPERATURE_PERCENTILE_METRIC,
  describeAirTemperaturePercentile,
  type AirTemperatureObservation,
} from "./airTemperaturePercentile";

const AVAILABLE_THROUGH = { year: 2026, month: 1 };

const airMonth = (
  year: number,
  month: number,
  value: number | null,
  validFraction = 0.9
): AirTemperatureObservation => ({
  dataMonth: { year, month },
  value,
  validFraction,
});

/** Same-calendar-month prior-year record, one value per year from 2015 up. */
const priorYears = (
  month: number,
  values: readonly number[],
  validFraction = 0.9
): AirTemperatureObservation[] =>
  values.map((value, index) =>
    airMonth(2015 + index, month, value, validFraction)
  );

describe("air temperature percentile of record", () => {
  it("ranks a target within its same-calendar-month record via the mid-rank convention", () => {
    const record = priorYears(
      7,
      [288, 289, 290, 291, 292, 293, 295, 296, 297, 298]
    );
    const result = describeAirTemperaturePercentile(
      airMonth(2025, 7, 294),
      record,
      AVAILABLE_THROUGH
    );

    expect(result).toMatchObject({
      kind: "air-temperature-percentile-of-record",
      isForecast: false,
      isTrend: false,
      claimScope:
        "empirical-rank-within-supplied-same-place-same-calendar-month-record-only",
      status: "available",
      sampleCount: 10,
      coolerRecordCount: 6,
      warmerRecordCount: 4,
      tiedRecordCount: 0,
      isColdestInRecord: false,
      isWarmestInRecord: false,
      reason: null,
    });
    expect(result.percentileRank).toBeCloseTo(60, 10);
    expect(result.exceedanceProbability).toBeCloseTo(0.4, 10);
    expect(result.metric).toBe(CLIMATE_METRICS["air-temperature-2m"]);
    expect(result.metric).toBe(AIR_TEMPERATURE_PERCENTILE_METRIC);
    expect(result.limitations).toBe(AIR_TEMPERATURE_PERCENTILE_LIMITATIONS);
  });

  it("splits exact ties evenly between non-exceedance and exceedance", () => {
    const record = priorYears(
      3,
      [270, 271, 272, 272, 272, 273, 274, 275, 276, 277]
    );
    const result = describeAirTemperaturePercentile(
      airMonth(2025, 3, 272),
      record,
      AVAILABLE_THROUGH
    );

    expect(result).toMatchObject({
      status: "available",
      coolerRecordCount: 2,
      tiedRecordCount: 3,
      warmerRecordCount: 5,
    });
    // (cooler + tied/2)/n = (2 + 1.5)/10 = 0.35
    expect(result.percentileRank).toBeCloseTo(35, 10);
    expect(result.exceedanceProbability).toBeCloseTo(0.65, 10);
  });

  it("keeps non-exceedance and exceedance complementary and counts total to n", () => {
    const record = priorYears(
      9,
      [281, 285, 279, 290, 283, 293, 287, 291, 277, 295, 286, 288]
    );
    const result = describeAirTemperaturePercentile(
      airMonth(2025, 9, 286),
      record,
      AVAILABLE_THROUGH
    );

    expect(result.status).toBe("available");
    expect(
      result.coolerRecordCount! +
        result.tiedRecordCount! +
        result.warmerRecordCount!
    ).toBe(result.sampleCount);
    expect(
      result.percentileRank! / 100 + result.exceedanceProbability!
    ).toBeCloseTo(1, 10);
  });

  it("flags a coldest-in-record month at percentile zero", () => {
    const record = priorYears(
      1,
      [255, 256, 257, 258, 259, 260, 261, 262, 263, 264]
    );
    const result = describeAirTemperaturePercentile(
      airMonth(2025, 1, 250),
      record,
      AVAILABLE_THROUGH
    );

    expect(result).toMatchObject({
      status: "available",
      coolerRecordCount: 0,
      warmerRecordCount: 10,
      isColdestInRecord: true,
      isWarmestInRecord: false,
    });
    expect(result.percentileRank).toBeCloseTo(0, 10);
    expect(result.exceedanceProbability).toBeCloseTo(1, 10);
  });

  it("flags a warmest-in-record month at percentile one hundred", () => {
    const record = priorYears(
      1,
      [255, 256, 257, 258, 259, 260, 261, 262, 263, 264]
    );
    const result = describeAirTemperaturePercentile(
      airMonth(2025, 1, 270),
      record,
      AVAILABLE_THROUGH
    );

    expect(result).toMatchObject({
      status: "available",
      coolerRecordCount: 10,
      warmerRecordCount: 0,
      isColdestInRecord: false,
      isWarmestInRecord: true,
    });
    expect(result.percentileRank).toBeCloseTo(100, 10);
    expect(result.exceedanceProbability).toBeCloseTo(0, 10);
  });

  it("excludes the target's own year from the record without changing the rank", () => {
    const record = priorYears(
      7,
      [288, 289, 290, 291, 292, 293, 295, 296, 297, 298]
    );
    const withOwnYear = [...record, airMonth(2025, 7, 260)];
    const result = describeAirTemperaturePercentile(
      airMonth(2025, 7, 294),
      withOwnYear,
      AVAILABLE_THROUGH
    );

    expect(result.sampleCount).toBe(10);
    expect(result.baseline.exclusions.outOfBounds).toBe(1);
    expect(result.percentileRank).toBeCloseTo(60, 10);
  });

  it("passes through insufficient-samples without inventing a rank", () => {
    const record = priorYears(5, [288, 290, 292, 294, 296]);
    const result = describeAirTemperaturePercentile(
      airMonth(2025, 5, 293),
      record,
      AVAILABLE_THROUGH
    );

    expect(result.status).toBe("insufficient-samples");
    expect(result.percentileRank).toBeNull();
    expect(result.exceedanceProbability).toBeNull();
    expect(result.isColdestInRecord).toBeNull();
    expect(result.reason).toBe("too-few-same-calendar-month-samples");
    expect(result.sampleCount).toBe(5);
  });

  it("honours a lowered minimum-sample floor supplied via options", () => {
    const record = priorYears(5, [288, 290, 292, 294, 296]);
    const result = describeAirTemperaturePercentile(
      airMonth(2025, 5, 293),
      record,
      AVAILABLE_THROUGH,
      { minimumSamples: 5 }
    );

    expect(result.status).toBe("available");
    expect(result.sampleCount).toBe(5);
    // cooler = {288,290,292} = 3, tied = 0 → 3/5 = 60
    expect(result.percentileRank).toBeCloseTo(60, 10);
  });

  it("does not rank a not-yet-published target month", () => {
    const record = priorYears(
      7,
      [288, 289, 290, 291, 292, 293, 295, 296, 297, 298]
    );
    const result = describeAirTemperaturePercentile(
      airMonth(2027, 7, 294),
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
      [288, 289, 290, 291, 292, 293, 295, 296, 297, 298]
    );
    const result = describeAirTemperaturePercentile(
      airMonth(2025, 7, null),
      record,
      AVAILABLE_THROUGH
    );

    expect(result.status).not.toBe("available");
    expect(result.percentileRank).toBeNull();
    expect(result.coolerRecordCount).toBeNull();
  });

  it("does not rank a physically impossible (non-positive kelvin) target", () => {
    const record = priorYears(
      7,
      [288, 289, 290, 291, 292, 293, 295, 296, 297, 298]
    );
    const result = describeAirTemperaturePercentile(
      airMonth(2025, 7, 0),
      record,
      AVAILABLE_THROUGH
    );

    expect(result.status).not.toBe("available");
    expect(result.percentileRank).toBeNull();
  });

  it("preserves the cited air-temperature provenance through the baseline", () => {
    const record = priorYears(
      7,
      [288, 289, 290, 291, 292, 293, 295, 296, 297, 298]
    );
    const result = describeAirTemperaturePercentile(
      airMonth(2025, 7, 294),
      record,
      AVAILABLE_THROUGH
    );

    expect(result.baseline.metric.source).toBe(
      CLIMATE_METRICS["air-temperature-2m"].source
    );
    expect(result.baseline.target.metric).toBe(
      CLIMATE_METRICS["air-temperature-2m"]
    );
  });
});
