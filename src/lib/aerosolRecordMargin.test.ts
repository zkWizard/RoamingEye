import { describe, expect, it } from "vitest";
import { AEROSOL_SOURCE, type AerosolObservation } from "./aerosolLoading";
import {
  AEROSOL_RECORD_LIMITATIONS,
  describeAerosolRecordMargin,
} from "./aerosolRecordMargin";

const AVAILABLE_THROUGH = { year: 2026, month: 1 };

const aerosolMonth = (
  year: number,
  month: number,
  value: number | null,
  validFraction = 0.9
): AerosolObservation => ({
  dataMonth: { year, month },
  value,
  validFraction,
});

/** Same-calendar-month prior-year record, one value per year from 2015 up. */
const priorYears = (
  month: number,
  values: readonly number[],
  validFraction = 0.9
): AerosolObservation[] =>
  values.map((value, index) =>
    aerosolMonth(2015 + index, month, value, validFraction)
  );

/**
 * Ten-year March AOD record: clearest 0.10 (2015), haziest 0.37 (2024). Values
 * step by 0.03 to keep exact-match tie tests unambiguous.
 */
const MARCH_RECORD = priorYears(
  3,
  [0.1, 0.13, 0.16, 0.19, 0.22, 0.25, 0.28, 0.31, 0.34, 0.37]
);

