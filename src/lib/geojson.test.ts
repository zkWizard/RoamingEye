import { describe, it, expect } from "vitest";
import fc from "fast-check";
import {
  geometryBounds,
  geometryContains,
  geometryGridPoints,
  geometrySamplingPlan,
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
            [1, 1],
            [0, 0],
          ],
        ],
        [
          [
            [2, 2],
            [3, 2],
            [3, 3],
            [2, 2],
          ],
          [
            [2.4, 2.4],
            [2.6, 2.4],
            [2.6, 2.6],
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

  it("withholds malformed area rings from rendering and sampling", () => {
    const impossibleLatitude = {
      type: "Polygon",
      coordinates: [
        [
          [0, 0],
          [1, 0],
          [1, 91],
          [0, 0],
        ],
      ],
    };
    const openRing = {
      type: "Polygon",
      coordinates: [
        [
          [0, 0],
          [1, 0],
          [1, 1],
          [0, 1],
        ],
      ],
    };

    for (const geometry of [impossibleLatitude, openRing]) {
      expect(isAreaGeometry(geometry)).toBe(false);
      expect(geometryBounds(geometry)).toBeNull();
      expect(geometryContains(geometry, 0.5, 0.5)).toBe(false);
      expect(geometrySamplingPlan(geometry, 8)).toBeNull();
      expect(geometryToRings(geometry)).toEqual([]);
    }
  });

  it("does not silently keep only valid pieces of a malformed multipolygon", () => {
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
            [2, 2],
            [3, 2],
            [Number.NaN, 3],
            [2, 2],
          ],
        ],
      ],
    };

    expect(isAreaGeometry(geometry)).toBe(false);
    expect(geometryBounds(geometry)).toBeNull();
    expect(geometrySamplingPlan(geometry, 8)).toBeNull();
    expect(geometryToRings(geometry)).toEqual([]);
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

  it("classifies exterior edges consistently and excludes hole edges", () => {
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
    expect(geometryContains(geometry, 0, 5)).toBe(true);
    expect(geometryContains(geometry, 5, 10)).toBe(true);
    expect(geometryContains(geometry, 10, 5)).toBe(true);
    expect(geometryContains(geometry, 5, 0)).toBe(true);
    expect(geometryContains(geometry, 0, 0)).toBe(true);
    expect(geometryContains(geometry, 4, 5)).toBe(false);
    expect(geometryContains(geometry, 5, 6)).toBe(false);
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

  it.each([
    ["null coordinates", null],
    ["a non-array coordinate object", { lon: 0, lat: 0 }],
    [
      "an unclosed ring",
      [
        [
          [0, 0],
          [1, 0],
          [1, 1],
          [0, 1],
        ],
      ],
    ],
    [
      "a non-finite coordinate",
      [
        [
          [0, 0],
          [1, 0],
          [1, Number.NaN],
          [0, 0],
        ],
      ],
    ],
    [
      "an out-of-range latitude",
      [
        [
          [0, 0],
          [1, 0],
          [1, 91],
          [0, 0],
        ],
      ],
    ],
  ])("withholds malformed Polygon area sampling for %s", (_, coordinates) => {
    const geometry = { type: "Polygon", coordinates };
    expect(isAreaGeometry(geometry)).toBe(false);
    expect(geometryBounds(geometry)).toBeNull();
    expect(geometryContains(geometry, 0.5, 0.5)).toBe(false);
    expect(geometryGridPoints(geometry, 4)).toEqual([]);
    expect(geometrySamplingPlan(geometry, 4)).toBeNull();
  });

  it("rejects a MultiPolygon atomically when any polygon is malformed", () => {
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
        null,
      ],
    };
    expect(isAreaGeometry(geometry)).toBe(false);
    expect(geometryBounds(geometry)).toBeNull();
    expect(geometrySamplingPlan(geometry, 4)).toBeNull();
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

  it("contains antimeridian exterior edges in either longitude frame", () => {
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
    expect(geometryContains(geometry, 0, 179)).toBe(true);
    expect(geometryContains(geometry, 0, -179)).toBe(true);
    expect(geometryContains(geometry, -1, 180)).toBe(true);
    expect(geometryContains(geometry, 1, -180)).toBe(true);
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

  it("refines sparse multipolygon masks without leaving the short-arc frame", () => {
    // Two small islands at opposite ends of their joint bounds. An 8 x 8
    // cell-centre grid misses both, while the bounded 64 x 64 refinement
    // finds an interior cell in each without sampling the empty middle.
    const geometry = {
      type: "MultiPolygon",
      coordinates: [
        [
          [
            [0, 0],
            [0.1, 0],
            [0.1, 0.1],
            [0, 0.1],
            [0, 0],
          ],
        ],
        [
          [
            [9.9, 9.9],
            [10, 9.9],
            [10, 10],
            [9.9, 10],
            [9.9, 9.9],
          ],
        ],
      ],
    };
    expect(geometryGridPoints(geometry, 8)).toEqual([]);
    const plan = geometrySamplingPlan(geometry, 8);
    expect(plan).not.toBeNull();
    expect(plan).toMatchObject({
      gridSize: 64,
      candidatePointCount: 4096,
      interiorPointCount: 2,
      pointLimitApplied: false,
    });
    expect(plan!.points).toHaveLength(2);
    for (const point of plan!.points) {
      expect(geometryContains(geometry, point.lat, point.lon)).toBe(true);
    }
  });

  it("caps dense plans deterministically without taking only the first rows", () => {
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
      ],
    };
    const options = { minPoints: 1, maxPoints: 4 };
    const first = geometrySamplingPlan(geometry, 8, options);
    const second = geometrySamplingPlan(geometry, 8, options);
    expect(first).toMatchObject({
      gridSize: 8,
      candidatePointCount: 64,
      interiorPointCount: 64,
      pointLimitApplied: true,
    });
    expect(first!.points).toHaveLength(4);
    expect(first!.points).toEqual(second!.points);
    // A rank-spaced cap covers the grid's latitude range; a first-N cap would
    // retain only the southern row.
    expect(
      new Set(first!.points.map((point) => point.lat)).size
    ).toBeGreaterThan(1);
  });

  it("prepares complex boundaries a constant number of times per grid pass", () => {
    const coordinates = [
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
    ];
    let coordinateReads = 0;
    const geometry = {
      type: "Polygon",
      get coordinates() {
        coordinateReads++;
        return coordinates;
      },
    };

    // Bounds, malformed-geometry validation, and ring preparation may each
    // read the geometry a constant number of times, but the per-cell
    // containment loop (up to 4,096 cells) must not re-read it.
    expect(geometryGridPoints(geometry, 64)).toHaveLength(3_952);
    expect(coordinateReads).toBeLessThanOrEqual(4);
  });

  it("retains represented multipolygon components when applying the point cap", () => {
    const geometry = {
      type: "MultiPolygon",
      coordinates: [
        [
          [
            [0, 0],
            [8, 0],
            [8, 8],
            [0, 8],
            [0, 0],
          ],
        ],
        [
          [
            [9, 7],
            [10, 7],
            [10, 8],
            [9, 8],
            [9, 7],
          ],
        ],
      ],
    };
    const plan = geometrySamplingPlan(geometry, 8, {
      minPoints: 1,
      maxPoints: 4,
    });

    expect(plan).toMatchObject({
      gridSize: 8,
      pointLimitApplied: true,
    });
    expect(plan!.points).toHaveLength(4);
    expect(plan!.points.filter(({ lon }) => lon < 8)).toHaveLength(3);
    expect(plan!.points.filter(({ lon }) => lon > 9)).toHaveLength(1);
    expect(plan!.points).toEqual(
      [...plan!.points].sort((a, b) => a.lat - b.lat || a.lon - b.lon)
    );
  });

  it("refines until a small disconnected component is represented", () => {
    const geometry = {
      type: "MultiPolygon",
      coordinates: [
        [
          [
            [0, 0],
            [8, 0],
            [8, 8],
            [0, 8],
            [0, 0],
          ],
        ],
        [
          [
            [9.8, 9.8],
            [10, 9.8],
            [10, 10],
            [9.8, 10],
            [9.8, 9.8],
          ],
        ],
      ],
    };

    const plan = geometrySamplingPlan(geometry, 8, { minPoints: 1 });

    expect(plan).toMatchObject({
      gridSize: 32,
      polygonComponentCount: 2,
      sampledComponentCount: 2,
    });
    expect(plan!.points.some((point) => point.lon > 9.8)).toBe(true);
  });

  it("does not let tuning options relax the hard sampling ceilings", () => {
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
      ],
    };
    const plan = geometrySamplingPlan(geometry, 1, {
      minPoints: 1_000_000,
      maxGridSize: 1_000_000,
      maxPoints: 1_000_000,
    });
    expect(plan).not.toBeNull();
    expect(plan!.gridSize).toBeLessThanOrEqual(64);
    expect(plan!.candidatePointCount).toBeLessThanOrEqual(64 * 64);
    expect(plan!.points).toHaveLength(784);
    expect(plan!.pointLimitApplied).toBe(true);
  });

  it("keeps antimeridian plan points in the continuous bounds frame", () => {
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
    const plan = geometrySamplingPlan(geometry, 4, { minPoints: 1 });
    expect(plan).toMatchObject({ gridSize: 4, interiorPointCount: 16 });
    expect([...new Set(plan!.points.map((point) => point.lon))]).toEqual([
      179.25, 179.75, 180.25, 180.75,
    ]);
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

  it("labels an in-boundary fallback as a point when a thin boundary misses the bounded grid", () => {
    const sparseMultipolygon = {
      type: "MultiPolygon",
      coordinates: [
        [
          [
            [0, 0],
            [0.1, 0],
            [0.1, 0.1],
            [0, 0.1],
            [0, 0],
          ],
        ],
        [
          [
            [3.9, 3.9],
            [4, 3.9],
            [4, 4],
            [3.9, 4],
            [3.9, 3.9],
          ],
        ],
      ],
    };
    expect(geometryGridPoints(sparseMultipolygon, 4)).toEqual([]);
    expect(
      geometrySamplingPlan(sparseMultipolygon, 4, { lat: 0.05, lon: 0.05 })
    ).toEqual({
      points: [{ lat: 0.05, lon: 0.05 }],
      strategy: "boundary-point",
    });
  });

  it("does not substitute an out-of-boundary search coordinate", () => {
    const sparseMultipolygon = {
      type: "MultiPolygon",
      coordinates: [
        [
          [
            [0, 0],
            [0.1, 0],
            [0.1, 0.1],
            [0, 0.1],
            [0, 0],
          ],
        ],
        [
          [
            [3.9, 3.9],
            [4, 3.9],
            [4, 4],
            [3.9, 4],
            [3.9, 3.9],
          ],
        ],
      ],
    };
    expect(
      geometrySamplingPlan(sparseMultipolygon, 4, { lat: 1, lon: 2 })
    ).toBeNull();
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
