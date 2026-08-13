import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { PlateBoundary, PlateBoundaryStep } from "./plates";
import { parsePlateBoundaries } from "./plates";
import {
  BIRD_2003_PLATE_BOUNDARY_SOURCE,
  PLATE_BOUNDARY_CONTEXT_UNITS,
  plateBoundariesInSearchExtent,
  subductionMarkingText,
} from "./plateBoundaryContext";

const boundary = (overrides: Partial<PlateBoundary> = {}): PlateBoundary => ({
  name: "PA-NA",
  points: [
    [-125, 40],
    [-124, 41],
  ],
  ...overrides,
});

/**
 * A parsed PB2002 step. `boundaryType` defaults to null, which is the source
 * leaving its `Type` field blank — the ordinary case, not an error.
 */
const step = (
  overrides: Partial<PlateBoundaryStep> = {}
): PlateBoundaryStep => ({
  plateA: "PA",
  plateB: "NA",
  boundaryType: null,
  sourceCitation: "Mueller et al. [1987]",
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
      { name: "PA-NA", matchedSegmentCount: 1, sourceClass: "unavailable" },
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
      {
        name: "Crosses date line",
        matchedSegmentCount: 1,
        sourceClass: "unavailable",
      },
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

  it("passes the source's subduction marking through without reclassifying blanks", () => {
    const context = plateBoundariesInSearchExtent(
      [
        boundary({
          name: "NZ-SA",
          step: step({ boundaryType: "subduction" }),
        }),
        boundary({ name: "PA-NA", step: step() }),
      ],
      [39, 42, -126, -123]
    );

    expect(
      context.matchingBoundaries.map(({ name, sourceClass }) => [
        name,
        sourceClass,
      ])
    ).toEqual([
      ["NZ-SA", "subduction"],
      ["PA-NA", "not-marked"],
    ]);
    expect(context.coverage.matchedSubductionBoundaryCount).toBe(1);
  });

  it("reports every matched boundary as unavailable when the file carried no step attributes", () => {
    const context = plateBoundariesInSearchExtent(
      [boundary()],
      [39, 42, -126, -123]
    );

    expect(context.coverage.matchedSubductionBoundaryCount).toBe(0);
    expect(context.matchingBoundaries[0].sourceClass).toBe("unavailable");
  });
});

describe("subductionMarkingText", () => {
  const matched = (
    ...types: (string | null)[]
  ): ReturnType<typeof plateBoundariesInSearchExtent> =>
    plateBoundariesInSearchExtent(
      types.map((boundaryType, index) =>
        boundary({ name: `X${index}`, step: step({ boundaryType }) })
      ),
      [39, 42, -126, -123]
    );

  it("names the marked count and denies the non-subduction reading", () => {
    const text = subductionMarkingText(matched("subduction", null, null));

    expect(text).toContain("subduction marking to 1 of 3 matched boundaries");
    // The whole point of the line: a blank is an absent marking, not a
    // measurement that the boundary is something else.
    expect(text).toContain(
      "records no assignment rather than a non-subduction boundary"
    );
  });

  it("still reports the caveat when the source marked none of them", () => {
    expect(subductionMarkingText(matched(null, null))).toContain(
      "subduction marking to 0 of 2 matched boundaries"
    );
  });

  it("agrees in singular with one matched boundary", () => {
    expect(subductionMarkingText(matched("subduction"))).toContain(
      "1 of 1 matched boundary"
    );
  });

  it("stays silent when nothing matched or no step attributes were supplied", () => {
    const noMatch = plateBoundariesInSearchExtent(
      [boundary({ step: step() })],
      [0, 1, 0, 1]
    );

    expect(noMatch.coverage.matchedBoundaryCount).toBe(0);
    expect(subductionMarkingText(noMatch)).toBeNull();
    expect(
      subductionMarkingText(
        plateBoundariesInSearchExtent([boundary()], [39, 42, -126, -123])
      )
    ).toBeNull();
    expect(
      subductionMarkingText(plateBoundariesInSearchExtent([boundary()], null))
    ).toBeNull();
  });

  it("counts the configured Bird overlay's own subduction markings", () => {
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
    // A whole-globe extent matches everything, so this asserts the shipped file
    // really does carry the marking the panel now reports.
    const context = plateBoundariesInSearchExtent(
      parsePlateBoundaries(data),
      [-90, 90, -180, 180]
    );

    expect(context.coverage.matchedSubductionBoundaryCount).toBeGreaterThan(0);
    expect(subductionMarkingText(context)).toContain(
      "subduction marking to " +
        `${context.coverage.matchedSubductionBoundaryCount} of ` +
        `${context.coverage.matchedBoundaryCount} matched boundaries`
    );
  });
});
