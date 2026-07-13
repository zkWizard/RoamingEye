import { describe, expect, it } from "vitest";
import { summarizeLandCoverContext } from "./landCover";
import {
  MARINE_SURFACE_CONTEXT_SOURCE,
  summarizeMarineSurfaceContext,
} from "./marineSurfaceContext";

describe("marine surface context summaries", () => {
  it("retains annual IGBP water context alongside a separate SST month", () => {
    const summary = summarizeMarineSurfaceContext({
      sstDataMonth: { year: 2024, month: 8 },
      landCover: summarizeLandCoverContext(
        [
          { classCode: 17, sampleCount: 6 },
          { classCode: 12, sampleCount: 2 },
          { classCode: null, sampleCount: 2 },
        ],
        2024
      ),
    });

    expect(summary).toMatchObject({
      kind: "observed-igbp-surface-context",
      seaSurfaceTemperatureObservation: false,
      marineBiologyObservation: false,
      isForecast: false,
      source: MARINE_SURFACE_CONTEXT_SOURCE,
      sstDataMonth: { year: 2024, month: 8 },
      contextDataYear: 2024,
      timing: "same-calendar-year",
      sourcePublicationStatus: "published",
      coverage: {
        status: "mixed-igbp-water-and-other-classes",
        totalSampleCount: 10,
        classifiedSurfaceSampleCount: 8,
        igbpWaterSampleCount: 6,
        otherIgbpClassSampleCount: 2,
        noDataSampleCount: 2,
        classifiedSurfaceFraction: 0.8,
        reason: null,
      },
    });
  });

  it("keeps water-only and other-class-only boundaries distinct", () => {
    const waterOnly = summarizeMarineSurfaceContext({
      sstDataMonth: { year: 2025, month: 1 },
      landCover: summarizeLandCoverContext(
        [{ classCode: 17, sampleCount: 4 }],
        2024
      ),
    });
    const otherOnly = summarizeMarineSurfaceContext({
      sstDataMonth: { year: 2025, month: 1 },
      landCover: summarizeLandCoverContext(
        [{ classCode: 11, sampleCount: 4 }],
        2024
      ),
    });

    expect(waterOnly.coverage.status).toBe("igbp-water-only");
    expect(otherOnly.coverage.status).toBe("other-igbp-classes-only");
    expect(waterOnly.timing).toBe("different-calendar-year");
  });

  it("preserves absent, unclassified, and invalid source coverage as unknown", () => {
    const summary = summarizeMarineSurfaceContext({
      sstDataMonth: { year: 2024, month: 4 },
      landCover: summarizeLandCoverContext(
        [
          { classCode: 255, sampleCount: 3 },
          { classCode: null, sampleCount: 2 },
          { classCode: 99, sampleCount: 1 },
        ],
        2024
      ),
    });

    expect(summary.coverage).toMatchObject({
      status: "unknown",
      totalSampleCount: 6,
      classifiedSurfaceSampleCount: 0,
      igbpWaterSampleCount: 0,
      otherIgbpClassSampleCount: 0,
      unclassifiedSampleCount: 3,
      noDataSampleCount: 2,
      invalidClassSampleCount: 1,
      invalidRecordCount: 1,
      classifiedSurfaceFraction: 0,
      reason: "no-classified-surface-samples",
    });
  });

  it("reports invalid SST timing without changing the supplied surface context", () => {
    const summary = summarizeMarineSurfaceContext({
      sstDataMonth: { year: 2024, month: 13 },
      landCover: summarizeLandCoverContext([{ classCode: 17 }], 2024),
    });

    expect(summary.timing).toBe("invalid-sst-month");
    expect(summary.coverage.status).toBe("igbp-water-only");
  });
});
