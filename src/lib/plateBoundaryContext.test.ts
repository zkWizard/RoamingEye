import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { PlateBoundary, PlateBoundaryStep } from "./plates";
import { parsePlateBoundaries } from "./plates";
import {
  BIRD_2003_PLATE_BOUNDARY_SOURCE,
  PLATE_BOUNDARY_CONTEXT_UNITS,
  digitizationCreditText,
  plateBoundariesInSearchExtent,
  subductionMarkingText,
  subductionPolarityText,
  suppliedRepeatText,
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
      {
        name: "PA-NA",
        matchedSegmentCount: 1,
        sourceClass: "unavailable",
        sourceCitation: null,
      },
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
        sourceCitation: null,
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

describe("digitizationCreditText", () => {
  const matched = (
    ...citations: (string | null)[]
  ): ReturnType<typeof plateBoundariesInSearchExtent> =>
    plateBoundariesInSearchExtent(
      citations.map((sourceCitation, index) =>
        boundary({ name: `X${index}`, step: step({ sourceCitation }) })
      ),
      [39, 42, -126, -123]
    );

  it("names the credit and denies the Bird-alone reading", () => {
    const text = digitizationCreditText(matched("Mueller et al. [1987]"));

    expect(text).toContain(
      'the matched linework here is credited to "Mueller et al. [1987]"'
    );
    // The whole point of the line: the compilation credit is not the survey.
    expect(text).toContain(
      "compiles separately sourced digitizations rather than one uniform survey"
    );
    // Half the steps are credited to Bird's own earlier digitizing, so the line
    // must never append a clause that contradicts the credit it just named.
    expect(
      digitizationCreditText(matched("by Peter Bird, 1999"))
    ).not.toContain("not Bird (2003) alone");
  });

  it("names both credits when a match spans two digitizations", () => {
    expect(
      digitizationCreditText(matched("Lonsdale [1988]", "Rangin et al. [1999]"))
    ).toContain('credited to "Lonsdale [1988]" and "Rangin et al. [1999]"');
  });

  it("counts the credits and names the most used when more than two", () => {
    const text = digitizationCreditText(
      matched("A [1990]", "B [1991]", "B [1991]", "C [1992]", "C [1992]")
    );

    // Most-used first, so the two named really are the bulk of the linework.
    expect(text).toContain(
      'carries 3 distinct source credits, most often "B [1991]" and "C [1992]"'
    );
  });

  it("drops the most-used claim when the second named credit ties the third", () => {
    // B and C are both used twice, so naming B over C is the alphabetical
    // tie-break, not a frequency ranking.
    const text = digitizationCreditText(
      matched("A [1990]", "A [1990]", "A [1990]", "B [1991]", "C [1992]")
    );

    expect(text).toContain(
      'carries 3 distinct source credits, including "A [1990]" and "B [1991]"'
    );
    expect(text).not.toContain("most often");
  });

  it("never claims a most-used credit when every credit is used once", () => {
    // The measured Sumatra case: three matched boundaries, three credits, one
    // apiece. No credit is used more than any other.
    const text = digitizationCreditText(
      matched("A [1990]", "B [1991]", "C [1992]")
    );

    expect(text).toContain(
      'carries 3 distinct source credits, including "A [1990]" and "B [1991]"'
    );
    expect(text).not.toContain("most often");
  });

  it("still claims most-used when the named pair is strictly ahead", () => {
    // A:3, B:2, C:1 — the cut between B and C is a strict drop.
    const text = digitizationCreditText(
      matched(
        "A [1990]",
        "A [1990]",
        "A [1990]",
        "B [1991]",
        "B [1991]",
        "C [1992]"
      )
    );

    expect(text).toContain('most often "A [1990]" and "B [1991]"');
  });

  it("orders equal counts alphabetically so input order never decides", () => {
    const forward = digitizationCreditText(matched("Zed [1990]", "Abe [1991]"));
    const reversed = digitizationCreditText(
      matched("Abe [1991]", "Zed [1990]")
    );

    expect(forward).toContain('credited to "Abe [1991]" and "Zed [1990]"');
    expect(forward).toBe(reversed);
  });

  it("reports matched boundaries the source left uncredited", () => {
    const text = digitizationCreditText(matched("Mueller et al. [1987]", null));

    expect(text).toContain("1 matched boundary carries no source credit");
    expect(digitizationCreditText(matched("A [1990]", null, null))).toContain(
      "2 matched boundaries carry no source credit"
    );
  });

  it("stays silent when nothing matched or no credit was supplied", () => {
    const noMatch = plateBoundariesInSearchExtent(
      [boundary({ step: step() })],
      [0, 1, 0, 1]
    );

    expect(noMatch.coverage.matchedBoundaryCount).toBe(0);
    expect(digitizationCreditText(noMatch)).toBeNull();
    // Every matched feature uncredited: report no shortfall, report nothing.
    expect(digitizationCreditText(matched(null, null))).toBeNull();
    expect(
      digitizationCreditText(
        plateBoundariesInSearchExtent([boundary()], [39, 42, -126, -123])
      )
    ).toBeNull();
    expect(
      digitizationCreditText(plateBoundariesInSearchExtent([boundary()], null))
    ).toBeNull();
  });

  it("credits the configured Bird overlay's own separately sourced steps", () => {
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
    // The shipped file really is a compilation: assert it carries many distinct
    // credits, so the panel's claim is grounded in the bundled data.
    const context = plateBoundariesInSearchExtent(
      parsePlateBoundaries(data),
      [-90, 90, -180, 180]
    );

    expect(context.coverage.distinctSourceCitationCount).toBeGreaterThan(1);
    expect(digitizationCreditText(context)).toContain(
      `carries ${context.coverage.distinctSourceCitationCount} distinct source credits`
    );
  });
});

describe("verbatim repeats in the supplied linework", () => {
  const shipped = () =>
    parsePlateBoundaries(
      JSON.parse(
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
      )
    );

  it("counts a trace supplied twice as one boundary, not two", () => {
    const trace: PlateBoundary["points"] = [
      [-125, 40],
      [-124, 41],
    ];
    const context = plateBoundariesInSearchExtent(
      [
        boundary({ name: "PA-NA", points: trace }),
        boundary({ name: "PA-NA", points: trace }),
      ],
      [39, 42, -126, -123]
    );

    expect(context.matchingBoundaries).toEqual([
      {
        name: "PA-NA",
        matchedSegmentCount: 1,
        sourceClass: "unavailable",
        sourceCitation: null,
      },
    ]);
    expect(context.coverage).toMatchObject({
      matchedBoundaryCount: 1,
      matchedSegmentCount: 1,
      repeatedMatchedFeatureCount: 1,
      // The file-level totals describe what was supplied, so they still count
      // both features.
      suppliedBoundaryCount: 2,
      usableBoundaryCount: 2,
    });
  });

  it("matches a trace supplied in reverse as the same trace", () => {
    const context = plateBoundariesInSearchExtent(
      [
        boundary({
          points: [
            [-125, 40],
            [-124, 41],
          ],
        }),
        boundary({
          points: [
            [-124, 41],
            [-125, 40],
          ],
        }),
      ],
      [39, 42, -126, -123]
    );

    expect(context.coverage.matchedBoundaryCount).toBe(1);
    expect(context.coverage.repeatedMatchedFeatureCount).toBe(1);
  });

  it("keeps distinct traces that share a plate-pair label", () => {
    const context = plateBoundariesInSearchExtent(
      [
        boundary({
          points: [
            [-125, 40],
            [-124, 41],
          ],
        }),
        boundary({
          points: [
            [-124, 40],
            [-123.5, 41],
          ],
        }),
      ],
      [39, 42, -126, -123]
    );

    // PB2002 supplies one margin as many separately digitized steps sharing a
    // label, so a repeated label is ordinary and must not be collapsed.
    expect(context.coverage.matchedBoundaryCount).toBe(2);
    expect(context.coverage.repeatedMatchedFeatureCount).toBe(0);
  });

  it("stays silent when nothing repeated", () => {
    const context = plateBoundariesInSearchExtent(
      [boundary()],
      [39, 42, -126, -123]
    );

    expect(context.coverage.repeatedMatchedFeatureCount).toBe(0);
    expect(suppliedRepeatText(context)).toBeNull();
  });

  it("says nothing for an empty or invalid extent", () => {
    expect(
      suppliedRepeatText(plateBoundariesInSearchExtent([boundary()], null))
    ).toBeNull();
    expect(
      suppliedRepeatText(
        plateBoundariesInSearchExtent([boundary()], [0, 1, 0, 1])
      )
    ).toBeNull();
  });

  it("reports one repeat in the singular and agrees its verb", () => {
    const trace: PlateBoundary["points"] = [
      [-125, 40],
      [-124, 41],
    ];
    const text = suppliedRepeatText(
      plateBoundariesInSearchExtent(
        [boundary({ points: trace }), boundary({ points: trace })],
        [39, 42, -126, -123]
      )
    );

    expect(text).toContain("1 supplied feature here repeats a trace");
    expect(text).toContain("was counted once rather than twice");
    expect(text).not.toContain("features here repeat");
  });

  it("reports several repeats in the plural", () => {
    const first: PlateBoundary["points"] = [
      [-125, 40],
      [-124, 41],
    ];
    const second: PlateBoundary["points"] = [
      [-124, 40],
      [-123.5, 41],
    ];
    const text = suppliedRepeatText(
      plateBoundariesInSearchExtent(
        [
          boundary({ points: first }),
          boundary({ points: first }),
          boundary({ points: second }),
          boundary({ points: second }),
        ],
        [39, 42, -126, -123]
      )
    );

    expect(text).toContain("2 supplied features here repeat a trace");
    expect(text).toContain("were counted once rather than twice");
  });

  it("collapses the shipped file's antimeridian repeats over a whole-globe extent", () => {
    const context = plateBoundariesInSearchExtent(
      shipped(),
      [-90, 90, -180, 180]
    );

    // The bundled GeoJSON supplies 241 features but only 235 distinct traces:
    // six antimeridian-crossing western halves are emitted twice, verbatim.
    expect(context.coverage.suppliedBoundaryCount).toBe(241);
    expect(context.coverage.usableBoundaryCount).toBe(241);
    expect(context.coverage.repeatedMatchedFeatureCount).toBe(6);
    expect(context.coverage.matchedBoundaryCount).toBe(235);
  });

  it("no longer lists one Aleutian trace twice for a Kodiak-sized extent", () => {
    const context = plateBoundariesInSearchExtent(
      shipped(),
      // Kodiak Island Borough, Alaska.
      [56.0, 58.9, -155.0, -151.0]
    );

    expect(context.matchingBoundaries).toHaveLength(1);
    expect(context.matchingBoundaries[0]).toMatchObject({
      name: "NA/PA",
      matchedSegmentCount: 3,
    });
    expect(context.coverage.matchedSegmentCount).toBe(3);
    expect(context.coverage.repeatedMatchedFeatureCount).toBe(1);
    expect(suppliedRepeatText(context)).toContain("1 supplied feature here");
  });
});

describe("repeats the source filed differently", () => {
  const trace: PlateBoundary["points"] = [
    [-125, 40],
    [-124, 41],
  ];
  const extent = [39, 42, -126, -123] as const;

  it("keeps a shared trace credited to two different surveys", () => {
    const context = plateBoundariesInSearchExtent(
      [
        boundary({ points: trace, step: step({ sourceCitation: "A [1990]" }) }),
        boundary({ points: trace, step: step({ sourceCitation: "B [1995]" }) }),
      ],
      extent
    );

    // Collapsing these would drop a credit the panel is meant to show, and the
    // disagreement is a source-labelling question this app does not resolve.
    expect(context.coverage.matchedBoundaryCount).toBe(2);
    expect(context.coverage.repeatedMatchedFeatureCount).toBe(0);
    expect(context.coverage.distinctSourceCitationCount).toBe(2);
  });

  it("keeps a shared trace filed under two plate pairs", () => {
    const context = plateBoundariesInSearchExtent(
      [
        boundary({ name: "PA-NA", points: trace }),
        boundary({ name: "PA-JF", points: trace }),
      ],
      extent
    );

    expect(context.coverage.matchedBoundaryCount).toBe(2);
    expect(context.coverage.repeatedMatchedFeatureCount).toBe(0);
  });

  it("keeps a shared trace the source marked differently", () => {
    const context = plateBoundariesInSearchExtent(
      [
        boundary({
          points: trace,
          step: step({ boundaryType: "subduction" }),
        }),
        boundary({ points: trace, step: step({ boundaryType: null }) }),
      ],
      extent
    );

    expect(context.coverage.matchedBoundaryCount).toBe(2);
    expect(context.coverage.repeatedMatchedFeatureCount).toBe(0);
  });

  it("collapses a shared trace the source filed identically", () => {
    const filed = { points: trace, step: step({ sourceCitation: "A [1990]" }) };
    const context = plateBoundariesInSearchExtent(
      [boundary(filed), boundary(filed)],
      extent
    );

    expect(context.coverage.matchedBoundaryCount).toBe(1);
    expect(context.coverage.repeatedMatchedFeatureCount).toBe(1);
  });
});

describe("subductionPolarityText", () => {
  /** Matched boundaries built straight from PB2002-shaped labels. */
  const matchedLabels = (
    ...labels: string[]
  ): ReturnType<typeof plateBoundariesInSearchExtent> =>
    plateBoundariesInSearchExtent(
      labels.map((name, index) =>
        boundary({
          name,
          // Distinct geometry per feature so the duplicate collapse never
          // merges two labels meant to stay separate boundaries.
          points: [
            [-125, 40 + index * 0.01],
            [-124, 41 + index * 0.01],
          ],
        })
      ),
      [39, 42, -126, -123]
    );

  it("reads the descending plate out of the label's delimiter", () => {
    const text = subductionPolarityText(matchedLabels("NZ\\SA"));

    expect(text).toContain("Nazca subducts beneath South America");
    // The point of the line: the glyph the panel already prints is the model's
    // own polarity, not an artefact of the digitized step direction.
    expect(text).toContain("read back from the label as the model wrote it");
  });

  it("resolves both delimiters to the plate the model sends down", () => {
    // "/" sends the right-hand plate down and "\" the left, over the same two
    // plates — so only the delimiter can account for opposite readings.
    expect(subductionPolarityText(matchedLabels("CO/NA"))).toContain(
      "North America subducts beneath Cocos"
    );
    expect(subductionPolarityText(matchedLabels("CO\\NA"))).toContain(
      "Cocos subducts beneath North America"
    );
  });

  it("collapses two labels that record one descent", () => {
    // A whole-Japan extent really does match both spellings. They are one
    // geological statement written twice, so the sentence must not list it
    // twice or count it as two distinct descents.
    const text = subductionPolarityText(matchedLabels("OK/PA", "PA\\OK"));

    expect(text).toContain("Pacific subducts beneath Okhotsk");
    expect(text?.match(/Pacific subducts beneath Okhotsk/g)).toHaveLength(1);
    expect(text).not.toContain("distinct descents");
  });

  it("stays silent when no matched label encodes a polarity", () => {
    // A hyphen is PB2002's non-subducting segment, so there is nothing to read.
    expect(subductionPolarityText(matchedLabels("EU-NA"))).toBeNull();
    // An unlabeled feature decodes to nothing rather than being guessed at.
    expect(subductionPolarityText(matchedLabels(""))).toBeNull();
    expect(
      subductionPolarityText(
        plateBoundariesInSearchExtent(
          [boundary({ name: "NZ\\SA" })],
          [0, 1, 0, 1]
        )
      )
    ).toBeNull();
    expect(
      subductionPolarityText(
        plateBoundariesInSearchExtent([boundary({ name: "NZ\\SA" })], null)
      )
    ).toBeNull();
  });

  it("names a single descent with no list joiner and no selection clause", () => {
    const text = subductionPolarityText(matchedLabels("NZ\\SA", "EU-NA"));

    expect(text).toContain("descends: Nazca subducts beneath South America.");
    expect(text).not.toContain("covering the most matched segments");
  });

  it("joins two readings without a serial comma and three with one", () => {
    // Both fixtures match one segment each, so the segment counts tie and the
    // alphabetical tie-break decides — Cocos leads despite being supplied
    // second. Exact ties are ordinary here, which is why the comparator has a
    // tie-break at all rather than leaving supply order to decide.
    expect(subductionPolarityText(matchedLabels("NZ\\SA", "CO\\NA"))).toContain(
      "Cocos subducts beneath North America and Nazca subducts beneath South America"
    );

    const three = subductionPolarityText(
      matchedLabels("AS/AF", "AT/AF", "EU/AF")
    );
    expect(three).toContain(
      "Africa subducts beneath Aegean Sea, Africa subducts beneath Anatolia, and Africa subducts beneath Eurasia"
    );
    // Exactly three are all named, so nothing was left out to disclose.
    expect(three).not.toContain("distinct descents");
  });

  it("names the two largest and counts the rest beyond three readings", () => {
    const text = subductionPolarityText(
      matchedLabels("AS/AF", "AT/AF", "EU/AF", "NZ\\SA")
    );

    expect(text).toContain(
      "Those are the 2 covering the most matched segments here, of 4 distinct descents these labels record"
    );
    // The unnamed remainder is never exactly one: three readings are all named,
    // so "1 further descent" is unreachable and needs no singular branch.
    expect(text).not.toMatch(/of 3 distinct descents/);
  });

  it("orders readings by matched segments, not by supply order", () => {
    const wide = boundary({
      name: "NZ\\SA",
      points: [
        [-125.5, 40],
        [-125, 40.5],
        [-124.5, 41],
      ],
    });
    const narrow = boundary({
      name: "CO\\NA",
      points: [
        [-124, 41.2],
        [-123.5, 41.4],
      ],
    });

    // Supplied narrow-first; the wider trace must still lead the sentence.
    expect(
      subductionPolarityText(
        plateBoundariesInSearchExtent([narrow, wide], [39, 42, -126, -123])
      )
    ).toContain("descends: Nazca subducts beneath South America and");
  });

  it("reads the shipped Bird overlay's own polarity labels", () => {
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
    // A whole-Chile extent: the shipped file really does encode a polarity the
    // panel can read, so this line never describes a field the data lacks.
    const context = plateBoundariesInSearchExtent(
      parsePlateBoundaries(data),
      [-56, -17.5, -76, -66]
    );

    expect(subductionPolarityText(context)).toContain(
      "Nazca subducts beneath South America"
    );
  });
});

describe("search extent size in the plate geographic coverage sentence", () => {
  it("states the tested extent's size in the geographic coverage sentence", () => {
    const context = plateBoundariesInSearchExtent(
      [boundary()],
      [44.5, 45.5, 0, 1]
    );
    expect(context.geographicCoverage).toContain(
      "about 111 km north–south and 78.6 km east–west at its mid-latitude"
    );
    expect(context.geographicCoverage).toContain(
      "the exact selected boundary is not tested"
    );
  });

  it("says nothing about extent size when the bounding box was unusable", () => {
    const context = plateBoundariesInSearchExtent([boundary()], null);
    expect(context.coverage.status).toBe("invalid-bounds");
    expect(context.geographicCoverage).not.toContain("north–south");
  });
});
