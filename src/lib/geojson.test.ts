import { describe, it, expect } from "vitest";
import { geometryToRings } from "./geojson";

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
});
