import { describe, it, expect } from "vitest";
import {
  geometryBounds,
  geometryContains,
  geometryGridPoints,
  geometryToRings,
  isAreaGeometry,
} from "./geojson";

describe("geometryToRings", () => {
  it("returns the single ring of a Polygon", () => {
    const rings = geometryToRings({
      type: "Polygon",
      coordinates: [
        [
          [0, 0],
          [1, 0],
          [1, 1],
          [0, 0],
        ],
      ],
    });
    expect(rings).toHaveLength(1);
    expect(rings[0]).toHaveLength(4);
  });

  it("flattens every ring of a MultiPolygon", () => {
    const rings = geometryToRings({
      type: "MultiPolygon",
      coordinates: [
        [
          [
            [0, 0],
            [1, 0],
            [0, 0],
          ],
        ],
        [
          [
            [2, 2],
            [3, 2],
            [2, 2],
          ],
          [
            [2.4, 2.4],
            [2.6, 2.4],
            [2.4, 2.4],
          ], // a hole
        ],
      ],
    });
    expect(rings).toHaveLength(3);
  });

  it("handles a LineString", () => {
    const rings = geometryToRings({
      type: "LineString",
      coordinates: [
        [0, 0],
        [1, 1],
      ],
    });
    expect(rings).toHaveLength(1);
    expect(rings[0]).toHaveLength(2);
  });

  it("returns nothing for unsupported geometry", () => {
    expect(geometryToRings({ type: "Point", coordinates: [0, 0] })).toEqual([]);
  });

  it("masks a sampling grid to the exact polygon and excludes holes", () => {
    const geometry = {
      type: "Polygon",
      coordinates: [
        [
          [0, 0],
          [10, 0],
          [10, 10],
          [0, 10],
          [0, 0],
        ],
        [
          [4, 4],
          [6, 4],
          [6, 6],
          [4, 6],
          [4, 4],
        ],
      ],
    };
    expect(isAreaGeometry(geometry)).toBe(true);
    expect(geometryBounds(geometry)).toEqual({
      south: 0,
      north: 10,
      west: 0,
      east: 10,
    });
    expect(geometryContains(geometry, 5, 5)).toBe(false);
    expect(geometryContains(geometry, 2, 2)).toBe(true);
    expect(geometryGridPoints(geometry, 5)).toHaveLength(24);
  });

  it("recognizes multipolygons as sampleable areas", () => {
    const geometry = {
      type: "MultiPolygon",
      coordinates: [
        [
          [
            [0, 0],
            [1, 0],
            [1, 1],
            [0, 0],
          ],
        ],
        [
          [
            [3, 3],
            [4, 3],
            [4, 4],
            [3, 3],
          ],
        ],
      ],
    };
    expect(isAreaGeometry(geometry)).toBe(true);
    expect(geometryContains(geometry, 3.2, 3.2)).toBe(true);
    expect(geometryContains(geometry, 2, 2)).toBe(false);
  });
});
