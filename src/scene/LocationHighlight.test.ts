import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { LocationHighlight } from "./LocationHighlight";

describe("LocationHighlight", () => {
  it("traces an administrative polygon without adding a point pin", () => {
    const highlight = new LocationHighlight();
    highlight.show({
      lat: 34,
      lon: -118,
      geometry: {
        type: "Polygon",
        coordinates: [
          [
            [-118.2, 33.9],
            [-117.9, 33.9],
            [-117.9, 34.1],
            [-118.2, 33.9],
          ],
        ],
      },
    });

    const target = highlight.object.children[0] as THREE.Group;
    expect(target.children).toHaveLength(2);
    expect(target.children[0]).toBeInstanceOf(THREE.LineSegments);
    expect(target.children[1]).toBeInstanceOf(THREE.Points);
  });

  it("traces a state-sized boundary without overflowing the call stack", () => {
    // Nominatim's Texas polygon runs to tens of thousands of vertices; spreading
    // its densified points into one push() call threw a RangeError, which also
    // stopped the search handler before the place panel opened.
    const vertices = 80_000;
    const ring: [number, number][] = [];
    for (let i = 0; i < vertices; i++) {
      const angle = (i / vertices) * 2 * Math.PI;
      ring.push([-99 + 5 * Math.cos(angle), 31 + 5 * Math.sin(angle)]);
    }
    ring.push(ring[0]);

    const highlight = new LocationHighlight();
    highlight.show({
      lat: 31,
      lon: -99,
      geometry: { type: "Polygon", coordinates: [ring] },
    });

    const target = highlight.object.children[0] as THREE.Group;
    const points = target.children[1] as THREE.Points;
    expect(points.geometry.getAttribute("position").count).toBe(vertices);
  });

  it("uses a pin when no exact boundary is available", () => {
    const highlight = new LocationHighlight();
    highlight.show({ lat: 34, lon: -118, geometry: null });

    const target = highlight.object.children[0] as THREE.Group;
    expect(target.children).toHaveLength(1);
    expect(target.children[0]).toBeInstanceOf(THREE.Mesh);
  });
});
