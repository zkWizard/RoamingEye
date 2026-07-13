import { describe, expect, it } from "vitest";
import {
  IGBP_LAND_COVER_CLASSES,
  LAND_COVER_SOURCE,
  summarizeLandCoverContext,
} from "./landCover";

describe("land-cover context summaries", () => {
  it("counts IGBP classes and retains MCD12Q1 provenance without averaging codes", () => {
    const summary = summarizeLandCoverContext(
      [
        { classCode: 12, sampleCount: 4 },
        { classCode: 13, sampleCount: 2 },
        { classCode: 17, sampleCount: 1 },
        { classCode: null, sampleCount: 2 },
        { classCode: 99, sampleCount: 1 },
      ],
      2024
    );

    expect(summary).toMatchObject({
      kind: "observed-class-coded-land-cover",
      isForecast: false,
      provenance: {
        layerId: "landcover",
        wmsLayer: "MODIS_Combined_L3_IGBP_Land_Cover_Type_Annual",
        dataYear: 2024,
        cadence: "annual",
        classScheme: "IGBP",
        sourceResolution: "500 m",
        source: LAND_COVER_SOURCE,
        publicationStatus: "published",
      },
      coverage: {
        status: "available",
        totalSampleCount: 10,
        knownLandCoverSampleCount: 7,
        noDataSampleCount: 2,
        invalidClassSampleCount: 1,
        invalidRecordCount: 1,
        knownLandCoverFraction: 0.7,
        reason: null,
      },
      dominantClass: {
        classCode: 12,
        label: "Cropland",
        sampleCount: 4,
        fractionOfAllSamples: 0.4,
        fractionOfSourceClassSamples: 4 / 7,
      },
    });
    expect(summary.classCoverage.map((entry) => entry.classCode)).toEqual([
      12, 13, 17,
    ]);
    expect(summary).not.toHaveProperty("meanClassCode");
    expect(JSON.stringify(summary)).not.toContain("mean");
  });

  it("keeps source unclassified pixels separate from no-data and informative classes", () => {
    const summary = summarizeLandCoverContext(
      [
        { classCode: 255, sampleCount: 3 },
        { classCode: null, sampleCount: 2 },
      ],
      2024
    );

    expect(summary.coverage).toMatchObject({
      status: "no-data",
      totalSampleCount: 5,
      knownLandCoverSampleCount: 0,
      unclassifiedSampleCount: 3,
      noDataSampleCount: 2,
      knownLandCoverFraction: 0,
      reason: "no-known-land-cover",
    });
    expect(summary.classCoverage).toEqual([
      {
        classCode: 255,
        label: "Unclassified",
        sampleCount: 3,
        fractionOfAllSamples: 3 / 5,
        fractionOfSourceClassSamples: 1,
        isInformativeLandCover: false,
      },
    ]);
    expect(summary.dominantClass).toBeNull();
  });

  it("reports no-data and invalid-year outcomes explicitly", () => {
    const summary = summarizeLandCoverContext(
      [{ classCode: 12, sampleCount: 0 }],
      2024.5
    );

    expect(summary.provenance.publicationStatus).toBe("invalid-year");
    expect(summary.coverage).toEqual({
      status: "no-data",
      totalSampleCount: 0,
      knownLandCoverSampleCount: 0,
      unclassifiedSampleCount: 0,
      noDataSampleCount: 0,
      invalidClassSampleCount: 0,
      invalidRecordCount: 1,
      knownLandCoverFraction: null,
      reason: "no-samples",
    });
    expect(summary.classCoverage).toEqual([]);
    expect(summary.dominantClass).toBeNull();
  });

  it("exposes the complete IGBP contract including unclassified source pixels", () => {
    expect(IGBP_LAND_COVER_CLASSES).toHaveLength(18);
    expect(IGBP_LAND_COVER_CLASSES.map((entry) => entry.code)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 255,
    ]);
  });
});
