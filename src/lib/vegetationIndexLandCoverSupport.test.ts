import { describe, expect, it } from "vitest";
import {
  IGBP_LAND_COVER_CLASSES,
  LAND_COVER_SOURCE,
  summarizeLandCoverContext,
} from "./landCover";
import { LAYERS } from "./timeline";
import {
  NON_VEGETATING_TIER_IDS,
  VEGETATION_INDEX_LAYER_IDS,
  VEGETATION_INDEX_SOURCE,
  VEGETATION_INDEX_SUPPORT_TIERS,
  summarizeVegetationIndexLandCoverSupport,
  vegetationIndexSupportClassNote,
  vegetationIndexSupportForClass,
  vegetationIndexSupportNote,
} from "./vegetationIndexLandCoverSupport";

describe("vegetation-index land-cover support partition", () => {
  it("covers every informative IGBP class exactly once", () => {
    const informativeCodes = IGBP_LAND_COVER_CLASSES.filter(
      (entry) => entry.isInformativeLandCover
    )
      .map((entry) => entry.code)
      .sort((a, b) => a - b);

    const partitioned = VEGETATION_INDEX_SUPPORT_TIERS.flatMap(
      (tier) => tier.classCodes
    );

    expect([...partitioned].sort((a, b) => a - b)).toEqual(informativeCodes);
    expect(new Set(partitioned).size).toBe(partitioned.length);
    // Unclassified pixels carry no class definition, so no support tier.
    expect(partitioned).not.toContain(255);
    expect(vegetationIndexSupportForClass(255)).toBeNull();
    expect(vegetationIndexSupportForClass(99)).toBeNull();
  });

  it("requires vegetation cover only where the class definition states it", () => {
    const requiring = VEGETATION_INDEX_SUPPORT_TIERS.filter(
      (tier) => tier.requiresVegetationCover
    ).map((tier) => tier.id);

    expect(requiring).toEqual(["vegetated"]);

    // Snow & ice, water, and barren are the classes whose definitions leave no
    // room for a plant canopy: they neither require nor permit vegetation.
    const withoutVegetation = VEGETATION_INDEX_SUPPORT_TIERS.filter(
      (tier) => !tier.permitsVegetationCover
    ).flatMap((tier) => [...tier.classCodes]);

    expect([...withoutVegetation].sort((a, b) => a - b)).toEqual([15, 16, 17]);
    // Anything a tier requires it must also permit.
    for (const tier of VEGETATION_INDEX_SUPPORT_TIERS) {
      if (tier.requiresVegetationCover) {
        expect(tier.permitsVegetationCover).toBe(true);
      }
      expect(tier.definitionalBasis.length).toBeGreaterThan(0);
    }
  });

  it("places wetland and built-up in their own mixed tiers", () => {
    expect(vegetationIndexSupportForClass(11)?.id).toBe("mixed-water");
    expect(vegetationIndexSupportForClass(13)?.id).toBe("mixed-built");
    expect(vegetationIndexSupportForClass(16)?.id).toBe("sparsely-vegetated");
    expect(vegetationIndexSupportForClass(15)?.id).toBe("non-vegetated");
    expect(vegetationIndexSupportForClass(17)?.id).toBe("non-vegetated");
    // Open shrubland and savanna keep their required woody cover over
    // vegetated ground, so they stay canopy classes.
    expect(vegetationIndexSupportForClass(7)?.id).toBe("vegetated");
    expect(vegetationIndexSupportForClass(9)?.id).toBe("vegetated");
  });

  it("sums whole class counts into tiers and retains both dataset refs", () => {
    const context = summarizeLandCoverContext(
      [
        { classCode: 4, sampleCount: 5 }, // Deciduous broadleaf -> vegetated
        { classCode: 10, sampleCount: 3 }, // Grassland -> vegetated
        { classCode: 11, sampleCount: 2 }, // Wetland -> mixed-water
        { classCode: 13, sampleCount: 1 }, // Urban -> mixed-built
        { classCode: 16, sampleCount: 4 }, // Barren -> sparsely-vegetated
        { classCode: 17, sampleCount: 1 }, // Water -> non-vegetated
        { classCode: 255, sampleCount: 2 }, // Unclassified: no tier
        { classCode: null, sampleCount: 2 }, // No-data: no tier
      ],
      2024
    );

    const support = summarizeVegetationIndexLandCoverSupport(context);

    expect(support.kind).toBe("observed-land-cover-vegetation-index-support");
    expect(support.isForecast).toBe(false);
    expect(support.status).toBe("available");
    expect(support.unavailableReason).toBeNull();
    // MCD12Q1 provenance is reused verbatim, never re-derived.
    expect(support.provenance).toBe(context.provenance);
    expect(support.provenance.source).toBe(LAND_COVER_SOURCE);
    // The vegetation-index product the tiers qualify is cited alongside it.
    expect(support.vegetationIndexSource).toBe(LAYERS.ndvi.dataset);
    expect(support.vegetationIndexSource.shortName).toBe("MOD13A3");
    expect(support.vegetationIndexSource.version).toBe("061");
    // Both vegetation-index layers render the same product.
    expect(VEGETATION_INDEX_LAYER_IDS).toEqual(["ndvi", "evi"]);
    expect(LAYERS.evi.dataset).toEqual(VEGETATION_INDEX_SOURCE);
    expect(support.limitations.length).toBeGreaterThan(0);

    const counts = Object.fromEntries(
      support.tierCoverage.map((tier) => [tier.id, tier.sampleCount])
    );
    expect(counts).toEqual({
      vegetated: 8,
      "mixed-water": 2,
      "mixed-built": 1,
      "sparsely-vegetated": 4,
      "non-vegetated": 1,
    });
    expect(support.ungroupedKnownSampleCount).toBe(0);

    // 16 informative samples out of 20 counted samples.
    expect(context.coverage.knownLandCoverSampleCount).toBe(16);
    expect(context.coverage.totalSampleCount).toBe(20);
    const vegetated = support.tierCoverage.find(
      (tier) => tier.id === "vegetated"
    )!;
    expect(vegetated.fractionOfKnownLandCover).toBeCloseTo(8 / 16, 12);
    expect(vegetated.fractionOfAllSamples).toBeCloseTo(8 / 20, 12);

    expect(support.dominantTier?.id).toBe("vegetated");
    expect(support.dominantTierStatus).toBe("unique");
  });

  it("bounds the plant-canopy share by what the mixed classes allow", () => {
    const context = summarizeLandCoverContext(
      [
        { classCode: 2, sampleCount: 3 }, // Vegetated
        { classCode: 11, sampleCount: 1 }, // Mixed: wetland
        { classCode: 13, sampleCount: 1 }, // Mixed: built-up
        { classCode: 16, sampleCount: 3 }, // Barren: outside both bounds
      ],
      2024
    );

    const share =
      summarizeVegetationIndexLandCoverSupport(context).plantCanopyShare;

    expect(share.mixedSampleCount).toBe(2);
    expect(share.lowerBound).toBeCloseTo(3 / 8, 12);
    expect(share.upperBound).toBeCloseTo(5 / 8, 12);
    expect(share.nonVegetatedSampleCount).toBe(3);
    expect(share.nonVegetatedBound).toBeCloseTo(3 / 8, 12);
  });

  it("sums the non-vegetating share from its own tiers, not by subtraction", () => {
    // Every informative IGBP class carries a tier, so the canopy, mixed, and
    // non-vegetating shares do partition the classified sample — but the
    // summary must reach that by counting, never by 1 - upperBound. An
    // informative class carrying no tier lands in ungroupedKnownSampleCount,
    // and subtraction would relabel it as barren, snow, ice, or water.
    const context = summarizeLandCoverContext(
      IGBP_LAND_COVER_CLASSES.filter(
        (entry) => entry.isInformativeLandCover
      ).map((entry, index) => ({
        classCode: entry.code,
        sampleCount: index + 1,
      })),
      2024
    );

    const support = summarizeVegetationIndexLandCoverSupport(context);
    const share = support.plantCanopyShare;

    expect(support.ungroupedKnownSampleCount).toBe(0);
    expect(NON_VEGETATING_TIER_IDS).toEqual([
      "sparsely-vegetated",
      "non-vegetated",
    ]);
    expect(share.lowerBound! + share.nonVegetatedBound!).toBeCloseTo(
      1 - share.mixedSampleCount / context.coverage.knownLandCoverSampleCount,
      12
    );
    expect(share.upperBound! + share.nonVegetatedBound!).toBeCloseTo(1, 12);
  });

  it("reports a fully non-vegetated sample as a zero canopy share", () => {
    const context = summarizeLandCoverContext(
      [
        { classCode: 15, sampleCount: 4 }, // Permanent snow & ice
        { classCode: 17, sampleCount: 2 }, // Water
      ],
      2024
    );

    const support = summarizeVegetationIndexLandCoverSupport(context);

    expect(support.status).toBe("available");
    expect(support.dominantTier?.id).toBe("non-vegetated");
    expect(support.plantCanopyShare.lowerBound).toBe(0);
    expect(support.plantCanopyShare.upperBound).toBe(0);
    expect(support.plantCanopyShare.mixedSampleCount).toBe(0);
    expect(support.plantCanopyShare.nonVegetatedSampleCount).toBe(6);
    expect(support.plantCanopyShare.nonVegetatedBound).toBe(1);
  });

  it("marks a tie between tiers instead of naming a winner", () => {
    const context = summarizeLandCoverContext(
      [
        { classCode: 10, sampleCount: 2 }, // Grassland -> vegetated
        { classCode: 16, sampleCount: 2 }, // Barren -> sparsely-vegetated
      ],
      2024
    );

    const support = summarizeVegetationIndexLandCoverSupport(context);

    expect(support.dominantTierStatus).toBe("tied");
    // Ties still resolve deterministically by lowest first class code.
    expect(support.dominantTier?.id).toBe("vegetated");
  });

  it("withholds tiers and preserves the reason when the year is unpublished", () => {
    const context = summarizeLandCoverContext(
      [{ classCode: 4, sampleCount: 3 }],
      1999
    );

    const support = summarizeVegetationIndexLandCoverSupport(context);

    expect(support.status).toBe("unavailable");
    expect(support.unavailableReason).toBe("outside-layer-range");
    expect(support.tierCoverage).toEqual([]);
    expect(support.dominantTier).toBeNull();
    expect(support.dominantTierStatus).toBe("no-data");
    expect(support.plantCanopyShare.lowerBound).toBeNull();
    expect(support.plantCanopyShare.upperBound).toBeNull();
    // Both dataset references survive the unavailable path.
    expect(support.provenance.source).toBe(LAND_COVER_SOURCE);
    expect(support.vegetationIndexSource).toBe(LAYERS.ndvi.dataset);
    expect(support.limitations.length).toBeGreaterThan(0);
  });

  it("withholds a canopy share when no informative class was observed", () => {
    const context = summarizeLandCoverContext(
      [{ classCode: 255, sampleCount: 4 }],
      2024
    );

    const support = summarizeVegetationIndexLandCoverSupport(context);

    expect(support.status).toBe("unavailable");
    expect(support.unavailableReason).toBe("no-known-land-cover");
    expect(support.plantCanopyShare.lowerBound).toBeNull();
    expect(support.plantCanopyShare.upperBound).toBeNull();
  });
});

