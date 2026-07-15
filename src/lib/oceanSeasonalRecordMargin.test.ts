import { describe, expect, it } from "vitest";
import { SEA_SURFACE_TEMPERATURE_METRIC } from "./oceanConditions";
import type { SeaSurfaceTemperatureObservation } from "./oceanConditions";
import {
  formatSstSeasonalRecordMargin,
  summarizeSstSeasonalRecordMargin,
  SST_SEASONAL_RECORD_LIMITATIONS,
} from "./oceanSeasonalRecordMargin";

function waterMonth(
  year: number,
  value: number,
  validFraction = 0.95
): SeaSurfaceTemperatureObservation {
  return {
    dataMonth: { year, month: 8 },
    value,
    validFraction,
    footprint: "water",
  };
}

function coastalMonth(
  year: number,
  value: number,
  validFraction = 0.95
): SeaSurfaceTemperatureObservation {
  return {
    dataMonth: { year, month: 8 },
    value,
    validFraction,
    footprint: "land-mixed-coastal",
  };
}

/** Ten prior Augusts of open-water SST with strictly ascending values. */
function tenAscendingAugusts(
  startYear: number,
  startValue: number,
  step = 1
): SeaSurfaceTemperatureObservation[] {
  return Array.from({ length: 10 }, (_unused, index) =>
    waterMonth(startYear + index, startValue + index * step)
  );
}

const UNIT = SEA_SURFACE_TEMPERATURE_METRIC.sourceUnit;

describe("SST seasonal record margin", () => {
  it("reports a strict new warm record and the °C margin above the prior warmest", () => {
    // Baseline Augusts 2016–2025 = 10,11,…,19; target August 2026 = 20.
    const result = summarizeSstSeasonalRecordMargin(
      waterMonth(2026, 20),
      tenAscendingAugusts(2016, 10)
    );

    expect(result).toMatchObject({
      kind: "sea-surface-temperature-same-month-record-standing",
      isForecast: false,
      isTrend: false,
      claimScope:
        "record-standing-within-supplied-same-footprint-same-calendar-month-record-only",
      metric: SEA_SURFACE_TEMPERATURE_METRIC,
      status: "available",
      calendarMonth: 8,
      footprint: "water",
      unit: UNIT,
      sampleCount: 10,
      standing: "warmest-in-record",
      targetValue: 20,
      priorWarmestValue: 19,
      priorWarmestMonth: { year: 2025, month: 8 },
      priorCoolestValue: 10,
      priorCoolestMonth: { year: 2016, month: 8 },
      reason: null,
    });
    // 20 − 19 = 1 °C above the prior warm record.
    expect(result.recordExceedanceMargin).toBeCloseTo(1, 10);
    // Signed margins: below the (now-broken) warm record is −1; above the cool
    // record is +10.
    expect(result.marginBelowWarmest).toBeCloseTo(-1, 10);
    expect(result.marginAboveCoolest).toBeCloseTo(10, 10);
  });

  it("reports a strict new cool record below the prior coolest", () => {
    const result = summarizeSstSeasonalRecordMargin(
      waterMonth(2026, 9),
      tenAscendingAugusts(2016, 10)
    );

    expect(result.standing).toBe("coolest-in-record");
    // 10 − 9 = 1 °C below the prior cool record (2016).
    expect(result.recordExceedanceMargin).toBeCloseTo(1, 10);
    expect(result.priorCoolestMonth).toEqual({ year: 2016, month: 8 });
    expect(result.marginAboveCoolest).toBeCloseTo(-1, 10);
    expect(result.marginBelowWarmest).toBeCloseTo(10, 10);
  });

  it("places a mid-range value inside the observed same-month envelope", () => {
    const result = summarizeSstSeasonalRecordMargin(
      waterMonth(2026, 15.5),
      tenAscendingAugusts(2016, 10)
    );

    expect(result.standing).toBe("within-record-range");
    // No extreme was breached, so there is no exceedance margin.
    expect(result.recordExceedanceMargin).toBeNull();
    // 19 − 15.5 = 3.5 below the warm record; 15.5 − 10 = 5.5 above the cool one.
    expect(result.marginBelowWarmest).toBeCloseTo(3.5, 10);
    expect(result.marginAboveCoolest).toBeCloseTo(5.5, 10);
  });

  it("distinguishes a tie of the warm record from a strict new record", () => {
    const result = summarizeSstSeasonalRecordMargin(
      waterMonth(2026, 19),
      tenAscendingAugusts(2016, 10)
    );

    expect(result.standing).toBe("ties-warmest-in-record");
    expect(result.recordExceedanceMargin).toBeNull();
    expect(result.marginBelowWarmest).toBeCloseTo(0, 10);
  });

  it("distinguishes a tie of the cool record from a strict new record", () => {
    const result = summarizeSstSeasonalRecordMargin(
      waterMonth(2026, 10),
      tenAscendingAugusts(2016, 10)
    );

    expect(result.standing).toBe("ties-coolest-in-record");
    expect(result.recordExceedanceMargin).toBeNull();
    expect(result.marginAboveCoolest).toBeCloseTo(0, 10);
  });

  it("reports a flat record as a single tie of both extremes at once", () => {
    // A perfectly flat baseline has zero spread, so the standardized anomaly is
    // withheld — but the record standing is still well defined.
    const flat = Array.from({ length: 10 }, (_unused, index) =>
      waterMonth(2016 + index, 12)
    );
    const result = summarizeSstSeasonalRecordMargin(waterMonth(2026, 12), flat);

    expect(result.status).toBe("available");
    expect(result.standing).toBe("ties-flat-record");
    expect(result.priorWarmestValue).toBe(12);
    expect(result.priorCoolestValue).toBe(12);
    expect(result.recordExceedanceMargin).toBeNull();
  });

  it("still names a new record above an otherwise flat prior record", () => {
    const flat = Array.from({ length: 10 }, (_unused, index) =>
      waterMonth(2016 + index, 12)
    );
    const result = summarizeSstSeasonalRecordMargin(waterMonth(2026, 13), flat);

    expect(result.standing).toBe("warmest-in-record");
    expect(result.recordExceedanceMargin).toBeCloseTo(1, 10);
  });

  it("resolves a tied record extreme to the earliest holding month", () => {
    // 2024 and 2025 both hold the maximum (19); the earliest wins.
    const values = [10, 11, 12, 13, 14, 15, 16, 17, 19, 19];
    const candidates = values.map((value, index) =>
      waterMonth(2016 + index, value)
    );
    const result = summarizeSstSeasonalRecordMargin(
      waterMonth(2026, 20),
      candidates
    );

    expect(result.standing).toBe("warmest-in-record");
    expect(result.priorWarmestMonth).toEqual({ year: 2024, month: 8 });
  });

  it("never mixes footprints: coastal candidates do not seed an open-water record", () => {
    const coastal = Array.from({ length: 10 }, (_unused, index) =>
      coastalMonth(2016 + index, 10 + index)
    );
    const result = summarizeSstSeasonalRecordMargin(
      waterMonth(2026, 20),
      coastal
    );

    // No same-footprint samples clear the floor, so no standing is invented.
    expect(result.status).not.toBe("available");
    expect(result.standing).toBeNull();
    expect(result.recordExceedanceMargin).toBeNull();
  });

  it("withholds a standing when the baseline has too few same-month samples", () => {
    const result = summarizeSstSeasonalRecordMargin(
      waterMonth(2026, 20),
      tenAscendingAugusts(2016, 10).slice(0, 5)
    );

    expect(result.status).toBe("insufficient-samples");
    expect(result.standing).toBeNull();
    expect(result.reason).toBe("too-few-same-calendar-month-samples");
    expect(result.limitations).toBe(SST_SEASONAL_RECORD_LIMITATIONS);
  });

  it("excludes the target year from its own record", () => {
    // A 2026 candidate must not be counted as prior to the 2026 target.
    const candidates = [...tenAscendingAugusts(2016, 10), waterMonth(2026, 99)];
    const result = summarizeSstSeasonalRecordMargin(
      waterMonth(2026, 20),
      candidates
    );

    expect(result.sampleCount).toBe(10);
    expect(result.priorWarmestValue).toBe(19);
    expect(result.standing).toBe("warmest-in-record");
  });
});

