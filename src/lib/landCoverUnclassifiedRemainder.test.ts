import { describe, expect, it } from "vitest";
import {
  landCoverPixels,
  landCoverUnclassifiedReasons,
  landCoverUnclassifiedRemainder,
} from "./landCoverUnclassifiedRemainder";
import type { LandCoverContextSummary } from "./landCover";

type Coverage = LandCoverContextSummary["coverage"];

function coverage(overrides: Partial<Coverage> = {}): Coverage {
  return {
    totalSampleCount: 0,
    knownLandCoverSampleCount: 0,
    unclassifiedSampleCount: 0,
    noDataSampleCount: 0,
    invalidClassSampleCount: 0,
    aliasedSourceValueSampleCount: 0,
    ...overrides,
  } as Coverage;
}

describe("landCoverUnclassifiedReasons", () => {
  it("omits reasons that took no pixels", () => {
    const reasons = landCoverUnclassifiedReasons(
      coverage({
        totalSampleCount: 25,
        knownLandCoverSampleCount: 20,
        unclassifiedSampleCount: 5,
      })
    );
    expect(reasons).toEqual([{ sampleCount: 5, text: "source-unclassified" }]);
  });

  it("keeps the source's own answer and this app's decode failure apart", () => {
    const reasons = landCoverUnclassifiedReasons(
      coverage({
        totalSampleCount: 25,
        knownLandCoverSampleCount: 18,
        unclassifiedSampleCount: 4,
        noDataSampleCount: 3,
      })
    );
    expect(reasons.map((reason) => reason.text)).toEqual([
      "source-unclassified",
      "with no usable colour",
    ]);
  });

  it("accounts for exactly the shortfall in classified pixels", () => {
    const sample = coverage({
      totalSampleCount: 780,
      knownLandCoverSampleCount: 512,
      unclassifiedSampleCount: 200,
      noDataSampleCount: 60,
      invalidClassSampleCount: 8,
    });
    const summed = landCoverUnclassifiedReasons(sample).reduce(
      (total, reason) => total + reason.sampleCount,
      0
    );
    expect(summed).toBe(
      sample.totalSampleCount - sample.knownLandCoverSampleCount
    );
  });
});

describe("landCoverUnclassifiedRemainder", () => {
  it("stays silent when every sampled pixel carried an informative class", () => {
    expect(
      landCoverUnclassifiedRemainder(
        coverage({ totalSampleCount: 25, knownLandCoverSampleCount: 25 })
      )
    ).toBe("");
  });

  it("names the single reason without printing its count twice", () => {
    expect(
      landCoverUnclassifiedRemainder(
        coverage({
          totalSampleCount: 780,
          knownLandCoverSampleCount: 512,
          unclassifiedSampleCount: 268,
        })
      )
    ).toBe("the other 268 pixels source-unclassified");
  });

  it("breaks a mixed remainder down by reason", () => {
    expect(
      landCoverUnclassifiedRemainder(
        coverage({
          totalSampleCount: 25,
          knownLandCoverSampleCount: 18,
          unclassifiedSampleCount: 4,
          noDataSampleCount: 3,
        })
      )
    ).toBe(
      "the other 7 pixels: 4 source-unclassified, 3 with no usable colour"
    );
  });

  it("sums the printed total from the printed parts, so the two cannot disagree", () => {
    const text = landCoverUnclassifiedRemainder(
      coverage({
        totalSampleCount: 100,
        knownLandCoverSampleCount: 70,
        unclassifiedSampleCount: 12,
        noDataSampleCount: 11,
        invalidClassSampleCount: 7,
      })
    );
    expect(text).toContain("the other 30 pixels:");
    expect(12 + 11 + 7).toBe(30);
  });

  it("reads a one-pixel remainder as a count, not as a plural", () => {
    expect(
      landCoverUnclassifiedRemainder(
        coverage({
          totalSampleCount: 25,
          knownLandCoverSampleCount: 24,
          noDataSampleCount: 1,
        })
      )
    ).toBe("the other 1 pixel with no usable colour");
  });
});

describe("landCoverPixels", () => {
  it("singularises one pixel only", () => {
    expect(landCoverPixels(1)).toBe("1 pixel");
    expect(landCoverPixels(0)).toBe("0 pixels");
    expect(landCoverPixels(2)).toBe("2 pixels");
  });
});
