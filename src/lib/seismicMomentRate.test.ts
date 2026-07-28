import { describe, it, expect } from "vitest";
import type { Earthquake } from "./earthquakes";
import {
  cumulativeSeismicMoment,
  magnitudeFromMoment,
  momentFromMagnitude,
  SEISMIC_MOMENT_REFERENCE,
} from "./seismicMoment";
import {
  seismicMomentRate,
  DAYS_PER_JULIAN_YEAR,
  MS_PER_JULIAN_YEAR,
  SEISMIC_MOMENT_RATE_UNITS,
} from "./seismicMomentRate";

/** Minimal event with only the fields this helper reads; others are inert. */
function quake(magnitude: number, time: number): Earthquake {
  return { lat: 0, lon: 0, depthKm: 10, magnitude, time, place: "" };
}

describe("seismicMomentRate", () => {
  it("divides total moment by the observed span, per Julian year", () => {
    // Two M6 events one Julian year apart: span = 1 yr, so the annual rate
    // equals the whole set's summed moment.
    const result = seismicMomentRate([
      quake(6, 0),
      quake(6, MS_PER_JULIAN_YEAR),
    ]);
    const total = 2 * momentFromMagnitude(6)!;
    expect(result.contributingCount).toBe(2);
    expect(result.skippedCount).toBe(0);
    expect(result.totalMomentNm).toBeCloseTo(total, 3);
    expect(result.timeSpanMs).toBe(MS_PER_JULIAN_YEAR);
    expect(result.timeSpanDays).toBeCloseTo(DAYS_PER_JULIAN_YEAR, 6);
    expect(result.momentRateNmPerYear).toBeCloseTo(total, 3);
  });

  it("annualized equivalent magnitude is the Mw of one year's release", () => {
    const result = seismicMomentRate([
      quake(6, 0),
      quake(6, MS_PER_JULIAN_YEAR),
    ]);
    // One year's release == the whole set here, so the annualized equivalent
    // magnitude matches cumulativeSeismicMoment's equivalent magnitude.
    const cumulative = cumulativeSeismicMoment([6, 6]);
    expect(result.annualizedEquivalentMagnitude).toBeCloseTo(
      cumulative.equivalentMomentMagnitude!,
      6
    );
    expect(result.annualizedEquivalentMagnitude).toBeCloseTo(
      magnitudeFromMoment(result.momentRateNmPerYear!)!,
      9
    );
  });

  it("rate scales inversely with the span", () => {
    const oneYear = seismicMomentRate([
      quake(6, 0),
      quake(6, MS_PER_JULIAN_YEAR),
    ]);
    const twoYears = seismicMomentRate([
      quake(6, 0),
      quake(6, 2 * MS_PER_JULIAN_YEAR),
    ]);
    // Same energy over twice the span → half the rate → one Mw unit's worth of
    // moment less per year (10^1.5 ≈ 31.6× per unit, and halving is far less).
    expect(twoYears.momentRateNmPerYear).toBeCloseTo(
      oneYear.momentRateNmPerYear! / 2,
      3
    );
    // A single M6's moment released per year → annualized Mw of exactly 6.
    expect(twoYears.annualizedEquivalentMagnitude).toBeCloseTo(6, 9);
  });

  it("is independent of the supplied order", () => {
    const ascending = seismicMomentRate([
      quake(5, 0),
      quake(6, MS_PER_JULIAN_YEAR),
    ]);
    const descending = seismicMomentRate([
      quake(6, MS_PER_JULIAN_YEAR),
      quake(5, 0),
    ]);
    expect(descending.timeSpanMs).toBe(ascending.timeSpanMs);
    expect(descending.momentRateNmPerYear).toBeCloseTo(
      ascending.momentRateNmPerYear!,
      3
    );
  });

  it("returns a null rate for a single contributing event (zero span)", () => {
    const result = seismicMomentRate([quake(6, 1_000)]);
    expect(result.contributingCount).toBe(1);
    expect(result.totalMomentNm).toBeCloseTo(momentFromMagnitude(6)!, 3);
    expect(result.timeSpanMs).toBe(0);
    expect(result.timeSpanDays).toBe(0);
    expect(result.momentRateNmPerYear).toBeNull();
    expect(result.annualizedEquivalentMagnitude).toBeNull();
  });

  it("returns a null rate when all events are coincident in time", () => {
    const result = seismicMomentRate([
      quake(5, 500),
      quake(6, 500),
      quake(4, 500),
    ]);
    expect(result.contributingCount).toBe(3);
    expect(result.timeSpanMs).toBe(0);
    expect(result.momentRateNmPerYear).toBeNull();
    expect(result.annualizedEquivalentMagnitude).toBeNull();
    // The total is still reported even though the rate is undefined.
    const total =
      momentFromMagnitude(5)! +
      momentFromMagnitude(6)! +
      momentFromMagnitude(4)!;
    expect(result.totalMomentNm).toBeCloseTo(total, 3);
  });

  it("skips events with a non-finite magnitude or time, and counts them", () => {
    const result = seismicMomentRate([
      quake(6, 0),
      quake(NaN, MS_PER_JULIAN_YEAR / 2),
      quake(5, Number.POSITIVE_INFINITY),
      quake(6, MS_PER_JULIAN_YEAR),
    ]);
    expect(result.contributingCount).toBe(2);
    expect(result.skippedCount).toBe(2);
    // The span uses only the two finite-time contributors.
    expect(result.timeSpanMs).toBe(MS_PER_JULIAN_YEAR);
    expect(result.totalMomentNm).toBeCloseTo(2 * momentFromMagnitude(6)!, 3);
  });

  it("reports an explicit empty basis for no usable events", () => {
    const result = seismicMomentRate([]);
    expect(result.contributingCount).toBe(0);
    expect(result.skippedCount).toBe(0);
    expect(result.totalMomentNm).toBe(0);
    expect(result.timeSpanMs).toBe(0);
    expect(result.momentRateNmPerYear).toBeNull();
    expect(result.annualizedEquivalentMagnitude).toBeNull();
  });

  it("carries provenance, units, and non-forecast framing", () => {
    const result = seismicMomentRate([
      quake(6, 0),
      quake(6, MS_PER_JULIAN_YEAR),
    ]);
    expect(result.kind).toBe("seismic-moment-rate");
    expect(result.isForecast).toBe(false);
    expect(result.reference).toBe(SEISMIC_MOMENT_REFERENCE);
    expect(result.units).toBe(SEISMIC_MOMENT_RATE_UNITS);
    expect(result.source.name).toMatch(/USGS/);
    expect(result.limitations.length).toBeGreaterThan(0);
    expect(result.limitations.some((l) => /forecast/i.test(l))).toBe(true);
  });
});
