import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { latLngToVector3 } from "./geo";
import {
  plateBoundaryDelimiterClause,
  plateBoundaryHoverLabel,
  plateBoundaryPairLabel,
  plateBoundarySegmentHoverLabel,
  UNLABELED_PLATE_BOUNDARY_TEXT,
} from "./plateBoundaryHover";
import { plateBoundaryRenderGeometry } from "./plateBoundaryRendering";
import type { PlateBoundary } from "./plates";

const boundary = (
  name: string,
  points: PlateBoundary["points"]
): PlateBoundary => ({ name, points });

describe("plateBoundaryHoverLabel", () => {
  it("names both plates of a recognized PB2002 pair", () => {
    expect(plateBoundaryHoverLabel(boundary("AF-AN", []))).toBe(
      "Africa–Antarctica plate boundary · PB2002 AF-AN"
    );
  });

  it("keeps the source label's code order and delimiter", () => {
    // Order and delimiter record the digitization's boundary-step orientation,
    // so they are reported as supplied rather than normalized. The verbatim
    // label is unchanged by the descent clause that now follows it.
    expect(plateBoundaryHoverLabel(boundary("AN\\AF", []))).toContain(
      "Antarctica–Africa plate boundary · PB2002 AN\\AF"
    );
  });

  it("decodes the delimiter into the descent it records", () => {
    // "\" means the left-hand plate descends, so the reading is not the code
    // order: a reader who assumes the first-named plate goes down gets this
    // one right and the "/" case below wrong.
    expect(plateBoundaryHoverLabel(boundary("AN\\AF", []))).toBe(
      "Antarctica–Africa plate boundary · PB2002 AN\\AF · delimiter: Antarctica subducts beneath Africa"
    );
    expect(plateBoundaryHoverLabel(boundary("AM/PS", []))).toBe(
      "Amur–Philippine Sea plate boundary · PB2002 AM/PS · delimiter: Philippine Sea subducts beneath Amur"
    );
  });

  it("says nothing about descent for a label recording no subduction", () => {
    // PB2002 marks subduction steps only, so "-" is no assignment rather than
    // a statement that the boundary does not subduct. 176 of the 241 bundled
    // features take this path.
    expect(plateBoundaryHoverLabel(boundary("AF-AN", []))).not.toContain(
      "delimiter"
    );
    expect(plateBoundaryHoverLabel(boundary("AFAN", []))).toBe(
      UNLABELED_PLATE_BOUNDARY_TEXT
    );
  });

  it("surfaces a code outside the PB2002 vocabulary instead of dropping it", () => {
    expect(plateBoundaryHoverLabel(boundary("ZZ-AN", []))).toBe(
      "ZZ (code not in PB2002 vocabulary)–Antarctica plate boundary · PB2002 ZZ-AN"
    );
  });

  it("reports an undecodable label as unlabeled rather than guessing", () => {
    for (const name of ["", "AF", "AFAN", "AF-AN-PA"]) {
      expect(plateBoundaryHoverLabel(boundary(name, []))).toBe(
        UNLABELED_PLATE_BOUNDARY_TEXT
      );
    }
  });

  it("never asserts a boundary type, motion, or hazard", () => {
    // "NZ-SA" records no subduction, so nothing the source marked is dropped
    // by forbidding "subduct" here: the descent clause is a passthrough of a
    // marking PB2002 wrote, and only appears for labels that carry one.
    const label = plateBoundaryHoverLabel(boundary("NZ-SA", []));
    for (const forbidden of [
      "convergent",
      "divergent",
      "spreading",
      "transform",
      "subduct",
      "hazard",
      "risk",
    ]) {
      expect(label.toLowerCase()).not.toContain(forbidden);
    }
  });
});

describe("plateBoundaryPairLabel", () => {
  it("names both plates from a label alone, matching the hover readout", () => {
    // The place panel matches boundaries by name only, so the label-only path
    // must stay identical to what the globe tooltip shows for that boundary.
    expect(plateBoundaryPairLabel("AF-AN")).toBe(
      plateBoundaryHoverLabel(boundary("AF-AN", []))
    );
    expect(plateBoundaryPairLabel("AF-AN")).toBe(
      "Africa–Antarctica plate boundary · PB2002 AF-AN"
    );
  });

  it("preserves the source delimiter that encodes subduction polarity", () => {
    expect(plateBoundaryPairLabel("NZ\\SA")).toContain("PB2002 NZ\\SA");
  });

  it("reports a source-unlabeled feature as unlabeled rather than guessing", () => {
    // null is the extent matcher's own "the supplied feature carried no label".
    expect(plateBoundaryPairLabel(null)).toBe(UNLABELED_PLATE_BOUNDARY_TEXT);
    expect(plateBoundaryPairLabel("")).toBe(UNLABELED_PLATE_BOUNDARY_TEXT);
  });
});

