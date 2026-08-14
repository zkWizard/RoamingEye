import { describe, expect, it } from "vitest";
import { summarizeLandCoverContext } from "./landCover";
import { noKnownLandCoverHeadline } from "./landCoverNoClassHeadline";

/** Coverage for a sample of decoded IGBP codes; null = no usable colour. */
function coverage(codes: (number | null)[]) {
  return summarizeLandCoverContext(
    codes.map((classCode) => ({ classCode })),
    2024
  ).coverage;
}

describe("noKnownLandCoverHeadline", () => {
  it("says nothing was sampled when the sample is empty", () => {
    expect(noKnownLandCoverHeadline(coverage([]))).toBe(
      "No land-cover pixels sampled here"
    );
  });

  it("blames the render when no sampled pixel decoded", () => {
    expect(noKnownLandCoverHeadline(coverage([null, null, null]))).toBe(
      "No sampled pixel carried a readable land-cover colour"
    );
  });

  it("counts out-of-contract codes as undecoded, not as absent cover", () => {
    // A code outside 0..17/255 means the decode produced something the IGBP
    // contract rejects — still a failure to read, never a statement about
    // what grows there.
    expect(noKnownLandCoverHeadline(coverage([42, 99]))).toBe(
      "No sampled pixel carried a readable land-cover colour"
    );
  });

  it("reports source class 255 as the product declining to classify", () => {
    expect(noKnownLandCoverHeadline(coverage([255, 255, 255]))).toBe(
      "Source-unclassified in every land-cover pixel read here"
    );
  });

  it("keeps the mixed case scoped to the pixels that were read", () => {
    // Some 255, some undecodable: the claim stays true because it describes
    // the pixels read rather than the ground.
    const headline = noKnownLandCoverHeadline(coverage([255, null, 42]));

    expect(headline).toBe(
      "Source-unclassified in every land-cover pixel read here"
    );
    expect(headline).not.toContain("No IGBP land-cover class");
  });

  it("never asserts the ground carries no land cover", () => {
    for (const codes of [[], [null], [255], [42], [255, null]]) {
      expect(noKnownLandCoverHeadline(coverage(codes))).not.toMatch(
        /No (IGBP )?land[- ]cover class/
      );
    }
  });
});
