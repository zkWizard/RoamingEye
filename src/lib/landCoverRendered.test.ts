import { describe, expect, it } from "vitest";
import { IGBP_RENDERED_PALETTE } from "./landCoverPalette";
import { summarizeRenderedLandCover } from "./landCoverRendered";

describe("summarizeRenderedLandCover", () => {
  it("decodes exact source colors and preserves year, geography, and provenance", () => {
    const summary = summarizeRenderedLandCover(
      [
        { pixel: IGBP_RENDERED_PALETTE[1], sampleCount: 2 },
        { pixel: IGBP_RENDERED_PALETTE[10] },
      ],
      2024,
      { kind: "selected-boundary", label: "drawn region" }
    );

    expect(summary.dataYear).toBe(2024);
    expect(summary.geography).toEqual({
      kind: "selected-boundary",
      label: "drawn region",
    });
    expect(summary.renderedCoverage).toEqual({
      countedSampleCount: 3,
      decodedSampleCount: 3,
      transparentSampleCount: 0,
      unmappedColorSampleCount: 0,
      invalidRecordCount: 0,
      decodedFraction: 1,
    });
    expect(summary.landCover.provenance).toMatchObject({
      layerId: "landcover",
      dataYear: 2024,
      cadence: "annual",
      classScheme: "IGBP",
      sourceResolution: "500 m",
      publicationStatus: "published",
    });
    expect(summary.landCover.dominantClass).toMatchObject({
      classCode: 1,
      label: "Evergreen needleleaf forest",
      sampleCount: 2,
    });
  });

  it("keeps transparent and unmapped colors unavailable instead of guessing classes", () => {
    const summary = summarizeRenderedLandCover(
      [
        { pixel: { r: 33, g: 138, b: 33, a: 0 }, sampleCount: 2 },
        { pixel: { r: 34, g: 138, b: 33 }, sampleCount: 3 },
        { pixel: IGBP_RENDERED_PALETTE[17] },
      ],
      2020,
      { kind: "point", latitude: 47.61, longitude: -122.33 }
    );

    expect(summary.renderedCoverage).toEqual({
      countedSampleCount: 6,
      decodedSampleCount: 1,
      transparentSampleCount: 2,
      unmappedColorSampleCount: 3,
      invalidRecordCount: 0,
      decodedFraction: 1 / 6,
    });
    expect(summary.landCover.coverage).toMatchObject({
      totalSampleCount: 6,
      knownLandCoverSampleCount: 1,
      noDataSampleCount: 5,
      knownLandCoverFraction: 1 / 6,
    });
    expect(summary.landCover.classCoverage).toHaveLength(1);
    expect(summary.landCover.classCoverage[0]).toMatchObject({
      classCode: 17,
      label: "Water",
    });
  });

  it("rejects invalid counts without adding them to imagery coverage", () => {
    const summary = summarizeRenderedLandCover(
      [
        { pixel: IGBP_RENDERED_PALETTE[10], sampleCount: 0 },
        { pixel: IGBP_RENDERED_PALETTE[10], sampleCount: 1.5 },
      ],
      2024,
      { kind: "selected-boundary", label: "search boundary" }
    );

    expect(summary.renderedCoverage).toEqual({
      countedSampleCount: 0,
      decodedSampleCount: 0,
      transparentSampleCount: 0,
      unmappedColorSampleCount: 0,
      invalidRecordCount: 2,
      decodedFraction: null,
    });
    expect(summary.landCover.coverage).toMatchObject({
      status: "no-data",
      reason: "no-samples",
      totalSampleCount: 0,
    });
  });

  it("preserves unpublished data-year state even when colors decode", () => {
    const summary = summarizeRenderedLandCover(
      [{ pixel: IGBP_RENDERED_PALETTE[5] }],
      2099,
      { kind: "point", latitude: 0, longitude: 0 }
    );

    expect(summary.landCover.provenance.publicationStatus).toBe(
      "outside-layer-range"
    );
    expect(summary.landCover.coverage.status).toBe("available");
  });
});
