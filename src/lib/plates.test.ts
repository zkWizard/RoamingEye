import { describe, it, expect } from "vitest";
import { parsePlateBoundaries } from "./plates";

const feature = (name: string, coordinates: [number, number][]) => ({
  type: "Feature",
  properties: { name },
  geometry: { type: "LineString", coordinates },
});

describe("parsePlateBoundaries", () => {
  it("extracts name and points from LineString features", () => {
    const boundaries = parsePlateBoundaries({
      features: [
        feature("AF-AN", [
          [10, -40],
          [12, -41.5],
          [14, -43],
        ]),
      ],
    });
    expect(boundaries).toHaveLength(1);
    expect(boundaries[0].name).toBe("AF-AN");
    expect(boundaries[0].points).toEqual([
      [10, -40],
      [12, -41.5],
      [14, -43],
    ]);
  });

  it("returns [] for non-collection input", () => {
    expect(parsePlateBoundaries(null)).toEqual([]);
    expect(parsePlateBoundaries("nope")).toEqual([]);
    expect(parsePlateBoundaries({})).toEqual([]);
    expect(parsePlateBoundaries({ features: "not-an-array" })).toEqual([]);
  });

  it("drops malformed features and out-of-range coordinates", () => {
    const boundaries = parsePlateBoundaries({
      features: [
        { properties: { name: "no-geometry" }, geometry: null },
        feature("too-short", [[0, 0]]),
        feature("bad-coords", [
          [200, 0], // lon out of range — filtered, leaving 1 point
          [10, 95],
        ]),
        feature("OK-PA", [
          [-70, -33],
          [-71, -34],
        ]),
      ],
    });
    expect(boundaries).toHaveLength(1);
    expect(boundaries[0].name).toBe("OK-PA");
  });

  it("splits MultiLineString geometries into separate boundaries", () => {
    const boundaries = parsePlateBoundaries({
      features: [
        {
          properties: { name: "NA-PA" },
          geometry: {
            type: "MultiLineString",
            coordinates: [
              [
                [-125, 40],
                [-126, 42],
              ],
              [
                [-128, 45],
                [-129, 47],
              ],
            ],
          },
        },
      ],
    });
    expect(boundaries).toHaveLength(2);
    expect(boundaries.every((b) => b.name === "NA-PA")).toBe(true);
  });

  it("tolerates a missing name", () => {
    const boundaries = parsePlateBoundaries({
      features: [
        {
          geometry: {
            type: "LineString",
            coordinates: [
              [0, 0],
              [1, 1],
            ],
          },
        },
      ],
    });
    expect(boundaries[0].name).toBe("");
  });
});
