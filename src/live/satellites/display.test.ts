import { describe, expect, it } from "vitest";
import { latLngToVector3 } from "../../lib/geo";
import {
  displayRadius,
  lerpLon,
  orbitCountLabel,
  unitVector,
  validCount,
  writePointBuffer,
} from "./display";

describe("displayRadius", () => {
  it("lifts the ISS off the surface and keeps GEO inside the camera", () => {
    const iss = displayRadius(420);
    const geo = displayRadius(35786);
    expect(iss).toBeGreaterThan(1.05);
    expect(iss).toBeLessThan(1.2);
    expect(geo).toBeGreaterThan(iss);
    expect(geo).toBeLessThan(1.8);
  });
});

describe("unitVector", () => {
  it("matches the globe's lat/lon mapping", () => {
    for (const [lat, lon] of [
      [0, 0],
      [41.2, -73.5],
      [-33.9, 151.2],
      [89, 10],
    ] as const) {
      const expected = latLngToVector3(lat, lon, 1);
      const [x, y, z] = unitVector(lat, lon);
      expect(x).toBeCloseTo(expected.x, 8);
      expect(y).toBeCloseTo(expected.y, 8);
      expect(z).toBeCloseTo(expected.z, 8);
    }
  });
});

describe("lerpLon", () => {
  it("crosses the antimeridian the short way", () => {
    expect(lerpLon(170, -170, 0.5)).toBeCloseTo(180, 6);
    expect(lerpLon(-170, 170, 0.5)).toBeCloseTo(-180, 6);
  });
});

describe("writePointBuffer", () => {
  it("thins by stride and hides the far side", () => {
    const lat = [0, 0, 0, 0];
    // Camera sits on +Z. Longitude -90 is that face of the globe.
    const lon = [-90, 0, 90, 180];
    const altKm = [400, 400, 400, 400];
    const out = new Float32Array(12);
    const written = writePointBuffer({
      lat,
      lon,
      altKm,
      stride: 4,
      cameraX: 0,
      cameraY: 0,
      cameraZ: 3.2,
      out,
    });
    // Index 0 only. Longitude 0 faces +Z, which is the camera.
    expect(written).toBe(1);
    expect(out[2]).toBeGreaterThan(1);
  });

  it("skips a decayed sample", () => {
    const out = new Float32Array(6);
    const written = writePointBuffer({
      lat: [Number.NaN, 0],
      lon: [0, -90],
      altKm: [0, 400],
      stride: 1,
      cameraX: 0,
      cameraY: 0,
      cameraZ: 3.2,
      out,
    });
    expect(written).toBe(1);
    expect(validCount([Number.NaN, 10, 20])).toBe(2);
  });
});

describe("orbitCountLabel", () => {
  it("groups thousands", () => {
    expect(orbitCountLabel(11203)).toBe("11,203 in orbit");
    expect(orbitCountLabel(0)).toBe("0 in orbit");
  });
});
