import { describe, expect, it } from "vitest";
import { CLIMATE_METRICS } from "./climate";
import {
  AIR_TEMPERATURE_RECORD_LIMITATIONS,
  AIR_TEMPERATURE_RECORD_METRIC,
  describeAirTemperatureRecordMargin,
} from "./airTemperatureRecordMargin";
import type { AirTemperatureObservation } from "./airTemperaturePercentile";

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

/**
 * Ten-year July record in kelvin: coldest 300.0 (2015), warmest 302.7 (2024).
 * Values step by 0.3 K to keep exact-match tie tests unambiguous.
 */
const JULY_RECORD = priorYears(
  7,
  [300.0, 300.3, 300.6, 300.9, 301.2, 301.5, 301.8, 302.1, 302.4, 302.7]
);

describe("air temperature same-month record margin", () => {
  it("flags a new warmest-in-record month with its exceedance margin and holder", () => {
    const result = describeAirTemperatureRecordMargin(
      airMonth(2025, 7, 303.1),
      JULY_RECORD,
      AVAILABLE_THROUGH
    );

    expect(result).toMatchObject({
      kind: "air-temperature-same-month-record-standing",
      isForecast: false,
      isTrend: false,
      claimScope:
        "record-standing-within-supplied-same-place-same-calendar-month-record-only",
      status: "available",
      calendarMonth: 7,
      unit: "K",
      sampleCount: 10,
      targetValue: 303.1,
      priorWarmestValue: 302.7,
      priorWarmestMonth: { year: 2024, month: 7 },
      priorColdestValue: 300.0,
      priorColdestMonth: { year: 2015, month: 7 },
      standing: "warmest-in-record",
      reason: null,
    });
    // Exceedance margin and both signed margins are floating point in K.
    expect(result.recordExceedanceMargin).toBeCloseTo(0.4, 10);
    expect(result.marginBelowWarmest).toBeCloseTo(-0.4, 10);
    expect(result.marginAboveColdest).toBeCloseTo(3.1, 10);
    expect(result.metric).toBe(CLIMATE_METRICS["air-temperature-2m"]);
    expect(result.metric).toBe(AIR_TEMPERATURE_RECORD_METRIC);
    expect(result.limitations).toBe(AIR_TEMPERATURE_RECORD_LIMITATIONS);
  });

  it("flags a new coldest-in-record month with its exceedance margin", () => {
    const result = describeAirTemperatureRecordMargin(
      airMonth(2025, 7, 299.5),
      JULY_RECORD,
      AVAILABLE_THROUGH
    );

    expect(result).toMatchObject({
      status: "available",
      standing: "coldest-in-record",
      priorColdestValue: 300.0,
      priorColdestMonth: { year: 2015, month: 7 },
    });
    expect(result.recordExceedanceMargin).toBeCloseTo(0.5, 10);
    expect(result.marginAboveColdest).toBeCloseTo(-0.5, 10);
    expect(result.marginBelowWarmest).toBeCloseTo(3.2, 10);
  });

  it("reports both margins for a value within the observed same-month range", () => {
    const result = describeAirTemperatureRecordMargin(
      airMonth(2025, 7, 301.5),
      JULY_RECORD,
      AVAILABLE_THROUGH
    );

    expect(result).toMatchObject({
      status: "available",
      standing: "within-record-range",
      recordExceedanceMargin: null,
    });
    expect(result.marginBelowWarmest).toBeCloseTo(1.2, 10);
    expect(result.marginAboveColdest).toBeCloseTo(1.5, 10);
  });

  it("ties the warm record without breaching it (record has spread)", () => {
    const result = describeAirTemperatureRecordMargin(
      airMonth(2025, 7, 302.7),
      JULY_RECORD,
      AVAILABLE_THROUGH
    );

    expect(result).toMatchObject({
      standing: "ties-warmest-in-record",
      recordExceedanceMargin: null,
    });
    expect(result.marginBelowWarmest).toBe(0);
    expect(result.marginAboveColdest).toBeCloseTo(2.7, 10);
  });

  it("ties the cold record without breaching it (record has spread)", () => {
    const result = describeAirTemperatureRecordMargin(
      airMonth(2025, 7, 300.0),
      JULY_RECORD,
      AVAILABLE_THROUGH
    );

    expect(result).toMatchObject({
      standing: "ties-coldest-in-record",
      recordExceedanceMargin: null,
    });
    expect(result.marginAboveColdest).toBe(0);
    expect(result.marginBelowWarmest).toBeCloseTo(2.7, 10);
  });

  it("ties a flat record (no spread) at both extremes at once", () => {
    const flat = priorYears(
      1,
      Array.from({ length: 10 }, () => 288.0)
    );
    const result = describeAirTemperatureRecordMargin(
      airMonth(2025, 1, 288.0),
      flat,
      AVAILABLE_THROUGH
    );

    expect(result).toMatchObject({
      standing: "ties-flat-record",
      priorWarmestValue: 288.0,
      priorColdestValue: 288.0,
      recordExceedanceMargin: null,
    });
    expect(result.marginBelowWarmest).toBe(0);
    expect(result.marginAboveColdest).toBe(0);
  });

  it("beats a flat record and reports it as a strict new warm record", () => {
    const flat = priorYears(
      1,
      Array.from({ length: 10 }, () => 288.0)
    );
    const result = describeAirTemperatureRecordMargin(
      airMonth(2025, 1, 289.0),
      flat,
      AVAILABLE_THROUGH
    );

    expect(result).toMatchObject({
      standing: "warmest-in-record",
    });
    expect(result.recordExceedanceMargin).toBeCloseTo(1.0, 10);
  });

  it("resolves tied extremes to the earliest holder month", () => {
    // Warmest 302.5 appears in both 2016 and 2019; earliest holder wins.
    const record = priorYears(
      9,
      [300.0, 302.5, 300.6, 300.9, 302.5, 301.5, 301.8, 302.1, 302.3, 302.4]
    );
    const result = describeAirTemperatureRecordMargin(
      airMonth(2025, 9, 303.0),
      record,
      AVAILABLE_THROUGH
    );

    expect(result.priorWarmestValue).toBe(302.5);
    expect(result.priorWarmestMonth).toEqual({ year: 2016, month: 9 });
    expect(result.priorColdestValue).toBe(300.0);
    expect(result.priorColdestMonth).toEqual({ year: 2015, month: 9 });
  });

  it("excludes the target year from its own record", () => {
    // A 2025 duplicate of the target year must not seed the baseline.
    const withTargetYear = [...JULY_RECORD, airMonth(2025, 7, 500.0)];
    const result = describeAirTemperatureRecordMargin(
      airMonth(2025, 7, 303.1),
      withTargetYear,
      AVAILABLE_THROUGH
    );

    expect(result.sampleCount).toBe(10);
    expect(result.priorWarmestValue).toBe(302.7);
    expect(result.standing).toBe("warmest-in-record");
  });

  it("states no standing for an under-sampled record", () => {
    const result = describeAirTemperatureRecordMargin(
      airMonth(2025, 7, 303.1),
      priorYears(7, [300.0, 301.0, 302.0]),
      AVAILABLE_THROUGH
    );

    expect(result.status).toBe("insufficient-samples");
    expect(result.standing).toBeNull();
    expect(result.recordExceedanceMargin).toBeNull();
    expect(result.priorWarmestValue).toBeNull();
    expect(result.priorColdestValue).toBeNull();
    expect(result.reason).not.toBeNull();
  });

  it("states no standing for a not-yet-published target month", () => {
    const result = describeAirTemperatureRecordMargin(
      airMonth(2026, 7, 303.1),
      priorYears(
        7,
        [300.0, 300.3, 300.6, 300.9, 301.2, 301.5, 301.8, 302.1, 302.4, 302.7]
      ),
      AVAILABLE_THROUGH
    );

    expect(result.status).not.toBe("available");
    expect(result.standing).toBeNull();
    expect(result.targetValue).toBeNull();
  });

  it("states no standing for an invalid target month", () => {
    const result = describeAirTemperatureRecordMargin(
      airMonth(2025, 13, 303.1),
      JULY_RECORD,
      AVAILABLE_THROUGH
    );

    expect(result.status).toBe("invalid");
    expect(result.standing).toBeNull();
    expect(result.calendarMonth).toBeNull();
    expect(result.reason).not.toBeNull();
  });

  it("carries the audited baseline through for provenance", () => {
    const result = describeAirTemperatureRecordMargin(
      airMonth(2025, 7, 301.5),
      JULY_RECORD,
      AVAILABLE_THROUGH
    );

    expect(result.baseline.kind).toBe("same-calendar-month-climate-baseline");
    expect(result.baseline.status).toBe("available");
    expect(result.baseline.samples).toHaveLength(10);
    expect(result.dataMonth).toEqual({ year: 2025, month: 7 });
  });
});
