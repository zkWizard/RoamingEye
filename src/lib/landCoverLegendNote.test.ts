import { describe, expect, it } from "vitest";
import {
  INFORMATIVE_IGBP_CLASS_COUNT,
  landCoverLegendNote,
} from "./landCoverLegendNote";
import { IGBP_LAND_COVER_CLASSES } from "./landCover";
import { VEGETATION_INDEX_SUPPORT_TIERS } from "./vegetationIndexLandCoverSupport";
import { LEGENDS, legendProvenance } from "./legend";

describe("landCoverLegendNote", () => {
  it("counts the informative IGBP classes from the class table", () => {
    expect(INFORMATIVE_IGBP_CLASS_COUNT).toBe(17);
    expect(INFORMATIVE_IGBP_CLASS_COUNT).toBe(
      IGBP_LAND_COVER_CLASSES.filter((entry) => entry.isInformativeLandCover)
        .length
    );
  });

  it("excludes the unclassified code from the count it names", () => {
    // 255 is drawn as a swatch but carries no land-cover type, so a note
    // claiming 18 classes would misstate what the legend shows.
    expect(IGBP_LAND_COVER_CLASSES).toHaveLength(
      INFORMATIVE_IGBP_CLASS_COUNT + 1
    );
    expect(landCoverLegendNote()).not.toContain("18 IGBP");
  });

  it("derives the class count rather than hard-coding it in the sentence", () => {
    expect(landCoverLegendNote()).toContain(
      `${INFORMATIVE_IGBP_CLASS_COUNT} IGBP classes`
    );
  });

  it("says a colour is a name and not a rank", () => {
    const note = landCoverLegendNote();
    expect(note).toContain("Colours name a class; they do not rank one");
    expect(note).toContain("counted, never averaged");
    expect(note).toContain("swatch order carries no magnitude");
  });

  it("states that a class is a definitional threshold, not a measurement", () => {
    const note = landCoverLegendNote();
    expect(note).toContain("the cover threshold its definition requires");
    expect(note).toContain("not what a pixel holds");
  });

  it("keeps the Barren threshold in step with the support tiers", () => {
    // The one number the note quotes. VEGETATION_INDEX_SUPPORT_TIERS is the
    // in-repo statement of the MCD12Q1 v061 LC_Type1 definitions, so if that
    // cap ever moves the sentence must fail here rather than ship stale.
    const barren = VEGETATION_INDEX_SUPPORT_TIERS.find((tier) =>
      tier.classCodes.includes(16)
    );
    expect(barren?.label).toBe("Barren");
    expect(barren?.definitionalBasis).toContain("vegetation capped below 10%");
    expect(landCoverLegendNote()).toContain(
      "Barren still permits vegetation below 10%"
    );
  });

  it("claims nothing ecological, causal, or predictive", () => {
    const note = landCoverLegendNote().toLowerCase();
    for (const claim of [
      "biodiversity",
      "biomass",
      "habitat",
      "health",
      "productivity",
      "forecast",
      "predict",
      "because",
    ]) {
      expect(note).not.toContain(claim);
    }
  });
});

describe("land-cover legend wiring", () => {
  it("gives the categorical layer the guardrail every gradient layer has", () => {
    expect(LEGENDS.landcover.interpretationNote).toBe(landCoverLegendNote());
  });

  it("renders the note after the MCD12Q1 citation", () => {
    const provenance = legendProvenance("landcover");
    expect(provenance).not.toBeNull();
    expect(provenance?.label).toBe("MCD12Q1 v061");
    expect(provenance?.note).toBe(landCoverLegendNote());
  });

  it("leaves every vegetation and land layer carrying a guardrail", () => {
    // Terrain composes its own note from live coverage state, so the legend
    // deliberately does not build one for it. The four layers still without a
    // note (lst, sst, soil, aerosol) are other domains' captions to write;
    // pinned here so this set can only shrink, never quietly grow.
    const missing = (Object.keys(LEGENDS) as (keyof typeof LEGENDS)[]).filter(
      (id) => id !== "terrain" && !LEGENDS[id].interpretationNote
    );
    expect(missing).not.toContain("landcover");
    expect(missing).not.toContain("ndvi");
    expect(missing).not.toContain("evi");
    expect(missing).toEqual(["lst", "sst", "soil", "aerosol"]);
  });
});
