import { describe, it, expect } from "vitest";
import {
  flyToDistance,
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
