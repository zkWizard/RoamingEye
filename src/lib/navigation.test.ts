import { describe, it, expect } from "vitest";
import {
  flyToDistance,
  rotateSpeedForDistance,
  BASE_ROTATE_SPEED,
  MIN_FLY_DISTANCE,
  MAX_FLY_DISTANCE,
} from "./navigation";

describe("flyToDistance", () => {
  it("returns a sensible default when there is no bounding box", () => {
    const d = flyToDistance(null);
    expect(d).toBeGreaterThan(MIN_FLY_DISTANCE);
    expect(d).toBeLessThan(MAX_FLY_DISTANCE);
  });

  it("zooms closest for a tiny (city-sized) area", () => {
    const tiny = flyToDistance([40.4, 40.45, -3.75, -3.65]); // ~Madrid centre
    expect(tiny).toBeCloseTo(MIN_FLY_DISTANCE, 1);
  });

  it("stays further out for a large country", () => {
    const big = flyToDistance([36, 44, -9, 3]); // ~Spain
    const small = flyToDistance([40.4, 40.45, -3.75, -3.65]);
    expect(big).toBeGreaterThan(small);
  });

  it("never exceeds the configured bounds", () => {
    const huge = flyToDistance([-55, 70, -170, 170]); // continent-scale
    expect(huge).toBeLessThanOrEqual(MAX_FLY_DISTANCE);
    expect(huge).toBeGreaterThanOrEqual(MIN_FLY_DISTANCE);
  });
});

describe("rotateSpeedForDistance", () => {
  it("keeps the boot-view feel unchanged (calibration point)", () => {
    expect(rotateSpeedForDistance(3.2)).toBeCloseTo(BASE_ROTATE_SPEED, 5);
  });

  it("slows dramatically at surface zoom (OrbitControls minDistance)", () => {
    const surface = rotateSpeedForDistance(1.06);
    expect(surface).toBeLessThan(BASE_ROTATE_SPEED / 30);
    expect(surface).toBeGreaterThan(0); // never a dead stop
  });

  it("never gets faster than the old constant at far zoom-out", () => {
    expect(rotateSpeedForDistance(4.5)).toBe(BASE_ROTATE_SPEED);
  });

  it("is monotonically non-decreasing with distance", () => {
    let prev = 0;
    for (let d = 1.06; d <= 4.5; d += 0.05) {
      const speed = rotateSpeedForDistance(d);
      expect(speed).toBeGreaterThanOrEqual(prev);
      prev = speed;
    }
  });

  it("floors gracefully for degenerate distances at/below the surface", () => {
    expect(rotateSpeedForDistance(1)).toBe(0.01);
    expect(rotateSpeedForDistance(0.5)).toBe(0.01);
  });
});