describe("vegetation-index support note", () => {
  const note = (
    observations: { classCode: number | null; sampleCount: number }[],
    year = 2024
  ) =>
    vegetationIndexSupportNote(
      summarizeVegetationIndexLandCoverSupport(
        summarizeLandCoverContext(observations, year)
      )
    );

  it("states the required, mixed, and non-vegetating shares separately", () => {
    const text = note([
      { classCode: 2, sampleCount: 3 }, // Vegetated
      { classCode: 11, sampleCount: 1 }, // Mixed: wetland
      { classCode: 13, sampleCount: 1 }, // Mixed: built-up
      { classCode: 16, sampleCount: 3 }, // Barren
    ]);

    // 3/8 requires vegetation cover; 2/8 permits it without requiring it; 3/8
    // is a surface whose definition leaves no room for a canopy at all. Those
    // three round to 38 + 25 + 38 = 101, which is why each is introduced as "a
    // further" and none of the copy claims the shares partition the sample.
    expect(text).toBe(
      "MOD13A3 v061 NDVI/EVI reads as plant greenness on 38% of classified " +
        "pixels, where the IGBP class definition requires vegetation cover; a " +
        "further 25% is wetland or built-up, which permit vegetation without " +
        "requiring it; a further 38% is barren sand, rock, or soil, where " +
        "NDVI/EVI still returns a value that is not plant greenness."
    );
  });

  it("omits the mixed clause when no mixed class was sampled", () => {
    const text = note([
      { classCode: 10, sampleCount: 6 }, // Grassland
      { classCode: 16, sampleCount: 2 }, // Barren
    ]);

    expect(text).toBe(
      "MOD13A3 v061 NDVI/EVI reads as plant greenness on 75% of classified " +
        "pixels, where the IGBP class definition requires vegetation cover; a " +
        "further 25% is barren sand, rock, or soil, where NDVI/EVI still " +
        "returns a value that is not plant greenness."
    );
    expect(text).not.toContain("wetland or built-up");
  });

  it("names only the non-vegetating surfaces the sample actually holds", () => {
    // Snow and water without barren must not be described as barren ground,
    // and barren without either must not be described as snow or water.
    const frozen = note([
      { classCode: 4, sampleCount: 2 }, // Deciduous broadleaf forest
      { classCode: 15, sampleCount: 1 }, // Permanent snow & ice
      { classCode: 17, sampleCount: 1 }, // Water
    ]);
    expect(frozen).toContain(
      "a further 50% is permanent snow, ice, or water, where NDVI/EVI still " +
        "returns a value that is not plant greenness"
    );
    expect(frozen).not.toContain("barren");

    const barren = note([
      { classCode: 4, sampleCount: 2 },
      { classCode: 16, sampleCount: 2 }, // Barren
    ]);
    expect(barren).toContain("is barren sand, rock, or soil");
    expect(barren).not.toContain("snow");

    const both = note([
      { classCode: 4, sampleCount: 2 },
      { classCode: 15, sampleCount: 1 },
      { classCode: 16, sampleCount: 1 },
    ]);
    expect(both).toContain("is barren, snow, ice, or permanent water");
  });

  it("omits the non-vegetating clause when every class supports a canopy", () => {
    const text = note([
      { classCode: 1, sampleCount: 4 }, // Evergreen needleleaf forest
      { classCode: 11, sampleCount: 1 }, // Mixed: wetland
    ]);

    expect(text).toContain(
      "is permanent wetland, which permits vegetation without requiring it"
    );
    expect(text).not.toContain("is not plant greenness");
  });

  it("names only the mixed surfaces the sample actually holds", () => {
    // A wetland with no built-up pixels must not be told part of it may be
    // built up, and a built-up sample with no wetland must not be told part of
    // it may be wetland: the non-vegetating clause already narrows this way.
    const wetland = note([
      { classCode: 4, sampleCount: 2 }, // Deciduous broadleaf forest
      { classCode: 11, sampleCount: 2 }, // Mixed: wetland
    ]);
    expect(wetland).toContain(
      "a further 50% is permanent wetland, which permits vegetation without " +
        "requiring it"
    );
    expect(wetland).not.toContain("built-up");

    const builtUp = note([
      { classCode: 4, sampleCount: 2 },
      { classCode: 13, sampleCount: 2 }, // Mixed: urban & built-up
    ]);
    expect(builtUp).toContain(
      "a further 50% is urban and built-up land, which permits vegetation " +
        "without requiring it"
    );
    expect(builtUp).not.toContain("wetland");

    const both = note([
      { classCode: 4, sampleCount: 2 },
      { classCode: 11, sampleCount: 1 },
      { classCode: 13, sampleCount: 1 },
    ]);
    expect(both).toContain(
      "a further 50% is wetland or built-up, which permit vegetation without " +
        "requiring it"
    );
  });

  it("states the whole of a fully non-vegetated region as such", () => {
    const text = note([
      { classCode: 15, sampleCount: 4 }, // Permanent snow & ice
      { classCode: 17, sampleCount: 2 }, // Water
    ]);

    // The bare "0%" the old copy stopped at said a canopy share was absent
    // without saying what the pixels it excluded actually are.
    expect(text).toBe(
      "MOD13A3 v061 NDVI/EVI reads as plant greenness on 0% of classified " +
        "pixels, where the IGBP class definition requires vegetation cover; a " +
        "further 100% is permanent snow, ice, or water, where NDVI/EVI still " +
        "returns a value that is not plant greenness."
    );
  });

  it("reports a fully non-vegetated region as a plain zero, not a hedge", () => {
    const text = note([
      { classCode: 15, sampleCount: 4 }, // Permanent snow & ice
      { classCode: 17, sampleCount: 2 }, // Water
    ]);

    expect(text).toContain("on 0% of classified pixels");
  });

  // Rounding must not report a present share as absent, nor a partial share as
  // the whole: both would state something the samples do not show.
  it("never rounds a present share to 0% or a partial share to 100%", () => {
    const text = note([
      { classCode: 2, sampleCount: 999 }, // Vegetated
      { classCode: 11, sampleCount: 1 }, // Mixed: wetland
    ]);

    expect(text).toContain("on >99% of classified pixels");
    expect(text).toContain("a further <1% is permanent wetland");
    expect(text).not.toContain("100%");
    expect(text).not.toContain(" 0%");
  });

  it("reports an exactly whole canopy share as 100%", () => {
    const text = note([{ classCode: 5, sampleCount: 7 }]); // Mixed forest only

    expect(text).toContain("on 100% of classified pixels");
  });

  it("says nothing when there is no informative land cover to qualify", () => {
    expect(note([{ classCode: 255, sampleCount: 4 }])).toBeNull();
    expect(note([{ classCode: null, sampleCount: 4 }])).toBeNull();
    // An unpublished year carries no classes to partition either.
    expect(note([{ classCode: 4, sampleCount: 3 }], 1999)).toBeNull();
  });
});

