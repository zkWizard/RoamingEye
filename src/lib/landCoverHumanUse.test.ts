import { describe, expect, it } from "vitest";
import {
  IGBP_LAND_COVER_CLASSES,
  LAND_COVER_SOURCE,
  summarizeLandCoverContext,
} from "./landCover";
import {
  LAND_COVER_HUMAN_USE_CATEGORIES,
  landCoverHumanUseNote,
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
    expect(humanUse.status).toBe("available");
    expect(humanUse.unavailableReason).toBeNull();
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
    expect(humanUse.status).toBe("unavailable");
    expect(humanUse.unavailableReason).toBe("no-known-land-cover");
    expect(humanUse.anthropogenicShare.lowerBound).toBeNull();
    expect(humanUse.anthropogenicShare.upperBound).toBeNull();
    expect(humanUse.anthropogenicShare.mosaicSampleCount).toBe(0);
    expect(humanUse.ungroupedKnownSampleCount).toBe(0);
  });

  it.each([
    [2030, "outside-layer-range"],
    [2024.5, "invalid-year"],
  ] as const)(
    "withholds derived shares for unavailable year %s",
    (dataYear, reason) => {
      const context = summarizeLandCoverContext(
        [
          { classCode: 12, sampleCount: 4 },
          { classCode: 13, sampleCount: 2 },
          { classCode: 14, sampleCount: 1 },
        ],
        dataYear
      );

      const humanUse = summarizeLandCoverHumanUse(context);

      expect(context.coverage).toMatchObject({
        status: "unavailable",
        knownLandCoverSampleCount: 0,
        reason: "record-not-published",
      });
      expect(humanUse.status).toBe("unavailable");
      expect(humanUse.unavailableReason).toBe(reason);
      expect(humanUse.provenance).toBe(context.provenance);
      expect(humanUse.categoryCoverage).toEqual([]);
      expect(humanUse.anthropogenicShare).toEqual({
        lowerBound: null,
        upperBound: null,
        mosaicSampleCount: 0,
      });
      expect(humanUse.ungroupedKnownSampleCount).toBe(0);
    }
  );
});

describe("landCoverHumanUseNote", () => {
  const note = (
    observations: Parameters<typeof summarizeLandCoverContext>[0],
    dataYear = 2024
  ) =>
    landCoverHumanUseNote(
      summarizeLandCoverHumanUse(
        summarizeLandCoverContext(observations, dataYear)
      )
    );

  it("reports the two bounds as separate shares, never as a range", () => {
    // Cropland 4 + urban 2 of 10 informative = 60%; mosaic 1 of 10 = 10%.
    const text = note([
      { classCode: 12, sampleCount: 4 },
      { classCode: 13, sampleCount: 2 },
      { classCode: 14, sampleCount: 1 },
      { classCode: 1, sampleCount: 3 },
    ]);

    expect(text).toBe(
      "Cropland or urban & built-up on 60% of classified pixels — the IGBP classes that record direct human land use; a further 10% of classified pixels is the cropland/natural vegetation mosaic, 40-60% cultivation mixed with natural cover."
    );
    // A rounded range would collapse two distinct bounds into "60-70%".
    expect(text).not.toContain("60-70%");
  });

  it("states one share when no ambiguous mosaic was sampled", () => {
    const text = note([
      { classCode: 12, sampleCount: 3 },
      { classCode: 13, sampleCount: 1 },
      { classCode: 10, sampleCount: 4 },
    ]);

    expect(text).toBe(
      "Cropland or urban & built-up on 50% of classified pixels — the IGBP classes that record direct human land use."
    );
    expect(text).not.toContain("mosaic");
  });

  it("names only cropland when no built-up class was sampled", () => {
    // A roadless farming region holds no urban class at all, so naming built-up
    // beside it would offer a surface the IGBP classes did not record.
    const text = note([
      { classCode: 12, sampleCount: 3 },
      { classCode: 10, sampleCount: 1 },
    ]);

    expect(text).toBe(
      "Cropland on 75% of classified pixels — the IGBP class that records direct human land use."
    );
    expect(text).not.toContain("built-up");
    // Narrowing to one category must carry its own number agreement.
    expect(text).not.toContain("IGBP classes");
  });

  it("names only built-up land when no cropland class was sampled", () => {
    const text = note([
      { classCode: 13, sampleCount: 3 },
      { classCode: 10, sampleCount: 1 },
    ]);

    expect(text).toBe(
      "Urban & built-up on 75% of classified pixels — the IGBP class that records direct human land use."
    );
    expect(text).not.toContain("Cropland");
    expect(text).not.toContain("IGBP classes");
  });

  it("does not let the mosaic stand in for an unsampled category", () => {
    // The mosaic is neither category, so it must not stand in for the missing
    // one: cropland + mosaic is still a cropland-only unambiguous clause.
    const text = note([
      { classCode: 12, sampleCount: 2 },
      { classCode: 14, sampleCount: 1 },
      { classCode: 10, sampleCount: 1 },
    ]);

    expect(text).toContain("Cropland on 50% of classified pixels");
    expect(text).toContain("the IGBP class that records direct human land use");
    expect(text).toContain("a further 25%");
    expect(text).not.toContain("built-up on");
  });

  it("leads on the mosaic when no wholly cultivated or built-up class was sampled", () => {
    const text = note([
      { classCode: 14, sampleCount: 1 },
      { classCode: 10, sampleCount: 3 },
    ]);

    // "0% of classified pixels" would put an absence where the informative
    // statement is the ambiguous class itself.
    expect(text).toBe(
      "No wholly cultivated or built-up class was sampled; 25% of classified pixels is the cropland/natural vegetation mosaic, 40-60% cultivation mixed with natural cover."
    );
    expect(text).not.toContain("on 0% of classified pixels");
  });

  it("stays silent when the classes record no human land use at all", () => {
    // Unbroken forest over water: every class falls in other-land-cover, so a
    // clause here would only add width to the status line.
    expect(
      note([
        { classCode: 1, sampleCount: 5 },
        { classCode: 17, sampleCount: 4 },
      ])
    ).toBeNull();
  });

  it("stays silent when no informative land cover was observed", () => {
    expect(
      note([
        { classCode: 255, sampleCount: 3 },
        { classCode: null, sampleCount: 2 },
      ])
    ).toBeNull();
    // The composition copy already states an unpublished year.
    expect(note([{ classCode: 12, sampleCount: 4 }], 2030)).toBeNull();
  });

  it("never rounds a present share away to 0% or a partial share up to 100%", () => {
    // The region grid runs up to 28x28, so one cultivated pixel among ~780
    // classified ones is an ordinary sample, not a rare one.
    expect(
      note([
        { classCode: 12, sampleCount: 1 },
        { classCode: 10, sampleCount: 999 },
      ])
    ).toContain("on <1% of classified pixels");
    expect(
      note([
        { classCode: 12, sampleCount: 999 },
        { classCode: 10, sampleCount: 1 },
      ])
    ).toContain("on >99% of classified pixels");
  });

  it("does not depend on the order the observations arrive in", () => {
    // An exact four-way tie: colormap-quantised class counts make exact ties
    // ordinary, and a count-ordered summary must not leak into the shares.
    const observations = [
      { classCode: 12, sampleCount: 4 },
      { classCode: 13, sampleCount: 4 },
      { classCode: 14, sampleCount: 4 },
      { classCode: 10, sampleCount: 4 },
    ];

    expect(note([...observations].reverse())).toBe(note(observations));
    expect(note(observations)).toContain("on 50% of classified pixels");
    expect(note(observations)).toContain("a further 25%");
  });
});
