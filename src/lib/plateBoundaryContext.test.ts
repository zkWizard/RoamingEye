import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { PlateBoundary } from "./plates";
import { parsePlateBoundaries } from "./plates";
import {
  BIRD_2003_PLATE_BOUNDARY_SOURCE,
  PLATE_BOUNDARY_CONTEXT_UNITS,
  plateBoundariesInSearchExtent,
} from "./plateBoundaryContext";

const boundary = (overrides: Partial<PlateBoundary> = {}): PlateBoundary => ({
  name: "PA-NA",
  points: [
    [-125, 40],
    [-124, 41],
  ],
  ...overrides,
});

describe("plateBoundariesInSearchExtent", () => {
  it("retains Bird provenance, static timing, native coordinate units, and segment coverage", () => {
    const context = plateBoundariesInSearchExtent(
      [
        boundary(),
        boundary({
          name: "AF-EU",
          points: [
            [0, 40],
            [1, 41],
          ],
        }),
      ],
      [39, 42, -126, -123]
    );

    expect(context).toMatchObject({
      kind: "bird-2003-plate-boundary-extent",
      isForecast: false,
      crossesAntimeridian: false,
      matchingBoundaries: [{ name: "PA-NA", matchedSegmentCount: 1 }],
      coverage: {
        status: "available",
        suppliedBoundaryCount: 2,
        usableBoundaryCount: 2,
        matchedBoundaryCount: 1,
        matchedSegmentCount: 1,
        boundsTested: true,
      },
      provenance: BIRD_2003_PLATE_BOUNDARY_SOURCE,
      units: PLATE_BOUNDARY_CONTEXT_UNITS,
    });
    expect(context.provenance.dataMonth).toBeNull();
    expect(context.limitations.join(" ")).toContain("hazard");
  });

  it("counts a segment that crosses the extent even when neither endpoint is inside", () => {
    const context = plateBoundariesInSearchExtent(
      [
        boundary({
          points: [
            [-2, 0],
            [2, 0],
          ],
        }),
      ],
      [-1, 1, -1, 1]
    );

    expect(context.matchingBoundaries).toEqual([
      { name: "PA-NA", matchedSegmentCount: 1 },
    ]);
  });

  it("uses a continuous longitude frame for antimeridian-spanning bounds", () => {
    const context = plateBoundariesInSearchExtent(
      [
        boundary({
          name: "Crosses date line",
          points: [
            [179, 10],
            [-179, 10],
          ],
        }),
        boundary({
          name: "Greenwich",
          points: [
            [-1, 10],
            [1, 10],
          ],
        }),
      ],
      [9, 11, 170, -170]
    );

    expect(context.crossesAntimeridian).toBe(true);
    expect(context.matchingBoundaries).toEqual([
      { name: "Crosses date line", matchedSegmentCount: 1 },
    ]);
  });

  it("keeps invalid bounds and unusable linework explicit without inventing coverage", () => {
    const invalidBounds = plateBoundariesInSearchExtent([boundary()], null);
    const unusableLinework = plateBoundariesInSearchExtent(
      [boundary({ points: [[0, 0]] })],
      [-1, 1, -1, 1]
    );

    expect(invalidBounds).toMatchObject({
      bounds: null,
      matchingBoundaries: [],
      coverage: { status: "invalid-bounds", boundsTested: false },
    });
    expect(unusableLinework).toMatchObject({
      matchingBoundaries: [],
      coverage: {
        status: "no-usable-boundaries",
        suppliedBoundaryCount: 1,
        usableBoundaryCount: 0,
        boundsTested: true,
      },
    });
  });

  it("works directly with the configured Bird overlay geometry", () => {
    const data = JSON.parse(
      readFileSync(
        join(
          __dirname,
          "..",
          "..",
          "public",
          "data",
          "plate-boundaries.geojson"
        ),
        "utf8"
      )
    );
    const boundaries = parsePlateBoundaries(data);
    const context = plateBoundariesInSearchExtent(
      boundaries,
      [-56, -52, -1, 1]
    );

    expect(boundaries.length).toBeGreaterThan(0);
    expect(context.coverage).toMatchObject({
      status: "available",
      suppliedBoundaryCount: boundaries.length,
      usableBoundaryCount: boundaries.length,
      boundsTested: true,
    });
    expect(
      context.matchingBoundaries.some(({ name }) => name === "AF-AN")
    ).toBe(true);
  });
});