describe("formatSstSeasonalRecordMargin", () => {
  it("renders a cited one-line readout for a new warm record", () => {
    const line = formatSstSeasonalRecordMargin(
      summarizeSstSeasonalRecordMargin(
        waterMonth(2026, 20),
        tenAscendingAugusts(2016, 10)
      )
    );

    expect(line).toContain("warmest open-water Aug in the record");
    expect(line).toContain(`1${UNIT} above the prior warmest`);
    expect(line).toContain("2025");
    expect(line).toContain("10 same-calendar-month years");
    expect(line).toContain(SEA_SURFACE_TEMPERATURE_METRIC.source.shortName);
    // Never dressed up as a forecast or an all-time record.
    expect(line).toContain("not an all-time or climatological record");
  });

  it("names both nearest records for a value within the envelope", () => {
    const line = formatSstSeasonalRecordMargin(
      summarizeSstSeasonalRecordMargin(
        waterMonth(2026, 15.5),
        tenAscendingAugusts(2016, 10)
      )
    );

    expect(line).toContain("within the observed same-month range");
    expect(line).toContain(`3.5${UNIT} below the warmest`);
    expect(line).toContain(`5.5${UNIT} above the coolest`);
  });

  it("states an unavailable standing plainly rather than inventing a record", () => {
    const line = formatSstSeasonalRecordMargin(
      summarizeSstSeasonalRecordMargin(
        waterMonth(2026, 20),
        tenAscendingAugusts(2016, 10).slice(0, 5)
      )
    );

    expect(line).toContain("no record standing is reported");
    expect(line).toContain("too-few-same-calendar-month-samples");
  });
});
