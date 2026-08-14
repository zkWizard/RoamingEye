import type { LandCoverContextSummary } from "./landCover";

/**
 * Why the sampled pixels that carry no IGBP class did not get one, in source
 * order, omitting reasons that took no pixels.
 *
 * Every counted sample lands in exactly one of four buckets
 * (`summarizeLandCoverContext`): an informative class 1..17, source class 255,
 * no usable code, or a code outside the IGBP contract. These are the three that
 * are not informative land cover, so together they always account for exactly
 * `totalSampleCount - knownLandCoverSampleCount`.
 *
 * The two kinds are not the same kind of fact. Source-unclassified pixels are
 * MCD12Q1's own answer for that ground — the product looked and declined to
 * assign a class. Pixels with no usable colour are this app failing to read the
 * rendered map: an exact palette match was not found, so nothing was counted
 * (see landCoverPalette.ts — a nearest-colour match would invent a class the
 * source never assigned). A sample that is 80% classified because the product
 * says "unclassified" and one that is 80% classified because a fifth of the
 * sample could not be decoded are the same number and different observations,
 * and only the second is a reason to distrust the classes beside it.
 *
 * Shared by the point and drawn-region readings so the two land-cover surfaces
 * bucket the shortfall identically and cannot drift apart, the same reason
 * {@link noKnownLandCoverHeadline} is shared.
 */
export function landCoverUnclassifiedReasons(
  coverage: LandCoverContextSummary["coverage"]
): { sampleCount: number; text: string }[] {
  return [
    {
      sampleCount: coverage.unclassifiedSampleCount,
      text: "source-unclassified",
    },
    { sampleCount: coverage.noDataSampleCount, text: "with no usable colour" },
    {
      sampleCount: coverage.invalidClassSampleCount,
      text: "outside the IGBP class contract",
    },
  ].filter((reason) => reason.sampleCount > 0);
}

/**
 * The unclassified remainder of a sample that DID yield a class, named with the
 * reason each pixel carries none — "the other 268 pixels source-unclassified".
 *
 * A count of classified pixels states the shortfall but not its cause, which is
 * the distinction {@link landCoverUnclassifiedReasons} exists to preserve. The
 * unavailable branches of both readings already name these reasons; this states
 * them on the branches that DO report a class, which is where the counts that
 * depend on them are shown.
 *
 * The printed total is summed from the printed parts, so the clause can never
 * disagree with its own breakdown. Empty when every sampled pixel carried an
 * informative class, so neither surface grows a clause it does not need.
 */
export function landCoverUnclassifiedRemainder(
  coverage: LandCoverContextSummary["coverage"]
): string {
  const reasons = landCoverUnclassifiedReasons(coverage);
  if (reasons.length === 0) return "";
  const remainder = reasons.reduce(
    (total, reason) => total + reason.sampleCount,
    0
  );
  // One reason accounts for the whole remainder, so naming the count twice
  // would add nothing: "the other 268 pixels source-unclassified" reads
  // correctly for each of the three reasons on its own.
  if (reasons.length === 1) {
    return `the other ${landCoverPixels(remainder)} ${reasons[0].text}`;
  }
  return `the other ${landCoverPixels(remainder)}: ${reasons
    .map((reason) => `${reason.sampleCount} ${reason.text}`)
    .join(", ")}`;
}

/** Pixel counts read as counts, so "1 pixel" never renders as "1 pixels". */
export function landCoverPixels(count: number): string {
  return `${count} pixel${count === 1 ? "" : "s"}`;
}
