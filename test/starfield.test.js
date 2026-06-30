import { describe, it, expect } from "vitest";
import {
  generateStarPositions,
  STAR_SHELL_MIN,
  STAR_SHELL_RANGE,
} from "../src/starfield.js";

/**
 * Deterministic RNG: cycles through a fixed list of values in [0, 1).
 * Lets us assert exact geometry instead of probabilistic ranges.
 */
function seededRng(values) {
  let i = 0;
  return () => values[i++ % values.length];
}

describe("generateStarPositions", () => {
  it("returns a flat Float32Array of length starCount * 3", () => {
    const positions = generateStarPositions(1500);
    expect(positions).toBeInstanceOf(Float32Array);
    expect(positions.length).toBe(1500 * 3);
  });

  it("returns an empty buffer for a count of 0", () => {
    const positions = generateStarPositions(0);
    expect(positions).toBeInstanceOf(Float32Array);
    expect(positions.length).toBe(0);
  });

  it("places every star within the spherical shell radius", () => {
    const positions = generateStarPositions(2000);
    const min = STAR_SHELL_MIN;
    const max = STAR_SHELL_MIN + STAR_SHELL_RANGE;
    // Float32 rounding can nudge values a hair past the bound.
    const eps = 1e-3;

    for (let i = 0; i < positions.length; i += 3) {
      const r = Math.hypot(positions[i], positions[i + 1], positions[i + 2]);
      expect(r).toBeGreaterThanOrEqual(min - eps);
      expect(r).toBeLessThanOrEqual(max + eps);
    }
  });

  it("is deterministic for a fixed RNG sequence", () => {
    const seq = [0.1, 0.2, 0.3, 0.9, 0.8, 0.7];
    const a = generateStarPositions(2, seededRng(seq));
    const b = generateStarPositions(2, seededRng(seq));
    expect(Array.from(a)).toEqual(Array.from(b));
  });

  it("maps a known RNG sample to the expected point", () => {
    // rng yields r-frac=0, theta-frac=0, phi-frac=0.5 in turn.
    // => r = STAR_SHELL_MIN, theta = 0, phi = acos(0) = PI/2
    // => x = r*sin(phi)*cos(theta) = r, y = 0, z = r*cos(phi) = 0
    const positions = generateStarPositions(1, seededRng([0, 0, 0.5]));
    expect(positions[0]).toBeCloseTo(STAR_SHELL_MIN, 4);
    expect(positions[1]).toBeCloseTo(0, 4);
    expect(positions[2]).toBeCloseTo(0, 4);
  });

  it("rejects negative or non-integer counts", () => {
    expect(() => generateStarPositions(-1)).toThrow(RangeError);
    expect(() => generateStarPositions(1.5)).toThrow(RangeError);
    expect(() => generateStarPositions(NaN)).toThrow(RangeError);
  });
});