describe("plateBoundarySegmentHoverLabel", () => {
  const boundaries = [
    boundary("AF-AN", [
      [0, 0],
      [3, 0],
    ]),
    boundary("PA-NA", [
      [100, 0],
      [102, 0],
    ]),
  ];
  const { segmentBoundaries } = plateBoundaryRenderGeometry(boundaries, 1.003);

  it("resolves every rendered segment to its own boundary", () => {
    // Three 1° segments from the first boundary, then two from the second.
    expect(segmentBoundaries).toEqual([0, 0, 0, 1, 1]);
    expect(
      plateBoundarySegmentHoverLabel(boundaries, segmentBoundaries, 2)
    ).toContain("Africa–Antarctica");
    expect(
      plateBoundarySegmentHoverLabel(boundaries, segmentBoundaries, 3)
    ).toContain("Pacific–North America");
  });

  it("returns nothing for an index this linework did not produce", () => {
    for (const index of [-1, 5, 1.5, Number.NaN]) {
      expect(
        plateBoundarySegmentHoverLabel(boundaries, segmentBoundaries, index)
      ).toBeUndefined();
    }
  });

  it("returns nothing when ownership points outside the supplied boundaries", () => {
    expect(plateBoundarySegmentHoverLabel(boundaries, [7], 0)).toBeUndefined();
  });
});

describe("hover integration with the rendered LineSegments", () => {
  // Guards the segment-index convention the HoverInspector relies on: three.js
  // reports a LineSegments hit by its FIRST vertex index, so the inspector
  // halves it to recover the segment. If that ever changed, hovering would
  // silently name the wrong plate pair.
  it("names the boundary actually under the ray", () => {
    const radius = 1.003;
    const boundaries = [
      boundary("AF-AN", [
        [0, 0],
        [3, 0],
      ]),
      boundary("PA-NA", [
        [100, 0],
        [102, 0],
      ]),
    ];
    const { positions, segmentBoundaries } = plateBoundaryRenderGeometry(
      boundaries,
      radius
    );
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(positions, 3)
    );
    const lines = new THREE.LineSegments(
      geometry,
      new THREE.LineBasicMaterial()
    );

    const raycaster = new THREE.Raycaster();
    raycaster.params.Line.threshold = 0.006;

    const expectations: Array<[number, number, string]> = [
      [0, 1.5, "Africa–Antarctica"],
      [0, 101, "Pacific–North America"],
    ];
    for (const [lat, lon, expected] of expectations) {
      const target = latLngToVector3(lat, lon, radius);
      const origin = target.clone().multiplyScalar(3);
      raycaster.set(origin, target.clone().negate().normalize());

      const hit = raycaster.intersectObject(lines, false)[0];
      expect(hit?.index).toBeDefined();
      expect(
        plateBoundarySegmentHoverLabel(
          boundaries,
          segmentBoundaries,
          (hit.index as number) / 2
        )
      ).toContain(expected);
    }
  });
});

describe("plateBoundaryDelimiterClause", () => {
  it("reads a subducting label's delimiter back", () => {
    expect(plateBoundaryDelimiterClause("AM/PS")).toBe(
      " · delimiter: Philippine Sea subducts beneath Amur"
    );
    expect(plateBoundaryDelimiterClause("AN\\AF")).toBe(
      " · delimiter: Antarctica subducts beneath Africa"
    );
  });

  it("stays empty where the source records no subduction", () => {
    // PB2002 marks subduction steps only, so a "-" step has no assignment to
    // report — not a measured absence of subduction.
    expect(plateBoundaryDelimiterClause("AF-AN")).toBe("");
    expect(plateBoundaryDelimiterClause(null)).toBe("");
    expect(plateBoundaryDelimiterClause("not a pair")).toBe("");
  });

  it("is the clause the hover label appends, so both surfaces read alike", () => {
    // The place panel's matched-boundary list appends this same string, so the
    // two surfaces cannot drift into two wordings of one convention.
    const name = "AM/PS";
    expect(plateBoundaryHoverLabel(boundary(name, []))).toBe(
      plateBoundaryPairLabel(name) + plateBoundaryDelimiterClause(name)
    );
  });
});