describe("vegetationIndexSupportClassNote", () => {
  it("names the vegetated tier's own definition as the reason it reads as greenness", () => {
    const text = vegetationIndexSupportClassNote([12]); // Cropland

    expect(text).toContain("MOD13A3 v061 NDVI/EVI reads as plant greenness");
    expect(text).toContain("the class definition requires vegetation cover");
  });

  it("says a mixed class permits vegetation without requiring it", () => {
    const wetland = vegetationIndexSupportClassNote([11]);
    const built = vegetationIndexSupportClassNote([13]);

    expect(wetland).toContain("mixes plants with another surface");
    expect(wetland).toContain("30-60% water cover");
    expect(built).toContain("mixes plants with another surface");
    expect(built).toContain("30% impervious surface");
  });

  it("withholds greenness on classes whose definition caps or excludes vegetation", () => {
    // A value still exists over snow, water, and barren ground: the honest
    // statement is that it is retrieved but does not describe plant cover.
    for (const classCode of [15, 16, 17]) {
      const text = vegetationIndexSupportClassNote([classCode]);
      expect(text).toContain("still retrieves NDVI/EVI here");
      expect(text).toContain("does not describe plant cover");
      expect(text).not.toContain("reads as plant greenness");
    }
  });

  it("reads a tie within one tier as that tier, without pluralising", () => {
    // Grassland and savanna are both vegetated: the tie does not change which
    // statement is true, so it is stated rather than withheld.
    const text = vegetationIndexSupportClassNote([9, 10]);

    expect(text).toContain("reads as plant greenness here");
    expect(text).not.toContain("tied classes");
  });

  it("refuses to resolve a tie that spans tiers", () => {
    // Water and cropland carry no ordering, so neither tier's statement may be
    // promoted to the answer.
    const text = vegetationIndexSupportClassNote([12, 17]);

    expect(text).toContain("not read the same way on the tied classes");
    expect(text).not.toContain("reads as plant greenness here");
    expect(text).not.toContain("does not describe plant cover");
  });

  it("is order-independent across the tied classes", () => {
    expect(vegetationIndexSupportClassNote([12, 17])).toBe(
      vegetationIndexSupportClassNote([17, 12])
    );
    expect(vegetationIndexSupportClassNote([9, 10])).toBe(
      vegetationIndexSupportClassNote([10, 9])
    );
  });

  it("says nothing when there is no class, or a class carrying no tier", () => {
    expect(vegetationIndexSupportClassNote([])).toBeNull();
    expect(vegetationIndexSupportClassNote([255])).toBeNull();
    expect(vegetationIndexSupportClassNote([12, 255])).toBeNull();
  });

  it("agrees with the region note on which tier a class sits in", () => {
    // The two surfaces must not disagree: every informative class the region
    // share counts as canopy is a class the point note calls plant greenness.
    for (const tier of VEGETATION_INDEX_SUPPORT_TIERS) {
      for (const classCode of tier.classCodes) {
        const text = vegetationIndexSupportClassNote([classCode]);
        expect(text).not.toBeNull();
        expect(text!.includes("reads as plant greenness here")).toBe(
          tier.requiresVegetationCover
        );
      }
    }
  });
});
