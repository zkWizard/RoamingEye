import { describe, it, expect } from "vitest";
import { nextPixelRatio, LOW_FPS, HIGH_FPS, MIN_PIXEL_RATIO } from "./perf";

describe("nextPixelRatio", () => {
  it("steps down under sustained low FPS", () => {
    expect(nextPixelRatio(2, 15)).toBe(1.6);
    expect(nextPixelRatio(1.6, 10)).toBe(1.28);
  });

  it("never drops below the floor", () => {
    expect(nextPixelRatio(0.8, 5)).toBe(MIN_PIXEL_RATIO);
    expect(nextPixelRatio(MIN_PIXEL_RATIO, 5)).toBe(MIN_PIXEL_RATIO);
  });

  it("steps back up only with clear headroom, capped at max", () => {
    expect(nextPixelRatio(1.6, 60)).toBe(2);
    expect(nextPixelRatio(1.28, 60)).toBe(1.6);
    expect(nextPixelRatio(2, 60)).toBe(2); // already at max
    expect(nextPixelRatio(1.6, 60, MIN_PIXEL_RATIO, 1.5)).toBe(1.6); // custom max respected as cap only when below
  });

  it("holds steady inside the hysteresis band", () => {
    for (const fps of [LOW_FPS, 40, HIGH_FPS]) {
      expect(nextPixelRatio(1.6, fps)).toBe(1.6);
    }
  });
});
