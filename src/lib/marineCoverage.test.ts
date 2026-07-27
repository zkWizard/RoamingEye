import { describe, expect, it } from "vitest";
import {
  SEA_SURFACE_TEMPERATURE_COVERAGE_SOURCE,
  summarizeMarineCoverage,
} from "./marineCoverage";

describe("marine coverage summaries", () => {
  it("retains cited SST provenance, supplied coverage, and image dimensions", () => {
    const summary = summarizeMarineCoverage({
      dataMonth: { year: 2026, month: 3 },
      footprint: "water",
      validFraction: 0.74,
      sourceImageDimensions: { width: 2048, height: 1024 },
    });

    expect(summary).toMatchObject({
      kind: "sea-surface-temperature-coverage",
      marineBiologyObservation: false,
      isForecast: false,
      source: SEA_SURFACE_TEMPERATURE_COVERAGE_SOURCE,
      dataMonth: { year: 2026, month: 3 },
      coverage: {
        status: "water",
        footprint: "water",
        validFraction: 0.74,
        reason: null,
      },
      sourceImageMetadata: {
        status: "available",
        suppliedDimensions: { width: 2048, height: 1024 },
        dimensions: { width: 2048, height: 1024 },
        reason: null,
      },
      sourceImageDimensions: { width: 2048, height: 1024 },
    });
    expect(summary.accessibleText).toContain("74% of the supplied footprint");
    expect(summary.accessibleText).toContain(
      "not a marine-biology observation"
    );
  });

  it("makes coastal mixing and absent image dimensions visible", () => {
    const summary = summarizeMarineCoverage({
      dataMonth: { year: 2026, month: 3 },
      footprint: "coastal-or-land-mixed",
      validFraction: 0.31,
    });

    expect(summary.coverage).toEqual({
      status: "coastal-or-land-mixed",
      footprint: "coastal-or-land-mixed",
      validFraction: 0.31,
      reason: null,
    });
    expect(summary.sourceImageDimensions).toBeNull();
    expect(summary.sourceImageMetadata).toEqual({
      status: "not-supplied",
      suppliedDimensions: null,
      dimensions: null,
      reason: "dimensions-not-supplied",
    });
    expect(summary.accessibleText).toContain(
      "Source image dimensions were not supplied"
    );
  });

  it("distinguishes land and zero-SST coverage without a biological claim", () => {
    expect(
      summarizeMarineCoverage({
        dataMonth: { year: 2026, month: 3 },
        footprint: "land",
        validFraction: 0,
      }).coverage
    ).toEqual({
      status: "land",
      footprint: "land",
      validFraction: 0,
      reason: "land-footprint",
    });
    expect(
      summarizeMarineCoverage({
        dataMonth: { year: 2026, month: 3 },
        footprint: "water",
        validFraction: 0,
      }).coverage
    ).toEqual({
      status: "no-sst-coverage",
      footprint: "water",
      validFraction: 0,
      reason: "zero-sst-coverage",
    });
  });

  it("rejects invalid coverage while preserving invalid image metadata", () => {
    const summary = summarizeMarineCoverage({
      dataMonth: { year: 2026, month: 3 },
      footprint: "water",
      validFraction: 1.1,
      sourceImageDimensions: { width: 0, height: 1024 },
    });

    expect(summary.coverage).toEqual({
      status: "invalid",
      footprint: "water",
      validFraction: null,
      reason: "invalid-coverage",
    });
    expect(summary.sourceImageDimensions).toBeNull();
    expect(summary.sourceImageMetadata).toEqual({
      status: "invalid",
      suppliedDimensions: { width: 0, height: 1024 },
      dimensions: null,
      reason: "invalid-dimensions",
    });
    expect(summary.accessibleText).toContain(
      "Supplied source image dimensions are invalid (0 by 1024)"
    );
    expect(summary.accessibleText).not.toContain(
      "Source image dimensions were not supplied"
    );
  });
});
