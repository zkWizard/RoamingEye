import { describe, expect, it } from "vitest";
import { CLIMATE_METRICS } from "./climate";
import type { PrecipitationObservation } from "./precipitationPercentile";
import {
  PRECIPITATION_RECORD_LIMITATIONS,
  PRECIPITATION_RECORD_METRIC,
  describePrecipitationRecordMargin,
} from "./precipitationRecordMargin";

const AVAILABLE_THROUGH = { year: 2026, month: 1 };

// Native precipitation rates are small (kg/m²/s); a light drizzle is ~1e-5.
// Scaling by 1e-6 keeps the fixtures in a realistic band while the margins stay
// exact multiples of RATE, so the arithmetic is easy to read.
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

/** Ten-year July record: driest 100 (2015), wettest 150 (2024). */
const JULY_RECORD = priorYears(
  7,
  [100, 105, 110, 115, 120, 125, 130, 135, 140, 150]
);

describe("precipitation same-month record margin", () => {
  it("flags a new wettest-in-record month with its exceedance margin and holder", () => {
    const result = describePrecipitationRecordMargin(
      precipMonth(2025, 7, 160),
      JULY_RECORD,
      AVAILABLE_THROUGH
    );

    expect(result).toMatchObject({
      kind: "precipitation-same-month-record-standing",
      isForecast: false,
      isTrend: false,
      claimScope:
        "record-standing-within-supplied-same-place-same-calendar-month-record-only",
      status: "available",
      calendarMonth: 7,
      unit: "kg/m²/s",
      sampleCount: 10,
      standing: "wettest-in-record",
      priorWettestValue: 150 * RATE,
      priorWettestMonth: { year: 2024, month: 7 },
      priorDriestValue: 100 * RATE,
      priorDriestMonth: { year: 2015, month: 7 },
      reason: null,
    });
    expect(result.targetValue).toBeCloseTo(160 * RATE, 18);
    expect(result.recordExceedanceMargin).toBeCloseTo(10 * RATE, 18);
    // Below the (now-broken) wet record is negative; above the dry record wide.
    expect(result.marginBelowWettest).toBeCloseTo(-10 * RATE, 18);
    expect(result.marginAboveDriest).toBeCloseTo(60 * RATE, 18);
    expect(result.metric).toBe(CLIMATE_METRICS["precipitation-rate"]);
    expect(result.metric).toBe(PRECIPITATION_RECORD_METRIC);
    expect(result.limitations).toBe(PRECIPITATION_RECORD_LIMITATIONS);
  });

  it("flags a new driest-in-record month with its exceedance margin", () => {
    const result = describePrecipitationRecordMargin(
      precipMonth(2025, 7, 90),
      JULY_RECORD,
      AVAILABLE_THROUGH
    );

    expect(result).toMatchObject({
      status: "available",
      standing: "driest-in-record",
      priorDriestMonth: { year: 2015, month: 7 },
    });
    expect(result.priorDriestValue).toBeCloseTo(100 * RATE, 18);
    expect(result.recordExceedanceMargin).toBeCloseTo(10 * RATE, 18);
    expect(result.marginAboveDriest).toBeCloseTo(-10 * RATE, 18);
    expect(result.marginBelowWettest).toBeCloseTo(60 * RATE, 18);
  });

  it("reports both margins for a value within the observed same-month range", () => {
    const result = describePrecipitationRecordMargin(
      precipMonth(2025, 7, 130),
      JULY_RECORD,
      AVAILABLE_THROUGH
    );

    expect(result).toMatchObject({
      status: "available",
      standing: "within-record-range",
      recordExceedanceMargin: null,
    });
    expect(result.marginBelowWettest).toBeCloseTo(20 * RATE, 18);
    expect(result.marginAboveDriest).toBeCloseTo(30 * RATE, 18);
  });

  it("ties the wet record without breaching it (record has spread)", () => {
    const result = describePrecipitationRecordMargin(
      precipMonth(2025, 7, 150),
      JULY_RECORD,
      AVAILABLE_THROUGH
    );

    expect(result).toMatchObject({
      standing: "ties-wettest-in-record",
      recordExceedanceMargin: null,
    });
    expect(result.marginBelowWettest).toBe(0);
    expect(result.marginAboveDriest).toBeCloseTo(50 * RATE, 18);
  });

  it("ties the dry record without breaching it (record has spread)", () => {
    const result = describePrecipitationRecordMargin(
      precipMonth(2025, 7, 100),
      JULY_RECORD,
      AVAILABLE_THROUGH
    );

    expect(result).toMatchObject({
      standing: "ties-driest-in-record",
      recordExceedanceMargin: null,
    });
    expect(result.marginAboveDriest).toBe(0);
    expect(result.marginBelowWettest).toBeCloseTo(50 * RATE, 18);
  });

  it("ties a flat record (no spread) at both extremes at once", () => {
    const flat = priorYears(
      4,
      Array.from({ length: 10 }, () => 120)
    );
    const result = describePrecipitationRecordMargin(
      precipMonth(2025, 4, 120),
      flat,
      AVAILABLE_THROUGH
    );

    expect(result).toMatchObject({
      standing: "ties-flat-record",
      recordExceedanceMargin: null,
    });
    expect(result.priorWettestValue).toBeCloseTo(120 * RATE, 18);
    expect(result.priorDriestValue).toBeCloseTo(120 * RATE, 18);
    expect(result.marginBelowWettest).toBe(0);
    expect(result.marginAboveDriest).toBe(0);
  });

  it("beats a flat record and reports it as a strict new wet record", () => {
    const flat = priorYears(
      4,
      Array.from({ length: 10 }, () => 120)
    );
    const result = describePrecipitationRecordMargin(
      precipMonth(2025, 4, 130),
      flat,
      AVAILABLE_THROUGH
    );

    expect(result).toMatchObject({ standing: "wettest-in-record" });
    expect(result.recordExceedanceMargin).toBeCloseTo(10 * RATE, 18);
  });

  it("resolves tied extremes to the earliest holder month", () => {
    // Wettest 150 appears in both 2016 and 2019; earliest holder wins.
    const record = priorYears(
      9,
      [100, 150, 110, 120, 150, 130, 135, 140, 145, 148]
    );
    const result = describePrecipitationRecordMargin(
      precipMonth(2025, 9, 160),
      record,
      AVAILABLE_THROUGH
    );

    expect(result.priorWettestValue).toBeCloseTo(150 * RATE, 18);
    expect(result.priorWettestMonth).toEqual({ year: 2016, month: 9 });
    expect(result.priorDriestValue).toBeCloseTo(100 * RATE, 18);
    expect(result.priorDriestMonth).toEqual({ year: 2015, month: 9 });
  });

  it("excludes the target year from its own record", () => {
    // A duplicate of the target year must not seed the baseline.
    const withTargetYear = [...JULY_RECORD, precipMonth(2025, 7, 500)];
    const result = describePrecipitationRecordMargin(
      precipMonth(2025, 7, 160),
      withTargetYear,
      AVAILABLE_THROUGH
    );

    expect(result.sampleCount).toBe(10);
    expect(result.priorWettestValue).toBeCloseTo(150 * RATE, 18);
    expect(result.standing).toBe("wettest-in-record");
  });

  it("states no standing for an under-sampled record", () => {
    const result = describePrecipitationRecordMargin(
      precipMonth(2025, 7, 160),
      priorYears(7, [100, 120, 140]),
      AVAILABLE_THROUGH
    );

    expect(result.status).toBe("insufficient-samples");
    expect(result.standing).toBeNull();
    expect(result.recordExceedanceMargin).toBeNull();
    expect(result.priorWettestValue).toBeNull();
    expect(result.priorDriestValue).toBeNull();
    expect(result.reason).not.toBeNull();
  });

  it("states no standing for a not-yet-published target month", () => {
    const result = describePrecipitationRecordMargin(
      precipMonth(2026, 7, 160),
      priorYears(7, [100, 105, 110, 115, 120, 125, 130, 135, 140, 150]),
      AVAILABLE_THROUGH
    );

    expect(result.status).not.toBe("available");
    expect(result.standing).toBeNull();
    expect(result.targetValue).toBeNull();
  });

  it("states no standing for an invalid target month", () => {
    const result = describePrecipitationRecordMargin(
      precipMonth(2025, 13, 160),
      JULY_RECORD,
      AVAILABLE_THROUGH
    );

    expect(result.status).toBe("invalid");
    expect(result.standing).toBeNull();
    expect(result.calendarMonth).toBeNull();
    expect(result.reason).not.toBeNull();
  });

  it("carries the audited baseline through for provenance", () => {
    const result = describePrecipitationRecordMargin(
      precipMonth(2025, 7, 130),
      JULY_RECORD,
      AVAILABLE_THROUGH
    );

    expect(result.baseline.kind).toBe("same-calendar-month-climate-baseline");
    expect(result.baseline.status).toBe("available");
    expect(result.baseline.samples).toHaveLength(10);
    expect(result.dataMonth).toEqual({ year: 2025, month: 7 });
  });
});
