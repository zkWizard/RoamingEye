import { describe, expect, it } from "vitest";
import {
  STAR_COUNT,
  STAR_RADIUS_MAX,
  STAR_RADIUS_MIN,
  starField,
} from "./stars";

describe("star field", () => {
  it("places six thousand stars on the shell", () => {
    const field = starField();
    expect(field.positions.length).toBe(STAR_COUNT * 3);
    expect(field.brightness.length).toBe(STAR_COUNT);
    for (let i = 0; i < STAR_COUNT; i++) {
      const x = field.positions[i * 3];
      const y = field.positions[i * 3 + 1];
      const z = field.positions[i * 3 + 2];
      const radius = Math.hypot(x, y, z);
      expect(radius).toBeGreaterThanOrEqual(STAR_RADIUS_MIN - 1e-6);
      expect(radius).toBeLessThanOrEqual(STAR_RADIUS_MAX + 1e-6);
      expect(field.brightness[i]).toBeGreaterThan(0);
      expect(field.brightness[i]).toBeLessThanOrEqual(1);
    }
  });

  it("repeats for the same seed", () => {
    const a = starField(32, 7);
    const b = starField(32, 7);
    const c = starField(32, 8);
    expect(Array.from(a.positions)).toEqual(Array.from(b.positions));
    expect(Array.from(a.positions)).not.toEqual(Array.from(c.positions));
  });
});
