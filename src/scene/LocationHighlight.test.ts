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

  it("uses a pin when no exact boundary is available", () => {
    const highlight = new LocationHighlight();
    highlight.show({ lat: 34, lon: -118, geometry: null });

    const target = highlight.object.children[0] as THREE.Group;
    expect(target.children).toHaveLength(1);
    expect(target.children[0]).toBeInstanceOf(THREE.Mesh);
  });
});
