import { describe, it, expect } from "vitest";
import {
  latLngToVector3,
  vector3ToLatLng,
  formatLatLng,
  greatCircleDistance,
} from "./geo";

describe("latLngToVector3", () => {
  it("maps (0, 0) to +X on the unit sphere", () => {
    const v = latLngToVector3(0, 0);
    expect(v.x).toBeCloseTo(1);
    expect(v.y).toBeCloseTo(0);
    expect(v.z).toBeCloseTo(0);
  });

  it("maps the north pole to +Y", () => {
    const v = latLngToVector3(90, 0);
    expect(v.x).toBeCloseTo(0);
    expect(v.y).toBeCloseTo(1);
    expect(v.z).toBeCloseTo(0);
  });

  it("maps (0, 90) to -Z", () => {
    const v = latLngToVector3(0, 90);
    expect(v.x).toBeCloseTo(0);
    expect(v.y).toBeCloseTo(0);
    expect(v.z).toBeCloseTo(-1);
  });

  it("keeps longitudes 180° apart antipodal in the XZ plane", () => {
    const east = latLngToVector3(0, 90);
    const west = latLngToVector3(0, -90);
    expect(east.x).toBeCloseTo(-west.x);
    expect(east.z).toBeCloseTo(-west.z);
  });

  it("always lands on the sphere of the requested radius", () => {
    const radius = 5;
    for (const [lat, lon] of [
      [12, 34],
      [-45, 170],
      [80, -120],
    ]) {
      expect(latLngToVector3(lat, lon, radius).length()).toBeCloseTo(radius);
    }
  });
});

describe("vector3ToLatLng", () => {
  it("round-trips lat/lng through the projection", () => {
    for (const [lat, lon] of [
      [0, 0],
      [40.24, -3.69], // Toledo-ish
      [-33.87, 151.21], // Sydney-ish
      [64, -22], // Reykjavik-ish
    ]) {
      const back = vector3ToLatLng(latLngToVector3(lat, lon, 1));
      expect(back.lat).toBeCloseTo(lat, 4);
      expect(back.lon).toBeCloseTo(lon, 4);
    }
  });

  it("is radius-independent", () => {
    const back = vector3ToLatLng(latLngToVector3(12, 34, 7));
    expect(back.lat).toBeCloseTo(12, 4);
    expect(back.lon).toBeCloseTo(34, 4);
  });
});

describe("formatLatLng", () => {
  it("labels hemispheres", () => {
    expect(formatLatLng({ lat: 40.24, lon: -3.69 })).toBe("40.24°N, 3.69°W");
    expect(formatLatLng({ lat: -33.87, lon: 151.21 })).toBe(
      "33.87°S, 151.21°E"
    );
  });
});

describe("greatCircleDistance", () => {
  it("is zero between a point and itself", () => {
    expect(greatCircleDistance(40.7, -74, 40.7, -74)).toBeCloseTo(0);
  });

  it("spans half the circumference between antipodes", () => {
    const r = 6_371_000;
    const expected = Math.PI * r; // half the great circle
    expect(greatCircleDistance(0, 0, 0, 180)).toBeCloseTo(expected, 0);
  });

  it("approximates the London↔New York distance (~5570 km)", () => {
    const km = greatCircleDistance(51.5074, -0.1278, 40.7128, -74.006) / 1000;
    expect(km).toBeGreaterThan(5500);
    expect(km).toBeLessThan(5600);
  });
});
