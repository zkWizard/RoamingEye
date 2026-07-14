import { describe, expect, it } from "vitest";
import {
  IGBP_LAND_COVER_CLASSES,
  LAND_COVER_SOURCE,
  summarizeLandCoverContext,
} from "./landCover";
import {
  LAND_COVER_HUMAN_USE_CATEGORIES,
  summarizeLandCoverHumanUse,
} from "./landCoverHumanUse";

describe("land-cover human-use partition", () => {
  it("covers every informative IGBP class exactly once", () => {
    const informativeCodes = IGBP_LAND_COVER_CLASSES.filter(
      (entry) => entry.isInformativeLandCover
    )
      .map((entry) => entry.code)
      .sort((a, b) => a - b);

    const partitioned = LAND_COVER_HUMAN_USE_CATEGORIES.flatMap(
      (category) => category.classCodes
    );

    expect([...partitioned].sort((a, b) => a - b)).toEqual(informativeCodes);
    expect(new Set(partitioned).size).toBe(partitioned.length);
    // The unclassified code 255 belongs to no land-use category.
    expect(partitioned).not.toContain(255);
  });

  it("marks only cropland and built-up as unambiguously anthropogenic", () => {
    const anthropogenic = LAND_COVER_HUMAN_USE_CATEGORIES.filter(
      (category) => category.isAnthropogenic
    ).map((category) => category.id);

    expect(anthropogenic).toEqual(["cultivated", "built"]);
  });

  it("sums whole class counts into categories and retains MCD12Q1 provenance", () => {
    const context = summarizeLandCoverContext(
      [
        { classCode: 12, sampleCount: 4 }, // Cropland -> cultivated
        { classCode: 13, sampleCount: 2 }, // Urban -> built
        { classCode: 14, sampleCount: 1 }, // Cropland/natural mosaic
        { classCode: 1, sampleCount: 2 }, // Evergreen needleleaf -> other
        { classCode: 17, sampleCount: 1 }, // Water -> other
        { classCode: 255, sampleCount: 3 }, // Unclassified: excluded
        { classCode: null, sampleCount: 1 }, // No-data: excluded
      ],
      2024
    );

    const humanUse = summarizeLandCoverHumanUse(context);

    expect(humanUse.kind).toBe("observed-land-cover-human-use");
    expect(humanUse.isForecast).toBe(false);
    // Provenance is reused verbatim, never re-derived.
    expect(humanUse.provenance).toBe(context.provenance);
    expect(humanUse.provenance.source).toBe(LAND_COVER_SOURCE);
    expect(humanUse.ungroupedKnownSampleCount).toBe(0);

    // Informative land cover = 4 + 2 + 1 + 2 + 1 = 10; total samples = 14.
    // Sorted by sample count with a first-class-code tie-break: cultivated (4),
    // other (3), built (2), mosaic (1).
    expect(humanUse.categoryCoverage).toEqual([
      {
        id: "cultivated",
        label: "Cropland",
        classCodes: [12],
        isAnthropogenic: true,
        sampleCount: 4,
        fractionOfAllSamples: 4 / 14,
        fractionOfKnownLandCover: 0.4,
      },
      {
        id: "other-land-cover",
        label: "Other land cover",
        classCodes: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 15, 16, 17],
        isAnthropogenic: false,
        sampleCount: 3,
        fractionOfAllSamples: 3 / 14,
        fractionOfKnownLandCover: 0.3,
      },
      {
        id: "built",
        label: "Urban & built-up",
        classCodes: [13],
        isAnthropogenic: true,
        sampleCount: 2,
        fractionOfAllSamples: 2 / 14,
        fractionOfKnownLandCover: 0.2,
      },
      {
        id: "cultivated-natural-mosaic",
        label: "Cropland/natural vegetation mosaic",
        classCodes: [14],
        isAnthropogenic: false,
        sampleCount: 1,
        fractionOfAllSamples: 1 / 14,
        fractionOfKnownLandCover: 0.1,
      },
    ]);

    // Lower bound excludes the ambiguous mosaic (0.4 + 0.2); upper adds it.
    expect(humanUse.anthropogenicShare.lowerBound).toBeCloseTo(0.6, 12);
    expect(humanUse.anthropogenicShare.upperBound).toBeCloseTo(0.7, 12);
    expect(humanUse.anthropogenicShare.mosaicSampleCount).toBe(1);

    // Re-bucketing must not average categorical class identifiers.
    expect(JSON.stringify(humanUse)).not.toContain("mean");
    expect(humanUse).not.toHaveProperty("meanClassCode");
  });

  it("collapses the lower and upper bound when no mosaic is present", () => {
    const context = summarizeLandCoverContext(
      [
        { classCode: 12, sampleCount: 3 }, // Cropland
        { classCode: 10, sampleCount: 1 }, // Grassland -> other
      ],
      2023
    );

    const humanUse = summarizeLandCoverHumanUse(context);

    expect(humanUse.anthropogenicShare.mosaicSampleCount).toBe(0);
    expect(humanUse.anthropogenicShare.lowerBound).toBeCloseTo(0.75, 12);
    expect(humanUse.anthropogenicShare.upperBound).toBeCloseTo(0.75, 12);
  });

  it("nulls the anthropogenic share when no informative land cover is present", () => {
    const context = summarizeLandCoverContext(
      [
        { classCode: 255, sampleCount: 3 }, // Unclassified
        { classCode: null, sampleCount: 2 }, // No-data
      ],
      2024
    );

    const humanUse = summarizeLandCoverHumanUse(context);

    expect(humanUse.categoryCoverage).toEqual([]);
    expect(humanUse.anthropogenicShare.lowerBound).toBeNull();
    expect(humanUse.anthropogenicShare.upperBound).toBeNull();
    expect(humanUse.anthropogenicShare.mosaicSampleCount).toBe(0);
    expect(humanUse.ungroupedKnownSampleCount).toBe(0);
  });
});
