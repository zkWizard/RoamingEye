import { describe, expect, it } from "vitest";
import { latLngToVector3 } from "./geo";
import type { PlateBoundary } from "./plates";
import {
  MAX_PLATE_RENDER_SEGMENT_DEGREES,
  plateBoundaryRenderGeometry,
  plateBoundaryRenderPositions,
} from "./plateBoundaryRendering";

const boundary = (points: PlateBoundary["points"]): PlateBoundary => ({
  name: "PA-NA",
  points,
});

describe("plateBoundaryRenderPositions", () => {
  it("subdivides source edges along the globe surface", () => {
    const radius = 1.003;
    const positions = plateBoundaryRenderPositions(
      [
        boundary([
          [0, 0],
          [3, 0],
        ]),
      ],
      radius
    );

    expect(positions).toHaveLength(3 * 6);
    for (let index = 0; index < positions.length; index += 3) {
      expect(
        Math.hypot(positions[index], positions[index + 1], positions[index + 2])
      ).toBeCloseTo(radius, 6);
    }
  });

  it("takes the short great-circle path across the antimeridian", () => {
    const positions = plateBoundaryRenderPositions(
      [
        boundary([
          [179, 0],
          [-179, 0],
        ]),
      ],
      1,
      MAX_PLATE_RENDER_SEGMENT_DEGREES
    );

    expect(positions).toHaveLength(2 * 6);
    expect(Math.min(...positions.filter((_, index) => index % 3 === 0))).toBe(
      -1
    );
  });

  it("keeps source endpoints and returns finite antipodal positions", () => {
    const positions = plateBoundaryRenderPositions(
      [
        boundary([
          [0, 0],
          [180, 0],
        ]),
      ],
      2,
      45
    );

    expect(positions.every(Number.isFinite)).toBe(true);
    expect(positions.slice(0, 3)).toEqual(latLngToVector3(0, 0, 2).toArray());
    expect(positions.slice(-3)).toEqual(latLngToVector3(0, 180, 2).toArray());
  });

  it("withholds rendering for invalid render parameters", () => {
    const boundaries = [
      boundary([
        [0, 0],
        [1, 0],
      ]),
    ];
    expect(plateBoundaryRenderPositions(boundaries, 0)).toEqual([]);
    expect(plateBoundaryRenderPositions(boundaries, 1, 0)).toEqual([]);
  });
});

describe("plateBoundaryRenderGeometry", () => {
  it("records the owning boundary of every rendered segment", () => {
    const boundaries: PlateBoundary[] = [
      {
        name: "AF-AN",
        points: [
          [0, 0],
          [2, 0],
        ],
      },
      {
        name: "PA-NA",
        points: [
          [100, 0],
          [101, 0],
        ],
      },
    ];
    const { positions, segmentBoundaries } = plateBoundaryRenderGeometry(
      boundaries,
      1.003
    );

    // One ownership entry per rendered segment (six position values each).
    expect(segmentBoundaries).toHaveLength(positions.length / 6);
    expect(segmentBoundaries).toEqual([0, 0, 1]);
  });

  it("keeps ownership aligned when a source edge is dropped", () => {
    // A non-finite vertex contributes no segments; the following boundary's
    // ownership must not shift onto the dropped edge's would-be segments.
    const boundaries: PlateBoundary[] = [
      {
        name: "AF-AN",
        points: [
          [Number.NaN, 0],
          [1, 0],
        ],
      },
      {
        name: "PA-NA",
        points: [
          [100, 0],
          [101, 0],
        ],
      },
    ];
    const { positions, segmentBoundaries } = plateBoundaryRenderGeometry(
      boundaries,
      1.003
    );

    expect(segmentBoundaries).toHaveLength(positions.length / 6);
    expect(segmentBoundaries).toEqual([1]);
  });

  it("agrees with plateBoundaryRenderPositions", () => {
    const boundaries: PlateBoundary[] = [
      {
        name: "AF-AN",
        points: [
          [0, 0],
          [3, 0],
        ],
      },
    ];
    expect(plateBoundaryRenderGeometry(boundaries, 1.003).positions).toEqual(
      plateBoundaryRenderPositions(boundaries, 1.003)
    );
  });

  it("withholds both linework and ownership for invalid parameters", () => {
    const boundaries: PlateBoundary[] = [
      {
        name: "AF-AN",
        points: [
          [0, 0],
          [1, 0],
        ],
      },
    ];
    expect(plateBoundaryRenderGeometry(boundaries, 0)).toEqual({
      positions: [],
      segmentBoundaries: [],
    });
  });
});
