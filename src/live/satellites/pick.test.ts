import { describe, expect, it } from "vitest";
import { pickNearest } from "./pick";

describe("pickNearest", () => {
  it("returns the marker in the pointer's cell, not a far one", () => {
    const points = [
      { x: 10, y: 10 },
      { x: 400, y: 400 },
      { x: 16, y: 12 },
    ];
    expect(pickNearest(points, 14, 11)).toBe(2);
  });

  it("returns null when nothing is close", () => {
    expect(pickNearest([{ x: 0, y: 0 }], 200, 200)).toBeNull();
  });

  it("ignores a non-finite projection", () => {
    expect(
      pickNearest(
        [
          { x: Number.NaN, y: 0 },
          { x: 5, y: 5 },
        ],
        6,
        6
      )
    ).toBe(1);
  });
});
