import { describe, it, expect } from "vitest";
import { seismicDepthProfile } from "./seismicDepthProfile";
import { SEISMICITY_SOURCE, SEISMICITY_UNITS } from "./earthquakes";
import type { Earthquake } from "./earthquakes";

const quake = (
  depthKm: number,
  extra: Partial<Earthquake> = {}
): Earthquake => ({
  lat: 0,
  lon: 0,
  depthKm,
  magnitude: 5,
  time: 1_750_000_000_000,
  place: "somewhere",
  ...extra,
});

describe("seismicDepthProfile", () => {
  it("reports quartiles, median and IQR by linear interpolation", () => {
    // Depths 10,20,30,40,50: median 30, Q1 20, Q3 40 under the R-7 method.
    const profile = seismicDepthProfile(
      [10, 20, 30, 40, 50].map((d) => quake(d))
    );
    expect(profile.quantiles).toEqual({
      min: 10,
      q1: 20,
      median: 30,
      q3: 40,
      max: 50,
      iqr: 20,
    });
    expect(profile.usableEventCount).toBe(5);
    expect(profile.suppliedEventCount).toBe(5);
  });

  it("interpolates between order statistics for non-integer ranks", () => {
    // Four values: rank for Q1 = 0.75 → 10 + 0.75*(20-10) = 17.5;
    // median rank 1.5 → 25; Q3 rank 2.25 → 30 + 0.25*(40-30) = 32.5.
    const profile = seismicDepthProfile([10, 20, 30, 40].map((d) => quake(d)));
    expect(profile.quantiles).toMatchObject({
      q1: 17.5,
      median: 25,
      q3: 32.5,
      iqr: 15,
    });
  });

  it("is order-independent (sorts before computing)", () => {
    const ascending = seismicDepthProfile(
      [5, 15, 70, 300].map((d) => quake(d))
    );
    const shuffled = seismicDepthProfile([300, 15, 5, 70].map((d) => quake(d)));
    expect(shuffled.quantiles).toEqual(ascending.quantiles);
  });

  it("collapses to the single value for a one-event set with zero IQR", () => {
    const profile = seismicDepthProfile([quake(42)]);
    expect(profile.quantiles).toEqual({
      min: 42,
      q1: 42,
      median: 42,
      q3: 42,
      max: 42,
      iqr: 0,
    });
  });

  it("reports zero IQR when every depth is identical", () => {
    const profile = seismicDepthProfile([33, 33, 33].map((d) => quake(d)));
    expect(profile.quantiles).toMatchObject({ median: 33, iqr: 0 });
  });

  it("retains negative (above-datum) depths as reported", () => {
    const profile = seismicDepthProfile([-2, 0, 4].map((d) => quake(d)));
    expect(profile.quantiles?.min).toBe(-2);
    expect(profile.quantiles?.median).toBe(0);
  });

  it("excludes non-finite depths from the quantiles but counts them supplied", () => {
    const profile = seismicDepthProfile([
      quake(10),
      quake(Number.NaN),
      quake(30),
      quake(Number.POSITIVE_INFINITY),
    ]);
    expect(profile.usableEventCount).toBe(2);
    expect(profile.suppliedEventCount).toBe(4);
    expect(profile.quantiles).toMatchObject({ min: 10, max: 30, median: 20 });
  });

  it("returns a null distribution when no event has a finite depth", () => {
    const profile = seismicDepthProfile([quake(Number.NaN)]);
    expect(profile.quantiles).toBeNull();
    expect(profile.usableEventCount).toBe(0);
    expect(profile.suppliedEventCount).toBe(1);
  });

  it("returns a null distribution for an empty set", () => {
    const profile = seismicDepthProfile([]);
    expect(profile.quantiles).toBeNull();
    expect(profile.usableEventCount).toBe(0);
    expect(profile.suppliedEventCount).toBe(0);
  });

  it("carries provenance and native units, and is not a forecast", () => {
    const profile = seismicDepthProfile([quake(12)]);
    expect(profile.kind).toBe("usgs-seismic-depth-profile");
    expect(profile.isForecast).toBe(false);
    expect(profile.source).toBe(SEISMICITY_SOURCE);
    expect(profile.units).toBe(SEISMICITY_UNITS);
    expect(profile.limitations.length).toBeGreaterThan(0);
    expect(profile.limitations.join(" ")).toMatch(/not a hazard/i);
  });
});
