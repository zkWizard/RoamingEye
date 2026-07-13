import { describe, expect, it } from "vitest";
import { LAND_COVER_SOURCE } from "./landCover";
import {
  LAND_COVER_TRANSITION_LIMITATIONS,
  summarizeLandCoverTransitions,
} from "./landCoverTransition";

describe("land-cover transition summaries", () => {
  it("counts co-located from->to class-code pairs with MCD12Q1 provenance", () => {
    const summary = summarizeLandCoverTransitions(
      [
        { fromClassCode: 12, toClassCode: 12, sampleCount: 5 }, // stable cropland
        { fromClassCode: 12, toClassCode: 13, sampleCount: 3 }, // cropland -> urban
        { fromClassCode: 10, toClassCode: 12, sampleCount: 2 }, // grassland -> cropland
      ],
      2018,
      2024
    );

    expect(summary).toMatchObject({
      kind: "observed-class-coded-land-cover-transition",
      isChangeDetection: false,
      isForecast: false,
      provenance: {
        layerId: "landcover",
        fromYear: 2018,
        toYear: 2024,
        cadence: "annual",
        classScheme: "IGBP",
        sourceResolution: "500 m",
        fromPublicationStatus: "published",
        toPublicationStatus: "published",
        bothYearsPublished: true,
      },
      coverage: {
        status: "available",
        totalSampleCount: 10,
        bothClassifiedSampleCount: 10,
        partiallyClassifiedSampleCount: 0,
        noDataSampleCount: 0,
        invalidClassSampleCount: 0,
        invalidRecordCount: 0,
        bothClassifiedFraction: 1,
        reason: null,
      },
      stableSampleCount: 5,
      changedSampleCount: 5,
    });
    expect(summary.provenance.source).toBe(LAND_COVER_SOURCE);
    expect(summary.limitations).toBe(LAND_COVER_TRANSITION_LIMITATIONS);
  });

  it("sorts transitions by frequency and reports the dominant differing pair", () => {
    const summary = summarizeLandCoverTransitions(
      [
        { fromClassCode: 1, toClassCode: 1, sampleCount: 9 },
        { fromClassCode: 5, toClassCode: 10, sampleCount: 4 },
        { fromClassCode: 5, toClassCode: 12, sampleCount: 4 },
        { fromClassCode: 8, toClassCode: 9, sampleCount: 2 },
      ],
      2015,
      2016
    );

    expect(
      summary.transitions.map((t) => `${t.fromClassCode}->${t.toClassCode}`)
    ).toEqual([
      "1->1",
      "5->10", // tie broken by lower fromClassCode then toClassCode
      "5->12",
      "8->9",
    ]);
    // Most frequent pair (1->1) is stable, so the dominant CHANGE skips it.
    expect(summary.dominantChange).toMatchObject({
      fromClassCode: 5,
      toClassCode: 10,
      isStable: false,
      sampleCount: 4,
    });
    expect(summary.transitions[0]).toMatchObject({
      fromLabel: "Evergreen needleleaf forest",
      isStable: true,
      fractionOfBothClassified: 9 / 19,
    });
  });

  it("treats source-unclassified (255) and no code as unpaired, never as a transition", () => {
    const summary = summarizeLandCoverTransitions(
      [
        { fromClassCode: 12, toClassCode: 255, sampleCount: 3 }, // partial (255 not a type)
        { fromClassCode: 255, toClassCode: 255, sampleCount: 2 }, // no-data pair
        { fromClassCode: null, toClassCode: 10, sampleCount: 4 }, // partial
        { fromClassCode: null, toClassCode: null, sampleCount: 1 }, // no-data pair
      ],
      2010,
      2011
    );

    expect(summary.coverage).toMatchObject({
      status: "no-data",
      totalSampleCount: 10,
      bothClassifiedSampleCount: 0,
      partiallyClassifiedSampleCount: 7,
      noDataSampleCount: 3,
      reason: "no-both-classified",
    });
    expect(summary.transitions).toEqual([]);
    expect(summary.dominantChange).toBeNull();
  });

  it("rejects invalid class codes and non-positive sample counts explicitly", () => {
    const summary = summarizeLandCoverTransitions(
      [
        { fromClassCode: 12, toClassCode: 99, sampleCount: 5 }, // 99 outside IGBP
        { fromClassCode: 4.5, toClassCode: 10, sampleCount: 2 }, // non-integer code
        { fromClassCode: 10, toClassCode: 12, sampleCount: 0 }, // bad count
        { fromClassCode: 10, toClassCode: 12, sampleCount: 6 }, // valid
      ],
      2020,
      2021
    );

    expect(summary.coverage).toMatchObject({
      totalSampleCount: 13,
      bothClassifiedSampleCount: 6,
      invalidClassSampleCount: 7,
      invalidRecordCount: 3,
    });
    expect(summary.changedSampleCount).toBe(6);
    expect(summary.transitions).toHaveLength(1);
  });

  it("flags years outside the published MCD12Q1 layer range", () => {
    const summary = summarizeLandCoverTransitions(
      [{ fromClassCode: 12, toClassCode: 10, sampleCount: 1 }],
      2000, // before layer start (2001)
      2024
    );

    expect(summary.provenance).toMatchObject({
      fromPublicationStatus: "outside-layer-range",
      toPublicationStatus: "published",
      bothYearsPublished: false,
    });
  });

  it("reports no samples honestly for an empty input", () => {
    const summary = summarizeLandCoverTransitions([], 2019, 2020);

    expect(summary.coverage).toMatchObject({
      status: "no-data",
      totalSampleCount: 0,
      bothClassifiedFraction: null,
      reason: "no-samples",
    });
    expect(summary.stableSampleCount).toBe(0);
    expect(summary.changedSampleCount).toBe(0);
  });
});
