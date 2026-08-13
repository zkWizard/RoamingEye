import { describe, expect, it } from "vitest";
import { summarizeLandCoverContext } from "./landCover";
import { describeLandCoverComposition } from "./landCoverCompositionReading";

describe("land-cover region composition copy", () => {
  it("names the most frequent class with its share, richness, and evenness", () => {
    const reading = describeLandCoverComposition(
      summarizeLandCoverContext(
        [
          { classCode: 1, sampleCount: 6 }, // Evergreen needleleaf forest
          { classCode: 10, sampleCount: 3 }, // Grassland
          { classCode: 17, sampleCount: 1 }, // Water
          { classCode: 255, sampleCount: 4 }, // Unclassified: excluded
          { classCode: null, sampleCount: 2 }, // No-data: excluded
        ],
        2024
      )
    );

    expect(reading.kind).toBe("land-cover-region-class-composition-reading");
    expect(reading.isInterpretation).toBe(false);
    expect(reading.status).toBe("composed");
    expect(reading.headline).toBe(
      "Evergreen needleleaf forest (IGBP class 1) most frequent — 60% of classified pixels"
    );
    // Denominator is informative land cover (10), reported against all 16
    // supplied samples so the excluded pixels stay visible.
    expect(reading.detail).toContain(
      "3 IGBP classes, Pielou evenness 0.82, Gini-Simpson 0.54 across 10 classified of 16 sampled image pixels"
    );
    // The composition is carried through rather than recomputed by callers.
    expect(reading.composition.metrics?.classRichness).toBe(3);
  });

  it("keeps every share a share of sampled pixels, never of ground area", () => {
    const reading = describeLandCoverComposition(
      summarizeLandCoverContext([{ classCode: 12, sampleCount: 5 }], 2020)
    );

    expect(reading.text).toContain("sampled image pixels");
    expect(reading.text).not.toContain("of the region");
    expect(reading.text).toContain(
      "not ground area, biodiversity, biomass, or habitat quality"
    );
    expect(reading.text).toContain("counted, never averaged");
    // MCD12Q1 v061 provenance survives into the rendered copy.
    expect(reading.text).toContain("MCD12Q1 v061, 500 m, 2020 annual IGBP map");
  });

  it("reports a single-class region as one class with evenness undefined", () => {
    const reading = describeLandCoverComposition(
      summarizeLandCoverContext(
        [
          { classCode: 16, sampleCount: 9 }, // Barren
          { classCode: 255, sampleCount: 2 },
        ],
        2024
      )
    );

    expect(reading.status).toBe("single-class");
    expect(reading.headline).toBe("Barren (IGBP class 16) only");
    expect(reading.detail).toContain("Evenness is undefined for one class");
    // A lone class must never be dressed up with a Pielou number.
    expect(reading.detail).not.toContain("Pielou");
  });

  it("surfaces an exact tie for most frequent instead of promoting one class", () => {
    const reading = describeLandCoverComposition(
      summarizeLandCoverContext(
        [
          { classCode: 10, sampleCount: 4 }, // Grassland
          { classCode: 12, sampleCount: 4 }, // Cropland — exact tie
        ],
        2024
      )
    );

    expect(reading.status).toBe("tied");
    expect(reading.headline).toBe(
      "Tied most frequent: Grassland (IGBP class 10), Cropland (IGBP class 12)"
    );
    expect(reading.detail).toContain("Each occurred in 4 pixels");
    // No single class is promoted with a "most frequent" share.
    expect(reading.headline).not.toContain("most frequent —");
  });

  it("is independent of the order the samples arrive in, including on ties", () => {
    // Quantised palette decoding makes exact ties ordinary, so an order-flipped
    // fixture must produce byte-identical copy.
    const records = [
      { classCode: 10, sampleCount: 4 },
      { classCode: 12, sampleCount: 4 }, // exact tie with grassland
      { classCode: 1, sampleCount: 2 },
      { classCode: 255, sampleCount: 3 },
      { classCode: null, sampleCount: 1 },
    ];

    const forward = describeLandCoverComposition(
      summarizeLandCoverContext(records, 2024)
    );
    const reversed = describeLandCoverComposition(
      summarizeLandCoverContext([...records].reverse(), 2024)
    );

    expect(reversed.text).toBe(forward.text);
    expect(reversed.status).toBe(forward.status);
    expect(reversed.composition.classShares).toEqual(
      forward.composition.classShares
    );
  });

  it("never rounds a dominant-but-partial share up to a flat 100%", () => {
    // A large drawn region samples up to a 28x28 grid, so a near-uniform box
    // with a few stray pixels is ordinary. 781/784 = 99.6% rounds to 100%,
    // which would claim a totality the same sentence goes on to contradict.
    const reading = describeLandCoverComposition(
      summarizeLandCoverContext(
        [
          { classCode: 16, sampleCount: 781 }, // Barren
          { classCode: 10, sampleCount: 3 }, // Grassland
        ],
        2024
      )
    );

    expect(reading.status).toBe("composed");
    expect(reading.headline).toBe(
      "Barren (IGBP class 16) most frequent — >99% of classified pixels"
    );
    // The copy must not state a totality alongside a second class.
    expect(reading.headline).not.toContain("100%");
    expect(reading.detail).toContain("2 IGBP classes");
    // The underlying share is untouched — only its rendering is guarded.
    expect(reading.composition.metrics?.dominantClassFraction).toBeCloseTo(
      781 / 784,
      10
    );
  });

  it("still prints a plain percentage for a share that is not near the ceiling", () => {
    const reading = describeLandCoverComposition(
      summarizeLandCoverContext(
        [
          { classCode: 16, sampleCount: 3 },
          { classCode: 10, sampleCount: 1 },
        ],
        2024
      )
    );

    expect(reading.headline).toContain("75% of classified pixels");
    expect(reading.headline).not.toContain(">99%");
  });

  it("withholds composition for a year the annual series does not publish", () => {
    const reading = describeLandCoverComposition(
      summarizeLandCoverContext([{ classCode: 1, sampleCount: 4 }], 1998)
    );

    expect(reading.status).toBe("unavailable");
    expect(reading.headline).toBe("No land-cover map published for 1998");
    expect(reading.detail).toContain(
      "The annual MCD12Q1 series does not cover this year"
    );
    expect(reading.composition.metrics).toBeNull();
    // Even a withheld reading keeps its citation.
    expect(reading.text).toContain("MCD12Q1 v061");
  });

  it("explains an all-unclassified region instead of claiming no data", () => {
    const reading = describeLandCoverComposition(
      summarizeLandCoverContext(
        [
          { classCode: 255, sampleCount: 7 },
          { classCode: null, sampleCount: 2 },
        ],
        2024
      )
    );

    expect(reading.status).toBe("unavailable");
    expect(reading.headline).toBe("No IGBP land-cover classes in this region");
    expect(reading.detail).toContain(
      "Of 9 sampled image pixels: 7 pixels source-unclassified, 2 pixels with no usable colour"
    );
  });

  it("names the one reason a composition's unclassified remainder is unclassified", () => {
    const reading = describeLandCoverComposition(
      summarizeLandCoverContext(
        [
          { classCode: 1, sampleCount: 6 },
          { classCode: 10, sampleCount: 4 },
          { classCode: 255, sampleCount: 5 }, // source-unclassified only
        ],
        2024
      )
    );

    expect(reading.status).toBe("composed");
    // One reason accounts for the whole remainder, so the count is stated once.
    expect(reading.detail).toContain(
      "10 classified of 15 sampled image pixels (the other 5 pixels source-unclassified)"
    );
  });

  it("breaks the remainder down when more than one reason took pixels", () => {
    const reading = describeLandCoverComposition(
      summarizeLandCoverContext(
        [
          { classCode: 1, sampleCount: 6 },
          { classCode: 10, sampleCount: 4 },
          { classCode: 255, sampleCount: 5 },
          { classCode: null, sampleCount: 3 },
          { classCode: 42, sampleCount: 2 }, // outside the IGBP contract
        ],
        2024
      )
    );

    expect(reading.detail).toContain(
      "10 classified of 20 sampled image pixels (the other 10 pixels: 5 source-unclassified, 3 with no usable colour, 2 outside the IGBP class contract)"
    );
  });

  it("sums the remainder from the reasons it prints, so the two cannot disagree", () => {
    // The four buckets partition every counted sample, so the stated remainder
    // must equal total-minus-classified as well as the sum of its own parts.
    const reading = describeLandCoverComposition(
      summarizeLandCoverContext(
        [
          { classCode: 16, sampleCount: 700 },
          { classCode: 10, sampleCount: 41 },
          { classCode: 255, sampleCount: 30 },
          { classCode: null, sampleCount: 13 },
        ],
        2024
      )
    );

    expect(reading.detail).toContain(
      "741 classified of 784 sampled image pixels (the other 43 pixels: 30 source-unclassified, 13 with no usable colour)"
    );
    expect(30 + 13).toBe(784 - 741);
  });

  it("says nothing about a remainder when every sampled pixel was classified", () => {
    const reading = describeLandCoverComposition(
      summarizeLandCoverContext(
        [
          { classCode: 1, sampleCount: 6 },
          { classCode: 10, sampleCount: 4 },
        ],
        2024
      )
    );

    expect(reading.detail).toContain(
      "10 classified of 10 sampled image pixels"
    );
    expect(reading.detail).not.toContain("the other");
  });

  it("names the remainder on a single-class region too", () => {
    // Evenness is undefined here, but the denominator behind "all" is not.
    const reading = describeLandCoverComposition(
      summarizeLandCoverContext(
        [
          { classCode: 16, sampleCount: 9 },
          { classCode: null, sampleCount: 4 },
        ],
        2024
      )
    );

    expect(reading.status).toBe("single-class");
    expect(reading.detail).toContain(
      "in all 9 classified of 13 sampled image pixels (the other 4 pixels with no usable colour)"
    );
  });

  it("names the remainder on a tied region too", () => {
    const reading = describeLandCoverComposition(
      summarizeLandCoverContext(
        [
          { classCode: 10, sampleCount: 4 },
          { classCode: 12, sampleCount: 4 },
          { classCode: 255, sampleCount: 2 },
        ],
        2024
      )
    );

    expect(reading.status).toBe("tied");
    expect(reading.detail).toContain(
      "8 classified of 10 sampled image pixels (the other 2 pixels source-unclassified)"
    );
  });

  it("keeps the unavailable branch's wording unchanged", () => {
    // Both branches read the same reason list; the withheld one still prints
    // its own sentence form, with no "the other" remainder clause.
    const reading = describeLandCoverComposition(
      summarizeLandCoverContext(
        [
          { classCode: 255, sampleCount: 4 },
          { classCode: 99, sampleCount: 1 },
        ],
        2024
      )
    );

    expect(reading.status).toBe("unavailable");
    expect(reading.detail).toContain(
      "Of 5 sampled image pixels: 4 pixels source-unclassified, 1 pixel outside the IGBP class contract"
    );
    expect(reading.detail).not.toContain("the other");
  });

  it("reports an empty sample as no pixels rather than an empty composition", () => {
    const reading = describeLandCoverComposition(
      summarizeLandCoverContext([], 2024)
    );

    expect(reading.status).toBe("unavailable");
    expect(reading.detail).toContain(
      "The rendered source image supplied no pixels for this region"
    );
  });
});
