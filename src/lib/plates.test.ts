import { describe, it, expect } from "vitest";
import {
  parsePlateBoundaries,
  plateBoundaryClass,
  type PlateBoundaryStep,
} from "./plates";

const feature = (name: string, coordinates: [number, number][]) => ({
  type: "Feature",
  properties: { name },
  geometry: { type: "LineString", coordinates },
});

/** What a feature carrying no PB2002 step attributes parses to. */
const UNMARKED_STEP: PlateBoundaryStep = {
  plateA: null,
  plateB: null,
  boundaryType: null,
  sourceCitation: null,
};

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

  it("preserves gaps around invalid coordinates instead of inventing segments", () => {
    const boundaries = parsePlateBoundaries({
      features: [
        feature("AF-AN", [
          [0, 0],
          [1, 1],
          [200, 2],
          [3, 3],
          [4, 4],
        ]),
      ],
    });

    expect(boundaries).toEqual([
      {
        name: "AF-AN",
        points: [
          [0, 0],
          [1, 1],
        ],
        step: UNMARKED_STEP,
      },
      {
        name: "AF-AN",
        points: [
          [3, 3],
          [4, 4],
        ],
        step: UNMARKED_STEP,
      },
    ]);
  });

  it("does not emit isolated valid vertices beside malformed coordinates", () => {
    const boundaries = parsePlateBoundaries({
      features: [
        feature("PA-NA", [
          [0, 0],
          [999, 1],
          [2, 2],
          [999, 3],
          [4, 4],
          [5, 5],
        ]),
      ],
    });

    expect(boundaries).toEqual([
      {
        name: "PA-NA",
        points: [
          [4, 4],
          [5, 5],
        ],
        step: UNMARKED_STEP,
      },
    ]);
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

describe("PB2002 step attributes", () => {
  const step = (properties: Record<string, unknown>) =>
    parsePlateBoundaries({
      features: [
        {
          properties,
          geometry: {
            type: "LineString",
            coordinates: [
              [0, 0],
              [1, 1],
            ],
          },
        },
      ],
    })[0];

  it("retains the source's plate codes, type, and per-step citation", () => {
    expect(
      step({
        name: "SU/AU",
        plateA: "SU",
        plateB: "AU",
        type: "subduction",
        source: "Mueller et al. [1987]",
      }).step
    ).toEqual({
      plateA: "SU",
      plateB: "AU",
      boundaryType: "subduction",
      sourceCitation: "Mueller et al. [1987]",
    });
  });

  it("reads blank source fields as unavailable, not as empty labels", () => {
    // PB2002 leaves `Type` blank on every step it does not mark as subduction,
    // and a few steps carry no digitization credit.
    expect(
      step({ name: "AF-AN", plateA: "AF", plateB: "AN", type: "", source: "" })
        .step
    ).toEqual({
      plateA: "AF",
      plateB: "AN",
      boundaryType: null,
      sourceCitation: null,
    });
  });

  it("keeps step attributes on every run split out of one feature", () => {
    const boundaries = parsePlateBoundaries({
      features: [
        {
          properties: {
            name: "PA/OK",
            plateA: "PA",
            plateB: "OK",
            type: "subduction",
          },
          geometry: {
            type: "LineString",
            coordinates: [
              [0, 0],
              [1, 1],
              [999, 2],
              [3, 3],
              [4, 4],
            ],
          },
        },
      ],
    });

    expect(boundaries).toHaveLength(2);
    for (const boundary of boundaries) {
      expect(boundary.step?.boundaryType).toBe("subduction");
      expect(boundary.step?.plateA).toBe("PA");
    }
  });
});

describe("plateBoundaryClass", () => {
  it("reports the source's own subduction marking", () => {
    expect(
      plateBoundaryClass({
        name: "SU/AU",
        points: [],
        step: { ...UNMARKED_STEP, boundaryType: "subduction" },
      })
    ).toBe("subduction");
  });

  it("separates an unmarked step from an absent one", () => {
    // A blank `Type` means the source did not mark the step; it is not a
    // measurement that the step is something other than a subduction zone.
    expect(
      plateBoundaryClass({ name: "AF-AN", points: [], step: UNMARKED_STEP })
    ).toBe("not-marked");
    // A boundary built without step attributes (or parsed from a file
    // predating them) must not read as "not-marked".
    expect(plateBoundaryClass({ name: "AF-AN", points: [] })).toBe(
      "unavailable"
    );
  });
});
