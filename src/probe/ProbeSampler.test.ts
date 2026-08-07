import { describe, expect, it } from "vitest";
import { globalPointBlockPixels } from "./ProbeSampler";

describe("globalPointBlockPixels", () => {
  it("wraps a point-probe neighborhood across the antimeridian", () => {
    const pixels = globalPointBlockPixels({ x: 0, y: 2 }, 8, 5);

    expect(pixels).toHaveLength(9);
    expect(new Set(pixels.map((pixel) => pixel.x))).toEqual(new Set([7, 0, 1]));
    expect(new Set(pixels.map((pixel) => pixel.y))).toEqual(new Set([1, 2, 3]));
  });

  it("wraps the eastern edge back to the western edge", () => {
    const pixels = globalPointBlockPixels({ x: 7, y: 2 }, 8, 5);

    expect(new Set(pixels.map((pixel) => pixel.x))).toEqual(new Set([6, 7, 0]));
  });

  it("clamps and deduplicates neighbors at the poles", () => {
    const north = globalPointBlockPixels({ x: 4, y: 0 }, 8, 5);
    const south = globalPointBlockPixels({ x: 4, y: 4 }, 8, 5);

    expect(north).toHaveLength(6);
    expect(new Set(north.map((pixel) => pixel.y))).toEqual(new Set([0, 1]));
    expect(south).toHaveLength(6);
    expect(new Set(south.map((pixel) => pixel.y))).toEqual(new Set([3, 4]));
  });
});
