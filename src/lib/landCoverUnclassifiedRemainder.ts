import type { LandCoverContextSummary } from "./landCover";

/**
 * How many of the sampled pixels carried no colour to read at all.
 *
 * `summarizeLandCoverContext` admits one value per pixel — a class code or
 * null — so by the time a reading is built, a pixel the renderer never drew and
 * a pixel drawn in a colour outside the published palette are the same null.
 * `decodeRenderedLandCoverPixel` separates them (`transparent` vs
 * `unmapped-color`) and only the probe readers still hold that answer, so they
 * carry the transparent count forward rather than the class contract widening
 * to admit a reason it does not need for anything else.
 */
export interface LandCoverUndecodedSplit {
  /** Counted pixels that were fully transparent: nothing was rendered there. */
  transparentSampleCount: number;
}

/**
 * The share of `noDataSampleCount` the caller attributed to transparency,
 * clamped into the bucket it is splitting. A count that is not a non-negative
 * integer, or that exceeds the pixels actually missing a code, cannot be
 * printed as given without the parts ceasing to sum to the whole.
 */
function transparentWithin(
  coverage: LandCoverContextSummary["coverage"],
  undecoded: LandCoverUndecodedSplit | undefined
): number {
  const supplied = undecoded?.transparentSampleCount ?? 0;
  if (!Number.isInteger(supplied) || supplied <= 0) return 0;
  return Math.min(supplied, coverage.noDataSampleCount);
}

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
 * These are not the same kind of fact. Source-unclassified pixels are MCD12Q1's
 * own answer for that ground — the product looked and declined to assign a
 * class. Pixels with no usable colour are this app failing to read the rendered
 * map: an exact palette match was not found, so nothing was counted (see
 * landCoverPalette.ts — a nearest-colour match would invent a class the source
 * never assigned). A sample that is 80% classified because the product says
 * "unclassified" and one that is 80% classified because a fifth of the sample
 * could not be decoded are the same number and different observations, and only
 * the second is a reason to distrust the classes beside it.
 *
 * Which is exactly why a transparent pixel must not be reported as an
 * unreadable colour. Nothing was rendered there, so there was no colour to
 * match and no evidence about the palette either way — a box drawn off the
 * tile's coverage would otherwise tell the reader a fifth of the image defeated
 * the decoder and that the classes beside it are suspect. When the caller
 * supplies the split, transparency is named separately; when it does not, the
 * wording is unchanged from before it could be told apart.
 *
 * Shared by the point and drawn-region readings so the two land-cover surfaces
 * bucket the shortfall identically and cannot drift apart, the same reason
 * {@link noKnownLandCoverHeadline} is shared.
 */
export function landCoverUnclassifiedReasons(
  coverage: LandCoverContextSummary["coverage"],
  undecoded?: LandCoverUndecodedSplit
): { sampleCount: number; text: string }[] {
  const transparent = transparentWithin(coverage, undecoded);
  return [
    {
      sampleCount: coverage.unclassifiedSampleCount,
      text: "source-unclassified",
    },
    { sampleCount: transparent, text: "with no rendered imagery" },
    {
      sampleCount: coverage.noDataSampleCount - transparent,
      text: "with no usable colour",
    },
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
  coverage: LandCoverContextSummary["coverage"],
  undecoded?: LandCoverUndecodedSplit
): string {
  const reasons = landCoverUnclassifiedReasons(coverage, undecoded);
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
