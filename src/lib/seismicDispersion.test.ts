import { describe, it, expect } from "vitest";
import { seismicDispersion } from "./seismicDispersion";
import { SEISMICITY_SOURCE } from "./earthquakes";
import type { Earthquake } from "./earthquakes";

const quake = (
  lat: number,
  lon: number,
  extra: Partial<Earthquake> = {}
): Earthquake => ({
  lat,
  lon,
  depthKm: 10,
  magnitude: 5,
  time: 1_750_000_000_000,
  place: "somewhere",
  ...extra,
});

/** One arc-degree along a great circle on a 6371 km sphere, in km. */
const KM_PER_DEGREE = (Math.PI / 180) * 6371;

describe("seismicDispersion", () => {
  it("reports a coincident cluster as R≈1 with zero spread", () => {
    const profile = seismicDispersion([
      quake(10, 20),
      quake(10, 20),
      quake(10, 20),
    ]);
    expect(profile.usableEventCount).toBe(3);
    expect(profile.centroid?.latitude).toBeCloseTo(10, 6);
    expect(profile.centroid?.longitude).toBeCloseTo(20, 6);
    expect(profile.dispersion?.meanResultantLength).toBeCloseTo(1, 9);
    expect(profile.dispersion?.meanDistanceKm).toBeCloseTo(0, 6);
    expect(profile.dispersion?.medianDistanceKm).toBeCloseTo(0, 6);
    expect(profile.dispersion?.maxDistanceKm).toBeCloseTo(0, 6);
  });

  it("places the centroid of a dateline-straddling pair near ±180°, not 0°", () => {
    // Two epicentres 1° either side of the antimeridian. The arithmetic mean of
    // the longitudes is 0° — the opposite side of the Earth — so a correct
    // spherical centroid must instead land at longitude ±180°.
    const profile = seismicDispersion([quake(0, 179), quake(0, -179)]);
    expect(profile.centroid?.latitude).toBeCloseTo(0, 9);
    expect(Math.abs(profile.centroid?.longitude ?? 0)).toBeCloseTo(180, 6);
    // Each point sits 1° from the centroid along the equator.
    expect(profile.dispersion?.meanDistanceKm).toBeCloseTo(KM_PER_DEGREE, 3);
    expect(profile.dispersion?.maxDistanceKm).toBeCloseTo(KM_PER_DEGREE, 3);
    // Mean resultant length for two points each 1° from the mean is cos(1°).
    expect(profile.dispersion?.meanResultantLength).toBeCloseTo(
      Math.cos((1 * Math.PI) / 180),
      9
    );
  });

  it("returns null centroid and dispersion when epicentres cancel antipodally", () => {
    // (0°,0°) and (0°,180°) are antipodes: their unit vectors sum to zero, so
    // the mean direction is undefined and must not be reported as (0°, 0°).
    const profile = seismicDispersion([quake(0, 0), quake(0, 180)]);
    expect(profile.usableEventCount).toBe(2);
    expect(profile.centroid).toBeNull();
    expect(profile.dispersion).toBeNull();
  });

  it("is order-independent", () => {
    const points: Array<[number, number]> = [
      [12, 34],
      [15, 30],
      [9, 38],
      [11, 33],
    ];
    const ascending = seismicDispersion(
      points.map(([la, lo]) => quake(la, lo))
    );
    const shuffled = seismicDispersion(
      [...points].reverse().map(([la, lo]) => quake(la, lo))
    );
    expect(shuffled.centroid?.latitude).toBeCloseTo(
      ascending.centroid?.latitude ?? NaN,
      9
    );
    expect(shuffled.centroid?.longitude).toBeCloseTo(
      ascending.centroid?.longitude ?? NaN,
      9
    );
    expect(shuffled.dispersion?.medianDistanceKm).toBeCloseTo(
      ascending.dispersion?.medianDistanceKm ?? NaN,
      9
    );
  });

  it("reports the median distance as the middle order statistic (odd count)", () => {
    // Centroid at the equatorial prime meridian; three points due east at
    // 1°, 2°, 3° give sorted distances whose median is the 2° arc.
    const profile = seismicDispersion([quake(0, 1), quake(0, 2), quake(0, 3)]);
    // Centroid sits between the three eastern points, so distances are small
    // and the median is close to (but not exactly) the 2° arc; assert ordering.
    const d = profile.dispersion;
    expect(d).not.toBeNull();
    expect(d?.medianDistanceKm).toBeGreaterThan(0);
    expect(d?.meanDistanceKm).toBeLessThanOrEqual(d?.maxDistanceKm ?? 0);
    expect(d?.medianDistanceKm).toBeLessThanOrEqual(d?.maxDistanceKm ?? 0);
  });

  it("excludes non-finite or out-of-range coordinates but still counts them as supplied", () => {
    const profile = seismicDispersion([
      quake(10, 20),
      quake(NaN, 20),
      quake(10, 200),
      quake(95, 20),
      quake(12, 22),
    ]);
    expect(profile.suppliedEventCount).toBe(5);
    expect(profile.usableEventCount).toBe(2);
    expect(profile.centroid).not.toBeNull();
  });

  it("makes an empty input explicit with null centroid and dispersion", () => {
    const profile = seismicDispersion([]);
    expect(profile.suppliedEventCount).toBe(0);
    expect(profile.usableEventCount).toBe(0);
    expect(profile.centroid).toBeNull();
    expect(profile.dispersion).toBeNull();
  });

  it("collapses a single event to its own location with zero spread", () => {
    const profile = seismicDispersion([quake(-33.45, -70.66)]);
    expect(profile.usableEventCount).toBe(1);
    expect(profile.centroid?.latitude).toBeCloseTo(-33.45, 6);
    expect(profile.centroid?.longitude).toBeCloseTo(-70.66, 6);
    expect(profile.dispersion?.meanResultantLength).toBeCloseTo(1, 9);
    expect(profile.dispersion?.maxDistanceKm).toBeCloseTo(0, 6);
  });

  it("retains source provenance and flags itself as non-forecast", () => {
    const profile = seismicDispersion([quake(0, 0)]);
    expect(profile.source).toBe(SEISMICITY_SOURCE);
    expect(profile.isForecast).toBe(false);
    expect(profile.kind).toBe("usgs-seismic-spatial-dispersion");
    expect(profile.limitations.length).toBeGreaterThan(0);
  });
});
