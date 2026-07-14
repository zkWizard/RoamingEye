import { describe, expect, it } from "vitest";
import { summarizeLandCoverContext } from "./landCover";
import { summarizeLandCoverComposition } from "./landCoverComposition";

describe("land-cover class-composition summaries", () => {
  it("computes richness, entropy, evenness, and dominance over informative shares", () => {
    const context = summarizeLandCoverContext(
      [
        { classCode: 1, sampleCount: 6 }, // Evergreen needleleaf forest
        { classCode: 10, sampleCount: 3 }, // Grassland
        { classCode: 17, sampleCount: 1 }, // Water
        { classCode: 255, sampleCount: 4 }, // Unclassified: excluded
        { classCode: null, sampleCount: 2 }, // No-data: excluded
      ],
      2024
    );

    const composition = summarizeLandCoverComposition(context);

    expect(composition.kind).toBe("observed-land-cover-class-composition");
    expect(composition.isForecast).toBe(false);
    expect(composition.status).toBe("available");
    expect(composition.reason).toBeNull();
    // Provenance is reused verbatim, never re-derived.
    expect(composition.provenance).toBe(context.provenance);

    const metrics = composition.metrics!;
    // Denominator is informative land cover only (6 + 3 + 1), not the 16 total.
    expect(metrics.knownLandCoverSampleCount).toBe(10);
    expect(metrics.classRichness).toBe(3);
    // H = -(0.6 ln0.6 + 0.3 ln0.3 + 0.1 ln0.1)
    expect(metrics.shannonEntropy).toBeCloseTo(0.8979457, 6);
    expect(metrics.shannonEntropyMax).toBeCloseTo(Math.log(3), 12);
    expect(metrics.pielouEvenness).toBeCloseTo(0.8173454, 6);
    // 1 - (0.6² + 0.3² + 0.1²) = 1 - 0.46
    expect(metrics.giniSimpsonIndex).toBeCloseTo(0.54, 12);
    expect(metrics.dominantClassFraction).toBeCloseTo(0.6, 12);
  });

  it("reports shares sorted by sample count with class-code tie-break", () => {
    const context = summarizeLandCoverContext(
      [
        { classCode: 12, sampleCount: 2 }, // Cropland
        { classCode: 4, sampleCount: 2 }, // Deciduous broadleaf forest
        { classCode: 8, sampleCount: 5 }, // Woody savanna
      ],
      2023
    );

    const composition = summarizeLandCoverComposition(context);

    expect(composition.classShares.map((entry) => entry.classCode)).toEqual([
      8, 4, 12,
    ]);
    expect(composition.classShares[0].fractionOfKnownLandCover).toBeCloseTo(
      5 / 9,
      12
    );
  });

  it("treats a single informative class as zero-entropy with undefined evenness", () => {
    const context = summarizeLandCoverContext(
      [
        { classCode: 12, sampleCount: 5 }, // Cropland
        { classCode: 255, sampleCount: 3 }, // Unclassified: excluded
      ],
      2022
    );

    const composition = summarizeLandCoverComposition(context);
    const metrics = composition.metrics!;

    expect(composition.status).toBe("available");
    expect(metrics.classRichness).toBe(1);
    expect(metrics.shannonEntropy).toBe(0);
    expect(metrics.shannonEntropyMax).toBe(0);
    // Evenness is undefined (0/0) for a lone class, not silently zero or one.
    expect(metrics.pielouEvenness).toBeNull();
    expect(metrics.giniSimpsonIndex).toBe(0);
    expect(metrics.dominantClassFraction).toBe(1);
  });

  it("withholds metrics when no informative land cover was sampled", () => {
    const context = summarizeLandCoverContext(
      [
        { classCode: 255, sampleCount: 4 }, // Unclassified
        { classCode: null, sampleCount: 2 }, // No-data
      ],
      2024
    );

    const composition = summarizeLandCoverComposition(context);

    expect(composition.status).toBe("no-data");
    expect(composition.metrics).toBeNull();
    expect(composition.reason).toBe("no-known-land-cover");
    expect(composition.classShares).toEqual([]);
    // Provenance survives even when the composition itself is unavailable.
    expect(composition.provenance.source).toBe(context.provenance.source);
  });

  it("never averages categorical class codes", () => {
    const context = summarizeLandCoverContext(
      [
        { classCode: 1, sampleCount: 1 },
        { classCode: 17, sampleCount: 1 },
      ],
      2024
    );

    const composition = summarizeLandCoverComposition(context);

    expect(JSON.stringify(composition)).not.toContain("meanClassCode");
    // Two equal classes: maximal evenness and Gini-Simpson of 0.5.
    expect(composition.metrics!.pielouEvenness).toBeCloseTo(1, 12);
    expect(composition.metrics!.giniSimpsonIndex).toBeCloseTo(0.5, 12);
  });
});
