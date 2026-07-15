import { describe, it, expect } from "vitest";
import { seismicMagnitudeProfile } from "./seismicMagnitudeProfile";
import { SEISMICITY_SOURCE, SEISMICITY_UNITS } from "./earthquakes";
import type { Earthquake } from "./earthquakes";

const quake = (
  magnitude: number,
  extra: Partial<Earthquake> = {}
): Earthquake => ({
  lat: 0,
  lon: 0,
  depthKm: 10,
  magnitude,
  time: 1_750_000_000_000,
  place: "somewhere",
  ...extra,
});

describe("seismicMagnitudeProfile", () => {
  it("reports quartiles, median and IQR by linear interpolation", () => {
    // Magnitudes 4.5,5.0,5.5,6.0,6.5: median 5.5, Q1 5.0, Q3 6.0 under R-7.
    const profile = seismicMagnitudeProfile(
      [4.5, 5.0, 5.5, 6.0, 6.5].map((m) => quake(m))
    );
    expect(profile.quantiles).toEqual({
      min: 4.5,
      q1: 5.0,
      median: 5.5,
      q3: 6.0,
      max: 6.5,
      iqr: 1.0,
    });
    expect(profile.usableEventCount).toBe(5);
    expect(profile.suppliedEventCount).toBe(5);
  });

  it("interpolates between order statistics for non-integer ranks", () => {
    // Four values 4,5,6,7: Q1 rank 0.75 → 4 + 0.75*(5-4) = 4.75;
    // median rank 1.5 → 5.5; Q3 rank 2.25 → 6 + 0.25*(7-6) = 6.25.
    const profile = seismicMagnitudeProfile([4, 5, 6, 7].map((m) => quake(m)));
    expect(profile.quantiles).toMatchObject({
      q1: 4.75,
      median: 5.5,
      q3: 6.25,
      iqr: 1.5,
    });
  });

  it("is order-independent (sorts before computing)", () => {
    const ascending = seismicMagnitudeProfile(
      [4.6, 5.2, 6.8, 8.1].map((m) => quake(m))
    );
    const shuffled = seismicMagnitudeProfile(
      [8.1, 5.2, 4.6, 6.8].map((m) => quake(m))
    );
    expect(shuffled.quantiles).toEqual(ascending.quantiles);
  });

  it("collapses to the single value for a one-event set with zero IQR", () => {
    const profile = seismicMagnitudeProfile([quake(5.7)]);
    expect(profile.quantiles).toEqual({
      min: 5.7,
      q1: 5.7,
      median: 5.7,
      q3: 5.7,
      max: 5.7,
      iqr: 0,
    });
  });

  it("reports zero IQR when every magnitude is identical", () => {
    const profile = seismicMagnitudeProfile(
      [4.8, 4.8, 4.8].map((m) => quake(m))
    );
    expect(profile.quantiles).toMatchObject({ median: 4.8, iqr: 0 });
  });

  it("retains negative (small-event) magnitudes as reported", () => {
    const profile = seismicMagnitudeProfile([-1, 0, 2].map((m) => quake(m)));
    expect(profile.quantiles?.min).toBe(-1);
    expect(profile.quantiles?.median).toBe(0);
  });

  it("excludes non-finite magnitudes from the quantiles but counts them supplied", () => {
    const profile = seismicMagnitudeProfile([
      quake(5),
      quake(Number.NaN),
      quake(7),
      quake(Number.POSITIVE_INFINITY),
    ]);
    expect(profile.usableEventCount).toBe(2);
    expect(profile.suppliedEventCount).toBe(4);
    expect(profile.quantiles).toMatchObject({ min: 5, max: 7, median: 6 });
  });

  it("returns a null distribution when no event has a finite magnitude", () => {
    const profile = seismicMagnitudeProfile([quake(Number.NaN)]);
    expect(profile.quantiles).toBeNull();
    expect(profile.usableEventCount).toBe(0);
    expect(profile.suppliedEventCount).toBe(1);
  });

  it("returns a null distribution for an empty set", () => {
    const profile = seismicMagnitudeProfile([]);
    expect(profile.quantiles).toBeNull();
    expect(profile.usableEventCount).toBe(0);
    expect(profile.suppliedEventCount).toBe(0);
  });

  it("carries provenance and native units, and is not a forecast", () => {
    const profile = seismicMagnitudeProfile([quake(6.1)]);
    expect(profile.kind).toBe("usgs-seismic-magnitude-profile");
    expect(profile.isForecast).toBe(false);
    expect(profile.source).toBe(SEISMICITY_SOURCE);
    expect(profile.units).toBe(SEISMICITY_UNITS);
    expect(profile.limitations.length).toBeGreaterThan(0);
    expect(profile.limitations.join(" ")).toMatch(/not a hazard/i);
  });

  it("documents that these are not an energy total (moment is separate)", () => {
    const profile = seismicMagnitudeProfile([quake(6.1)]);
    expect(profile.limitations.join(" ")).toMatch(/seismic moment/i);
  });
});
