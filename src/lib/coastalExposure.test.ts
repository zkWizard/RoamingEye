import { describe, expect, it } from "vitest";
import { summarizeLandCoverContext } from "./landCover";
import { summarizeMarineSurfaceContext } from "./marineSurfaceContext";
import {
  COASTAL_EXPOSURE_LIMITATIONS,
  COASTAL_EXPOSURE_THRESHOLDS,
  MINIMUM_COASTAL_EXPOSURE_CLASSIFIED_SAMPLES,
  describeCoastalExposure,
  summarizeCoastalExposure,
  type CoastalExposureClass,
} from "./coastalExposure";
import { MARINE_SURFACE_CONTEXT_SOURCE } from "./marineSurfaceContext";

/**
 * Build a graded coastal-exposure summary from raw IGBP sample counts. `water`
 * samples carry IGBP class 17; `other` samples carry class 12 (a non-water
 * classified class); `unclassified` samples carry class 255 and are excluded
 * from the classified-surface denominator.
 */
function exposureFrom(
  water: number,
  other: number,
  unclassified = 0,
  sstDataMonth = { year: 2024, month: 8 },
  contextYear = 2024
) {
  const classCoverage = [
    { classCode: 17, sampleCount: water },
    { classCode: 12, sampleCount: other },
    { classCode: 255, sampleCount: unclassified },
  ].filter((entry) => entry.sampleCount > 0);
  const context = summarizeMarineSurfaceContext({
    sstDataMonth,
    landCover: summarizeLandCoverContext(classCoverage, contextYear),
  });
  return summarizeCoastalExposure(context);
}

describe("coastal surface exposure", () => {
  it("grades an all-water footprint as open water", () => {
    const summary = exposureFrom(40, 0);

    expect(summary).toMatchObject({
      kind: "observed-coastal-surface-exposure",
      isCoastlineDistance: false,
      marineBiologyObservation: false,
      isForecast: false,
      claimScope: "descriptive-surface-water-share-only",
      source: MARINE_SURFACE_CONTEXT_SOURCE,
      sstDataMonth: { year: 2024, month: 8 },
      contextDataYear: 2024,
      status: "graded",
      exposureClass: "open-water",
      waterSurfaceFraction: 1,
      classifiedSurfaceSampleCount: 40,
      igbpWaterSampleCount: 40,
      otherIgbpClassSampleCount: 0,
    });
  });

  it("excludes unclassified samples from the water-share denominator", () => {
    // 18 water + 2 other classified; 30 unclassified samples are ignored.
    const summary = exposureFrom(18, 2, 30);

    expect(summary.classifiedSurfaceSampleCount).toBe(20);
    expect(summary.waterSurfaceFraction).toBeCloseTo(0.9, 10);
    expect(summary.exposureClass).toBe("predominantly-water");
  });

  it("names each band across the water-share gradient", () => {
    const cases: Array<{
      water: number;
      other: number;
      expected: CoastalExposureClass;
    }> = [
      { water: 0, other: 20, expected: "land-only" },
      { water: 2, other: 18, expected: "predominantly-land" },
      { water: 10, other: 10, expected: "coastal-mixed" },
      { water: 16, other: 4, expected: "predominantly-water" },
      { water: 20, other: 0, expected: "open-water" },
    ];
    for (const { water, other, expected } of cases) {
      expect(exposureFrom(water, other).exposureClass).toBe(expected);
    }
  });

  it("places values exactly on a threshold in the higher band", () => {
    // Water share exactly at each inclusive cut point.
    const openWater = exposureFrom(
      Math.round(COASTAL_EXPOSURE_THRESHOLDS.openWater * 100),
      100 - Math.round(COASTAL_EXPOSURE_THRESHOLDS.openWater * 100)
    );
    expect(openWater.waterSurfaceFraction).toBeCloseTo(
      COASTAL_EXPOSURE_THRESHOLDS.openWater,
      10
    );
    expect(openWater.exposureClass).toBe("open-water");

    const coastalEdge = exposureFrom(
      Math.round(COASTAL_EXPOSURE_THRESHOLDS.coastalMixed * 100),
      100 - Math.round(COASTAL_EXPOSURE_THRESHOLDS.coastalMixed * 100)
    );
    expect(coastalEdge.waterSurfaceFraction).toBeCloseTo(
      COASTAL_EXPOSURE_THRESHOLDS.coastalMixed,
      10
    );
    expect(coastalEdge.exposureClass).toBe("coastal-mixed");
  });

  it("keeps a water share but declines to grade a too-sparse footprint", () => {
    const summary = exposureFrom(3, 1); // 4 classified < floor of 8

    expect(MINIMUM_COASTAL_EXPOSURE_CLASSIFIED_SAMPLES).toBe(8);
    expect(summary.status).toBe("insufficient-classified-surface");
    expect(summary.exposureClass).toBeNull();
    expect(summary.waterSurfaceFraction).toBeCloseTo(0.75, 10);
  });

  it("reports no classified surface when none is supplied", () => {
    const summary = exposureFrom(0, 0, 12); // only unclassified samples

    expect(summary.status).toBe("no-classified-surface");
    expect(summary.exposureClass).toBeNull();
    expect(summary.waterSurfaceFraction).toBeNull();
    expect(summary.classifiedSurfaceSampleCount).toBe(0);
  });

  it("writes a provenance-tagged, band-honest sentence", () => {
    const graded = describeCoastalExposure(exposureFrom(18, 2, 30));
    expect(graded).toContain("Coastal surface exposure for the SST footprint");
    expect(graded).toContain("90% of the 20 classified surface samples");
    expect(graded).toContain("predominantly water");
    expect(graded).toContain(
      `Source: ${MARINE_SURFACE_CONTEXT_SOURCE.source.shortName} v${MARINE_SURFACE_CONTEXT_SOURCE.source.version}`
    );
    expect(graded).toContain("not a coastline");
  });

  it("states insufficient and missing surface context honestly", () => {
    const sparse = describeCoastalExposure(exposureFrom(3, 1));
    expect(sparse).toContain("below the 8-sample floor");
    expect(sparse).toContain("not graded");

    const none = describeCoastalExposure(exposureFrom(0, 0, 5));
    expect(none).toContain("no classified IGBP surface samples");
  });

  it("names an invalid SST month without inventing one", () => {
    const summary = exposureFrom(20, 0, 0, { year: 2024, month: 13 });
    expect(describeCoastalExposure(summary)).toContain("an invalid month");
  });

  it("documents its limitations for provenance-first consumers", () => {
    expect(COASTAL_EXPOSURE_LIMITATIONS.length).toBeGreaterThanOrEqual(3);
    expect(
      COASTAL_EXPOSURE_LIMITATIONS.some((line) => line.includes("coastline"))
    ).toBe(true);
  });
});
