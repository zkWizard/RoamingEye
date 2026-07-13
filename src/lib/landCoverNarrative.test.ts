import { describe, expect, it } from "vitest";
import { summarizeLandCoverContext } from "./landCover";
import { describeLandCoverObservation } from "./landCoverNarrative";

describe("land-cover observation narratives", () => {
  it("reports class-code frequency, selected-boundary coverage, and MCD12Q1 provenance", () => {
    const narrative = describeLandCoverObservation(
      summarizeLandCoverContext(
        [
          { classCode: 12, sampleCount: 4 },
          { classCode: 13, sampleCount: 2 },
          { classCode: 255, sampleCount: 1 },
          { classCode: null, sampleCount: 2 },
          { classCode: 99, sampleCount: 1 },
        ],
        2024
      )
    );

    expect(narrative).toMatchObject({
      kind: "land-cover-observation-narrative",
      isInterpretation: false,
      headline: "Most frequent observed class: Cropland",
      provenance: {
        dataYear: 2024,
        publicationStatus: "published",
        geographicCoverage: "selected-boundary samples",
        nativeValue: "IGBP LC_Type1 class code (categorical; no physical unit)",
        sourceLabel:
          "MCD12Q1 v061 — MODIS Land Cover Type Yearly L3 Global 500m",
        sourceUrl: "https://doi.org/10.5067/MODIS/MCD12Q1.061",
        wmsLayer: "MODIS_Combined_L3_IGBP_Land_Cover_Type_Annual",
        sourceResolution: "500 m",
      },
      coverage: {
        knownLandCoverFraction: 0.6,
        unclassifiedSampleCount: 1,
        noDataSampleCount: 2,
        invalidClassSampleCount: 1,
      },
    });
    expect(narrative.detail).toBe(
      "Cropland occurred in 4 of 10 counted selected-boundary samples (40%). Known IGBP classes occurred in 6 of 10 counted samples (60%). 1 counted sample was source-unclassified. 2 counted samples had no usable code. 1 counted sample was outside the IGBP source-class contract. 1 supplied records were rejected."
    );
    expect(narrative.limitations.join(" ")).toMatch(
      /does not infer biodiversity, biomass, habitat quality, ecosystem health, causes, or forecasts/i
    );
  });

  it("makes missing source classes explicit instead of inventing a land-cover conclusion", () => {
    const narrative = describeLandCoverObservation(
      summarizeLandCoverContext(
        [
          { classCode: 255, sampleCount: 2 },
          { classCode: null, sampleCount: 1 },
        ],
        2024
      )
    );

    expect(narrative.headline).toBe("No known IGBP class observed for 2024");
    expect(narrative.detail).toBe(
      "Known IGBP classes occurred in 0 of 3 counted samples (0%). 2 counted samples were source-unclassified. 1 counted sample had no usable code."
    );
  });

  it("does not present out-of-range or invalid annual records as published observations", () => {
    const outsideRange = describeLandCoverObservation(
      summarizeLandCoverContext([{ classCode: 12 }], 2025)
    );
    const invalidYear = describeLandCoverObservation(
      summarizeLandCoverContext([{ classCode: 12 }], 2024.5)
    );

    expect(outsideRange.headline).toBe(
      "Land-cover record not published for 2025"
    );
    expect(outsideRange.detail).toContain("outside the published layer range");
    expect(invalidYear.headline).toBe(
      "Land-cover record not published for 2024.5"
    );
    expect(invalidYear.detail).toContain("not a whole calendar year");
  });
});
