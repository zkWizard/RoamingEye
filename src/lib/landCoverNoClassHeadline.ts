import type { LandCoverContextSummary } from "./landCover";

/**
 * Headline a land-cover sample that produced no informative class, scoped to
 * what was actually read rather than to the ground.
 *
 * "No IGBP land-cover class here" is a claim about the ground, and most of the
 * ways this branch is reached never observed the ground at all. A sample taken
 * where the rendered map is transparent yields pixels the palette cannot decode
 * (landCoverPalette.ts declines an inexact match rather than inventing a source
 * class), and an empty sample observed nothing whatsoever — yet both would read
 * as MCD12Q1 having found no land cover. Only source class 255 is the product's
 * own answer, and even that says MCD12Q1 declined to assign a class, not that
 * the ground carries none.
 *
 * So the headline names the sample: nothing sampled, nothing decodable, or
 * source-unclassified across every pixel this app could read. The mixed case —
 * some pixels source-unclassified, some undecodable — takes the last form,
 * which stays true because it is scoped to the pixels that were read; the
 * detail beneath it breaks the remainder down by reason.
 *
 * Shared by the point and drawn-region readings so the two land-cover surfaces
 * make the same disclosure in the same words.
 */
export function noKnownLandCoverHeadline(
  coverage: LandCoverContextSummary["coverage"]
): string {
  if (coverage.totalSampleCount === 0) {
    return "No land-cover pixels sampled here";
  }
  const undecoded =
    coverage.noDataSampleCount + coverage.invalidClassSampleCount;
  if (undecoded === coverage.totalSampleCount) {
    return "No sampled pixel carried a readable land-cover colour";
  }
  return "Source-unclassified in every land-cover pixel read here";
}