describe("aerosol same-month record margin", () => {
  it("flags a new haziest-in-record month with its exceedance margin and holder", () => {
    const result = describeAerosolRecordMargin(
      aerosolMonth(2025, 3, 0.45),
      MARCH_RECORD,
      AVAILABLE_THROUGH
    );

    expect(result).toMatchObject({
      kind: "aerosol-same-month-record-standing",
      isForecast: false,
      isTrend: false,
      claimScope:
        "record-standing-within-supplied-same-place-same-calendar-month-record-only",
      status: "available",
      calendarMonth: 3,
      unit: "dimensionless",
      sampleCount: 10,
      targetValue: 0.45,
      priorHaziestValue: 0.37,
      priorHaziestMonth: { year: 2024, month: 3 },
      priorClearestValue: 0.1,
      priorClearestMonth: { year: 2015, month: 3 },
      standing: "haziest-in-record",
      reason: null,
    });
    // Exceedance and both signed margins are floating-point AOD.
    expect(result.recordExceedanceMargin).toBeCloseTo(0.08, 10);
    expect(result.marginBelowHaziest).toBeCloseTo(-0.08, 10);
    expect(result.marginAboveClearest).toBeCloseTo(0.35, 10);
    expect(result.source).toBe(AEROSOL_SOURCE);
    expect(result.wavelengthNm).toBe(550);
    expect(result.limitations).toBe(AEROSOL_RECORD_LIMITATIONS);
  });

  it("flags a new clearest-in-record month with its exceedance margin", () => {
    const result = describeAerosolRecordMargin(
      aerosolMonth(2025, 3, 0.05),
      MARCH_RECORD,
      AVAILABLE_THROUGH
    );

    expect(result).toMatchObject({
      status: "available",
      standing: "clearest-in-record",
      priorClearestValue: 0.1,
      priorClearestMonth: { year: 2015, month: 3 },
    });
    expect(result.recordExceedanceMargin).toBeCloseTo(0.05, 10);
    expect(result.marginAboveClearest).toBeCloseTo(-0.05, 10);
    expect(result.marginBelowHaziest).toBeCloseTo(0.32, 10);
  });

  it("reports both margins for a value within the observed same-month range", () => {
    const result = describeAerosolRecordMargin(
      aerosolMonth(2025, 3, 0.25),
      MARCH_RECORD,
      AVAILABLE_THROUGH
    );

    expect(result).toMatchObject({
      status: "available",
      standing: "within-record-range",
      recordExceedanceMargin: null,
    });
    expect(result.marginBelowHaziest).toBeCloseTo(0.12, 10);
    expect(result.marginAboveClearest).toBeCloseTo(0.15, 10);
  });

  it("ties the haze record without breaching it (record has spread)", () => {
    const result = describeAerosolRecordMargin(
      aerosolMonth(2025, 3, 0.37),
      MARCH_RECORD,
      AVAILABLE_THROUGH
    );

    expect(result).toMatchObject({
      standing: "ties-haziest-in-record",
      recordExceedanceMargin: null,
    });
    expect(result.marginBelowHaziest).toBe(0);
    expect(result.marginAboveClearest).toBeCloseTo(0.27, 10);
  });

  it("ties the clear record without breaching it (record has spread)", () => {
    const result = describeAerosolRecordMargin(
      aerosolMonth(2025, 3, 0.1),
      MARCH_RECORD,
      AVAILABLE_THROUGH
    );

    expect(result).toMatchObject({
      standing: "ties-clearest-in-record",
      recordExceedanceMargin: null,
    });
    expect(result.marginAboveClearest).toBe(0);
    expect(result.marginBelowHaziest).toBeCloseTo(0.27, 10);
  });

  it("ties a flat record (no spread) at both extremes at once", () => {
    const flat = priorYears(
      6,
      Array.from({ length: 10 }, () => 0.15)
    );
    const result = describeAerosolRecordMargin(
      aerosolMonth(2025, 6, 0.15),
      flat,
      AVAILABLE_THROUGH
    );

    expect(result).toMatchObject({
      standing: "ties-flat-record",
      priorHaziestValue: 0.15,
      priorClearestValue: 0.15,
      recordExceedanceMargin: null,
    });
    expect(result.marginBelowHaziest).toBe(0);
    expect(result.marginAboveClearest).toBe(0);
  });

  it("beats a flat record and reports it as a strict new haze record", () => {
    const flat = priorYears(
      6,
      Array.from({ length: 10 }, () => 0.15)
    );
    const result = describeAerosolRecordMargin(
      aerosolMonth(2025, 6, 0.2),
      flat,
      AVAILABLE_THROUGH
    );

    expect(result).toMatchObject({
      standing: "haziest-in-record",
    });
    expect(result.recordExceedanceMargin).toBeCloseTo(0.05, 10);
  });

  it("resolves tied extremes to the earliest holder month", () => {
    // Haziest 0.35 appears in both 2016 and 2019; earliest holder wins.
    const record = priorYears(
      9,
      [0.1, 0.35, 0.16, 0.19, 0.35, 0.25, 0.28, 0.31, 0.33, 0.34]
    );
    const result = describeAerosolRecordMargin(
      aerosolMonth(2025, 9, 0.4),
      record,
      AVAILABLE_THROUGH
    );

    expect(result.priorHaziestValue).toBe(0.35);
    expect(result.priorHaziestMonth).toEqual({ year: 2016, month: 9 });
    expect(result.priorClearestValue).toBe(0.1);
    expect(result.priorClearestMonth).toEqual({ year: 2015, month: 9 });
  });

  it("excludes the target year from its own record", () => {
    // A 2025 duplicate of the target year must not seed the baseline.
    const withTargetYear = [...MARCH_RECORD, aerosolMonth(2025, 3, 5.0)];
    const result = describeAerosolRecordMargin(
      aerosolMonth(2025, 3, 0.45),
      withTargetYear,
      AVAILABLE_THROUGH
    );

    expect(result.sampleCount).toBe(10);
    expect(result.priorHaziestValue).toBe(0.37);
    expect(result.standing).toBe("haziest-in-record");
  });

  it("states no standing for an under-sampled record", () => {
    const result = describeAerosolRecordMargin(
      aerosolMonth(2025, 3, 0.45),
      priorYears(3, [0.1, 0.2, 0.3]),
      AVAILABLE_THROUGH
    );

    expect(result.status).toBe("insufficient-samples");
    expect(result.standing).toBeNull();
    expect(result.recordExceedanceMargin).toBeNull();
    expect(result.priorHaziestValue).toBeNull();
    expect(result.priorClearestValue).toBeNull();
    expect(result.reason).not.toBeNull();
  });

  it("states no standing for a not-yet-published target month", () => {
    const result = describeAerosolRecordMargin(
      aerosolMonth(2026, 3, 0.45),
      priorYears(
        3,
        [0.1, 0.13, 0.16, 0.19, 0.22, 0.25, 0.28, 0.31, 0.34, 0.37]
      ),
      AVAILABLE_THROUGH
    );

    expect(result.status).not.toBe("available");
    expect(result.standing).toBeNull();
    expect(result.targetValue).toBeNull();
  });

  it("states no standing for an invalid target month", () => {
    const result = describeAerosolRecordMargin(
      aerosolMonth(2025, 13, 0.45),
      MARCH_RECORD,
      AVAILABLE_THROUGH
    );

    expect(result.status).toBe("invalid");
    expect(result.standing).toBeNull();
    expect(result.calendarMonth).toBeNull();
    expect(result.reason).not.toBeNull();
  });

  it("carries the audited baseline through for provenance", () => {
    const result = describeAerosolRecordMargin(
      aerosolMonth(2025, 3, 0.25),
      MARCH_RECORD,
      AVAILABLE_THROUGH
    );

    expect(result.baseline.kind).toBe("same-calendar-month-aerosol-baseline");
    expect(result.baseline.status).toBe("available");
    expect(result.baseline.samples).toHaveLength(10);
    expect(result.dataMonth).toEqual({ year: 2025, month: 3 });
  });
});
