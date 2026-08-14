import type { LandCoverContextSummary } from "./landCover";
import { noKnownLandCoverHeadline } from "./landCoverNoClassHeadline";
import {
  landCoverPixels,
  landCoverUnclassifiedReasons,
  landCoverUnclassifiedRemainder,
  type LandCoverUndecodedSplit,
} from "./landCoverUnclassifiedRemainder";

/**
 * Probe-panel copy for a point sample of the MCD12Q1 LC_Type1 land-cover map.
 *
 * The point probe reads a small block of rendered image pixels rather than a
 * searched boundary, so this says "sampled image pixels" and does not borrow
 * the boundary wording of lib/landCoverNarrative — the sampling geometry really
 * is different and the copy must not overstate it.
 *
 * A class code is a categorical identifier. Pixels carrying it are counted,
 * never averaged, and the most frequent class is reported as exactly that: the
 * most frequent sampled label, not the land cover "of" the point, not an area
 * share, and not a statement about biodiversity, biomass, habitat quality,
 * ecosystem condition, cause, or future change. A tie for most frequent is
 * surfaced as a tie rather than resolved into a single confident label.
 */
export interface LandCoverPointReading {
  kind: "land-cover-point-class-reading";
  isInterpretation: false;
  status: "classified" | "tied" | "unavailable";
  headline: string;
  detail: string;
  /** headline and detail joined for a single-line status surface. */
  text: string;
}

/**
 * Turn a point-sampled land-cover summary into honest probe-panel copy.
 *
 * Reuses the already-validated coverage, class counts, tie handling, and
 * provenance from {@link summarizeLandCoverContext}: no dataset reference is
 * dropped and no class code is re-parsed or re-ranked here.
 */
export function describeLandCoverPointReading(
  summary: LandCoverContextSummary,
  undecoded?: LandCoverUndecodedSplit
): LandCoverPointReading {
  const {
    provenance,
    coverage,
    observationStatus,
    unavailableReason,
    mostFrequentClasses,
    dominantClass,
  } = summary;
  const source = `${provenance.source.shortName} v${provenance.source.version}, ${provenance.sourceResolution}, ${provenance.dataYear} annual IGBP map`;
  const categorical = "Class labels are categorical — counted, never averaged.";

  if (observationStatus === "unavailable") {
    switch (unavailableReason) {
      case "invalid-year":
        return reading(
          "unavailable",
          "No land-cover class available",
          `The requested year is not a whole calendar year. ${source}.`
        );
      case "outside-layer-range":
        return reading(
          "unavailable",
          `No land-cover map published for ${provenance.dataYear}`,
          `The annual MCD12Q1 series does not cover this year. ${source}.`
        );
      case "no-samples":
        return reading(
          "unavailable",
          "No land-cover pixels sampled",
          `The rendered source image supplied no pixels here. ${source}.`
        );
      default:
        // Scoped to the pixels that were read, never to the ground: a point
        // clicked where the rendered map is transparent decodes nothing, and
        // source class 255 is MCD12Q1 declining to classify. Neither supports
        // "no IGBP land-cover class here".
        return reading(
          "unavailable",
          noKnownLandCoverHeadline(coverage),
          `${unclassifiedText(coverage, undecoded)} ${source}. ${categorical}`
        );
    }
  }

  const sampled = `of ${coverage.totalSampleCount} sampled image pixels`;
  const shortfall = classifiedShortfall(coverage, undecoded);
  if (dominantClass) {
    return reading(
      "classified",
      `${dominantClass.label} (IGBP class ${dominantClass.classCode})`,
      `Most frequent class in ${dominantClass.sampleCount} ${sampled}.${shortfall} ${source}. ${categorical}`
    );
  }

  // A tie carries no ordering, so every class sharing the count is named and
  // none is promoted to "the" class at this point.
  const tied = mostFrequentClasses[0];
  return reading(
    "tied",
    `Tied: ${mostFrequentClasses
      .map((entry) => `${entry.label} (IGBP class ${entry.classCode})`)
      .join(", ")}`,
    `Each occurred in ${tied.sampleCount} ${sampled}; no single most frequent class.${shortfall} ${source}. ${categorical}`
  );
}

/**
 * How much of the sample carried no IGBP class at all, and why.
 *
 * "Most frequent class in 7 of 25 sampled image pixels" prints a denominator of
 * every pixel read, so the 18 that are not this class could be other classes,
 * MCD12Q1's own "unclassified" answer, or pixels this app could not decode —
 * and those are not the same observation. Seven of twenty-five where the rest
 * carry classes is a mixed neighbourhood; seven of twenty-five where eighteen
 * never decoded is a class named from a mostly unreadable sample. Only the
 * second is a reason to distrust the label above it.
 *
 * The unavailable branch has always broken the remainder down this way
 * (`unclassifiedText`); this states it on the branches that DO name a class,
 * which is the same disclosure the drawn-region reading already makes beside
 * its shares (landCoverUnclassifiedRemainder.ts). Deliberately silent when
 * every sampled pixel carried an informative class, which keeps the ordinary
 * probe status line exactly as long as it is today.
 *
 * The classified count is stated explicitly rather than left to be inferred:
 * "the other N" alone would read against the 25, not against the classified
 * pixels, and would contradict its own breakdown whenever another class was
 * also present.
 */
function classifiedShortfall(
  coverage: LandCoverContextSummary["coverage"],
  undecoded: LandCoverUndecodedSplit | undefined
): string {
  const remainder = landCoverUnclassifiedRemainder(coverage, undecoded);
  if (remainder === "") return "";
  return ` Of those, ${landCoverPixels(
    coverage.knownLandCoverSampleCount
  )} carried an IGBP class; ${remainder}.`;
}

function reading(
  status: LandCoverPointReading["status"],
  headline: string,
  detail: string
): LandCoverPointReading {
  return {
    kind: "land-cover-point-class-reading",
    isInterpretation: false,
    status,
    headline,
    detail,
    text: `${headline} — ${detail}`,
  };
}

function unclassifiedText(
  coverage: LandCoverContextSummary["coverage"],
  undecoded: LandCoverUndecodedSplit | undefined
): string {
  const parts = landCoverUnclassifiedReasons(coverage, undecoded).map(
    (reason) => `${landCoverPixels(reason.sampleCount)} ${reason.text}`
  );
  return parts.length === 0
    ? `None of the ${coverage.totalSampleCount} sampled image pixels carried an IGBP class.`
    : `Of ${coverage.totalSampleCount} sampled image pixels: ${parts.join(", ")}.`;
}
