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
      geography: { kind: "boundary", label: "Monterey County" },
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
        sampleCounts: null,
        reason: null,
      },
      sourceImageDimensions: { width: 2048, height: 1024 },
      sourceImageDimensionsStatus: "supplied",
      geography: { kind: "boundary", label: "Monterey County" },
    });
    expect(summary.accessibleText).toContain("74% of the supplied footprint");
    expect(summary.accessibleText).toContain(
      "not a marine-biology observation"
    );
    expect(summary.accessibleText).toContain("boundary “Monterey County”");
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
      sampleCounts: null,
      reason: null,
    });
    expect(summary.sourceImageDimensions).toBeNull();
    expect(summary.sourceImageDimensionsStatus).toBe("not-supplied");
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
      sampleCounts: null,
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
      sampleCounts: null,
      reason: "zero-sst-coverage",
    });
  });

  it("rejects invalid coverage and exposes invalid image dimensions", () => {
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
      sampleCounts: null,
      reason: "invalid-coverage",
    });
    expect(summary.sourceImageDimensions).toBeNull();
    expect(summary.sourceImageDimensionsStatus).toBe("invalid");
    expect(summary.accessibleText).toContain(
      "Supplied source image dimensions were invalid"
    );
  });

  it("preserves native sample counts and derives coverage when no fraction is supplied", () => {
    const summary = summarizeMarineCoverage({
      dataMonth: { year: 2026, month: 3 },
      footprint: "coastal-or-land-mixed",
      sampleCounts: { usable: 31, total: 100 },
    });

    expect(summary.coverage).toEqual({
      status: "coastal-or-land-mixed",
      footprint: "coastal-or-land-mixed",
      validFraction: 0.31,
      sampleCounts: { usable: 31, total: 100 },
      reason: null,
    });
    expect(summary.accessibleText).toContain("31% of the supplied footprint");
  });

  it("rejects impossible counts and inconsistent fraction metadata", () => {
    expect(
      summarizeMarineCoverage({
        dataMonth: { year: 2026, month: 3 },
        footprint: "water",
        sampleCounts: { usable: 11, total: 10 },
      }).coverage
    ).toEqual({
      status: "invalid",
      footprint: "water",
      validFraction: null,
      sampleCounts: null,
      reason: "invalid-sample-counts",
    });

    expect(
      summarizeMarineCoverage({
        dataMonth: { year: 2026, month: 3 },
        footprint: "water",
        validFraction: 0.5,
        sampleCounts: { usable: 4, total: 10 },
      }).coverage
    ).toEqual({
      status: "invalid",
      footprint: "water",
      validFraction: null,
      sampleCounts: { usable: 4, total: 10 },
      reason: "inconsistent-sample-coverage",
    });
  });

  it("reports an explicitly empty native sample set as no SST coverage", () => {
    expect(
      summarizeMarineCoverage({
        dataMonth: { year: 2026, month: 3 },
        footprint: "water",
        sampleCounts: { usable: 0, total: 0 },
      }).coverage
    ).toEqual({
      status: "no-sst-coverage",
      footprint: "water",
      validFraction: null,
      sampleCounts: { usable: 0, total: 0 },
      reason: "zero-sst-coverage",
    });
  });

  it("preserves unsupported footprint geography as invalid metadata", () => {
    const summary = summarizeMarineCoverage({
      dataMonth: { year: 2026, month: 3 },
      footprint: "reef" as "water",
      validFraction: 0.8,
      sourceImageDimensions: { width: 2048, height: 1024 },
    });

    expect(summary.coverage).toEqual({
      status: "invalid",
      footprint: "reef",
      validFraction: 0.8,
      // No counts were supplied, so none are invented for the rejected label.
      sampleCounts: null,
      reason: "invalid-footprint",
    });
    expect(summary.sourceImageDimensions).toEqual({
      width: 2048,
      height: 1024,
    });
    expect(summary.accessibleText).toContain("Coverage metadata is invalid.");
    expect(summary.accessibleText).toContain(
      "not a marine-biology observation"
    );
  });

  it("withholds invalid sampling geography instead of mislabeling coverage", () => {
    const summary = summarizeMarineCoverage({
      dataMonth: { year: 2026, month: 3 },
      footprint: "water",
      validFraction: 0.8,
      geography: { kind: "boundary", label: "   " },
    });

    expect(summary.geography).toBeNull();
    expect(summary.coverage).toEqual({
      status: "invalid",
      footprint: "water",
      validFraction: 0.8,
      sampleCounts: null,
      reason: "invalid-geography",
    });
    expect(summary.accessibleText).toContain("Coverage metadata is invalid");
  });
});
