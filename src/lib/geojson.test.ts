import { describe, it, expect } from "vitest";
import fc from "fast-check";
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

  it("bounds and contains a polygon over the antimeridian on the short arc", () => {
    const geometry = {
      type: "Polygon",
      coordinates: [
        [
          [179, -1],
          [-179, -1],
          [-179, 1],
          [179, 1],
          [179, -1],
        ],
      ],
    };
    expect(geometryBounds(geometry)).toEqual({
      south: -1,
      north: 1,
      west: 179,
      east: 181,
    });
    expect(geometryContains(geometry, 0, 179.5)).toBe(true);
    expect(geometryContains(geometry, 0, -179.5)).toBe(true);
    expect(geometryContains(geometry, 0, 0)).toBe(false);
  });

  it("keeps antimeridian grid points in the continuous short-arc frame", () => {
    const geometry = {
      type: "Polygon",
      coordinates: [
        [
          [179, -1],
          [-179, -1],
          [-179, 1],
          [179, 1],
          [179, -1],
        ],
      ],
    };
    const points = geometryGridPoints(geometry, 4);
    expect(points).toHaveLength(16);
    const lons = [...new Set(points.map((p) => p.lon))];
    expect(lons).toEqual([179.25, 179.75, 180.25, 180.75]);
    for (const point of points) {
      expect(geometryContains(geometry, point.lat, point.lon)).toBe(true);
    }
  });

  it("excludes holes that cross the antimeridian", () => {
    const geometry = {
      type: "Polygon",
      coordinates: [
        [
          [178, -2],
          [-178, -2],
          [-178, 2],
          [178, 2],
          [178, -2],
        ],
        [
          [179, -1],
          [-179, -1],
          [-179, 1],
          [179, 1],
          [179, -1],
        ],
      ],
    };
    expect(geometryContains(geometry, 0, 179.5)).toBe(false);
    expect(geometryContains(geometry, 1.5, -179.5)).toBe(true);
    expect(geometryGridPoints(geometry, 4)).toHaveLength(12);
  });

  it("handles multipolygon pieces on both sides of the antimeridian", () => {
    const geometry = {
      type: "MultiPolygon",
      coordinates: [
        [
          [
            [179, -1],
            [179.8, -1],
            [179.8, 1],
            [179, 1],
            [179, -1],
          ],
        ],
        [
          [
            [-179.8, -1],
            [-179, -1],
            [-179, 1],
            [-179.8, 1],
            [-179.8, -1],
          ],
        ],
      ],
    };
    expect(geometryBounds(geometry)).toEqual({
      south: -1,
      north: 1,
      west: 179,
      east: 181,
    });
    expect(geometryContains(geometry, 0, 179.4)).toBe(true);
    expect(geometryContains(geometry, 0, -179.4)).toBe(true);
    expect(geometryContains(geometry, 0, 180)).toBe(false);
  });

  it("properties: seam-crossing boxes use the short arc, not the long complement", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 17000, max: 17950 }),
        fc.integer({ min: 10, max: 900 }),
        (westHundredths, widthHundredths) => {
          const west = westHundredths / 100;
          const width = widthHundredths / 100;
          const east = west + width;
          fc.pre(east > 180 && east < 190);
          const wrappedEast = east - 360;
          const geometry = {
            type: "Polygon",
            coordinates: [
              [
                [west, -1],
                [wrappedEast, -1],
                [wrappedEast, 1],
                [west, 1],
                [west, -1],
              ],
            ],
          };
          const bounds = geometryBounds(geometry);
          expect(bounds).not.toBeNull();
          expect(bounds!.west).toBeCloseTo(west);
          expect(bounds!.east - bounds!.west).toBeCloseTo(width);
          expect(bounds!.east - bounds!.west).toBeLessThan(10);
          expect(geometryContains(geometry, 0, west + width / 2)).toBe(true);
        }
      )
    );
  });
});
