import { describe, it, expect } from "vitest";
import {
  flyToDistance,
  rotateSpeedForDistance,
  stepGlobeView,
  BASE_ROTATE_SPEED,
  BASE_STEP_DEGREES,
  MAX_STEP_LATITUDE,
  MIN_FLY_DISTANCE,
  MAX_FLY_DISTANCE,
  ZOOM_STEP,
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

describe("stepGlobeView", () => {
  const BOOT = { lat: 0, lon: 0, distance: 3.2 };
  const BOUNDS = { min: 1.06, max: 4.5 };

  it("ignores keys that aren't globe navigation", () => {
    for (const key of ["Enter", " ", "a", "Home", "PageUp", "Tab"]) {
      expect(stepGlobeView(BOOT, key, BOUNDS)).toBeNull();
    }
  });

  it("steps east and west by the full step at the boot view", () => {
    expect(stepGlobeView(BOOT, "ArrowRight", BOUNDS)?.lon).toBeCloseTo(
      BASE_STEP_DEGREES,
      6
    );
    expect(stepGlobeView(BOOT, "ArrowLeft", BOUNDS)?.lon).toBeCloseTo(
      -BASE_STEP_DEGREES,
      6
    );
  });

  it("keeps latitude and distance untouched when turning", () => {
    const east = stepGlobeView(BOOT, "ArrowRight", BOUNDS);
    expect(east?.lat).toBe(BOOT.lat);
    expect(east?.distance).toBe(BOOT.distance);
  });

  it("scales the step with altitude, like a drag does", () => {
    const surface = stepGlobeView(
      { ...BOOT, distance: 1.06 },
      "ArrowRight",
      BOUNDS
    );
    expect(surface?.lon).toBeLessThan(BASE_STEP_DEGREES / 30);
    expect(surface?.lon).toBeGreaterThan(0); // never a dead stop
  });

  it("stops short of the poles, where a viewpoint has no heading", () => {
    let view = { ...BOOT, lat: 80 };
    for (let i = 0; i < 20; i++) {
      view = stepGlobeView(view, "ArrowUp", BOUNDS) as typeof view;
    }
    expect(view.lat).toBe(MAX_STEP_LATITUDE);
    let south = { ...BOOT, lat: -80 };
    for (let i = 0; i < 20; i++) {
      south = stepGlobeView(south, "ArrowDown", BOUNDS) as typeof south;
    }
    expect(south.lat).toBe(-MAX_STEP_LATITUDE);
  });

  it("leaves longitude unwrapped so stepping past the antimeridian continues", () => {
    const past = stepGlobeView({ ...BOOT, lon: 179 }, "ArrowRight", BOUNDS);
    expect(past?.lon).toBeCloseTo(179 + BASE_STEP_DEGREES, 6);
  });

  it("zooms in and out by the same factor, both spellings", () => {
    expect(stepGlobeView(BOOT, "+", BOUNDS)?.distance).toBeCloseTo(
      BOOT.distance / ZOOM_STEP,
      6
    );
    expect(stepGlobeView(BOOT, "=", BOUNDS)?.distance).toBeCloseTo(
      BOOT.distance / ZOOM_STEP,
      6
    );
    expect(stepGlobeView(BOOT, "-", BOUNDS)?.distance).toBeCloseTo(
      BOOT.distance * ZOOM_STEP,
      6
    );
    expect(stepGlobeView(BOOT, "_", BOUNDS)?.distance).toBeCloseTo(
      BOOT.distance * ZOOM_STEP,
      6
    );
  });

  it("clamps zoom to the same bounds OrbitControls enforces for the wheel", () => {
    let view = BOOT;
    for (let i = 0; i < 40; i++) {
      view = stepGlobeView(view, "+", BOUNDS) as typeof view;
    }
    expect(view.distance).toBe(BOUNDS.min);
    for (let i = 0; i < 40; i++) {
      view = stepGlobeView(view, "-", BOUNDS) as typeof view;
    }
    expect(view.distance).toBe(BOUNDS.max);
  });
});
