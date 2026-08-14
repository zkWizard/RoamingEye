import type { LandCoverContextSummary } from "./landCover";
import {
  summarizeLandCoverComposition,
  type LandCoverCompositionSummary,
} from "./landCoverComposition";

/**
 * Probe-panel copy for a drawn-region sample of the MCD12Q1 LC_Type1 map.
 *
 * A drawn region covers many source pixels, so — unlike the point reading — the
 * informative answer is the MIX of class labels, not a single label. This
 * formats {@link summarizeLandCoverComposition}: which class is most frequent,
 * how many distinct classes are present, and how evenly the samples spread
 * across them.
 *
 * The shares' denominator is classified pixels, so the sampled pixels that
 * carry no IGBP class are named with the reason they carry none — the product's
 * own "unclassified" answer and this app's failure to decode a rendered colour
 * are both shortfalls in that denominator, but only the second is a reason to
 * distrust the shares.
 *
 * Every share is a share of SAMPLED IMAGE PIXELS, never of ground area: the
 * rendered global preview is sampled on a geographic grid, so the copy says
 * "sampled image pixels" and never "of the region". Class codes are categorical
 * identifiers — counted, never averaged — and a tie for most frequent is
 * reported as a tie rather than resolved into one confident label.
 *
 * Richness and evenness describe the distribution of CLASS LABELS only. They
 * are not a measure of species biodiversity, biomass, habitat quality,
 * ecological health, or productivity, and they infer no cause or forecast.
 */
export interface LandCoverCompositionReading {
  kind: "land-cover-region-class-composition-reading";
  isInterpretation: false;
  status: "composed" | "single-class" | "tied" | "unavailable";
  headline: string;
  detail: string;
  /** headline and detail joined for a single-line status surface. */
  text: string;
  /** The composition this copy describes, kept for auditability. */
  composition: LandCoverCompositionSummary;
}

const CATEGORICAL = "Class labels are categorical — counted, never averaged.";
const NOT_ECOLOGY =
  "Shares describe the sampled class-label mix, not ground area, biodiversity, biomass, or habitat quality.";

/**
 * Turn a region-sampled land-cover summary into honest probe-panel copy.
 *
 * Reuses the already-validated coverage, class counts, tie handling, and
 * provenance from {@link summarizeLandCoverContext} by way of
 * {@link summarizeLandCoverComposition}: no dataset reference is dropped and no
 * class code is re-parsed or re-ranked here.
 */
export function describeLandCoverComposition(
  context: LandCoverContextSummary
): LandCoverCompositionReading {
  const composition = summarizeLandCoverComposition(context);
  const { provenance, coverage, unavailableReason } = context;
  const source = `${provenance.source.shortName} v${provenance.source.version}, ${provenance.sourceResolution}, ${provenance.dataYear} annual IGBP map`;

  if (composition.status !== "available" || !composition.metrics) {
    return reading(
      "unavailable",
      unavailableHeadline(composition, context),
      `${unavailableDetail(composition, coverage, unavailableReason)} ${source}.`,
      composition
    );
  }

  const metrics = composition.metrics;
  const sampled = `${metrics.knownLandCoverSampleCount} classified of ${
    coverage.totalSampleCount
  } sampled image pixels${unclassifiedRemainder(coverage)}`;

  // A tie carries no ordering, so every class sharing the top count is named
  // and none is promoted to "the" most frequent class of the region.
  if (context.mostFrequentClassStatus === "tied") {
    const tied = context.mostFrequentClasses;
    return reading(
      "tied",
      `Tied most frequent: ${tied
        .map((entry) => `${entry.label} (IGBP class ${entry.classCode})`)
        .join(", ")}`,
      `Each occurred in ${tied[0].sampleCount} pixels; ${spread(metrics)} across ${sampled}. ${source}. ${CATEGORICAL} ${NOT_ECOLOGY}`,
      composition
    );
  }

  const top = composition.classShares[0];
  if (metrics.classRichness === 1) {
    return reading(
      "single-class",
      `${top.label} (IGBP class ${top.classCode}) only`,
      `The single IGBP class present, in all ${sampled}. Evenness is undefined for one class. ${source}. ${CATEGORICAL} ${NOT_ECOLOGY}`,
      composition
    );
  }

  return reading(
    "composed",
    `${top.label} (IGBP class ${top.classCode}) most frequent — ${percent(top.fractionOfKnownLandCover)} of classified pixels`,
    `${spread(metrics)} across ${sampled}. ${source}. ${CATEGORICAL} ${NOT_ECOLOGY}`,
    composition
  );
}

/** Richness plus the two evenness indices, in one clause. */
function spread(
  metrics: NonNullable<LandCoverCompositionSummary["metrics"]>
): string {
  const evenness =
    metrics.pielouEvenness === null
      ? "evenness undefined for one class"
      : `Pielou evenness ${index(metrics.pielouEvenness)}`;
  return `${metrics.classRichness} IGBP classes, ${evenness}, Gini-Simpson ${index(
    metrics.giniSimpsonIndex
  )}`;
}

function unavailableHeadline(
  composition: LandCoverCompositionSummary,
  context: LandCoverContextSummary
): string {
  if (composition.status === "unavailable") {
    return context.unavailableReason === "invalid-year"
      ? "No land-cover composition available"
      : `No land-cover map published for ${context.provenance.dataYear}`;
  }
  return noKnownLandCoverHeadline(context.coverage);
}

/**
 * Headline a sample that produced no informative class, scoped to what was
 * actually read rather than to the region.
 *
 * "No IGBP land-cover classes in this region" is a claim about the ground, and
 * three of the four ways this branch is reached never observed the ground at
 * all. A region drawn where the rendered map is transparent samples pixels the
 * palette cannot decode (landCoverPalette.ts declines an inexact match rather
 * than inventing a class), and an empty sample observed nothing whatsoever —
 * yet both read as MCD12Q1 having found no land cover there. Only source class
 * 255 is the product's own answer, and even that says the product declined to
 * assign a class, not that the ground carries none.
 *
 * So the headline names the sample: nothing sampled, nothing decodable, or
 * source-unclassified across every pixel this app could read. The mixed case —
 * some pixels source-unclassified, some undecodable — takes the last form,
 * which stays true because it is scoped to the pixels that were read; the
 * detail below it breaks the remainder down by reason.
 */
function noKnownLandCoverHeadline(
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

function unavailableDetail(
  composition: LandCoverCompositionSummary,
  coverage: LandCoverContextSummary["coverage"],
  reason: LandCoverContextSummary["unavailableReason"]
): string {
  if (composition.status === "unavailable") {
    return reason === "invalid-year"
      ? "The requested year is not a whole calendar year."
      : "The annual MCD12Q1 series does not cover this year.";
  }
  if (coverage.totalSampleCount === 0) {
    return "The rendered source image supplied no pixels for this region.";
  }
  const parts = unclassifiedReasons(coverage).map(
    (reason) => `${pixels(reason.sampleCount)} ${reason.text}`
  );
  return parts.length === 0
    ? `None of the ${coverage.totalSampleCount} sampled image pixels carried an IGBP class.`
    : `Of ${coverage.totalSampleCount} sampled image pixels: ${parts.join(", ")}.`;
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
 */
function unclassifiedReasons(
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
 * Say why the unclassified remainder of an available composition is
 * unclassified.
 *
 * "512 classified of 780 sampled image pixels" states the shortfall but not its
 * cause, and the two causes are not the same kind of fact. Source-unclassified
 * pixels are MCD12Q1's own answer for that ground — the product looked and
 * declined to assign a class. Pixels with no usable colour are this app failing
 * to read the rendered map: an exact palette match was not found, so nothing
 * was counted (see landCoverPalette.ts — a nearest-colour match would invent a
 * class the source never assigned). A region that is 66% classified because the
 * product says "unclassified" and one that is 66% classified because a third of
 * the sample could not be decoded are the same number and different
 * observations, and only the second is a reason to distrust the shares beside
 * it.
 *
 * The unavailable branch above already names these reasons; this states them on
 * the branches that report a composition, which is where the shares that depend
 * on them are shown. The printed total is summed from the printed parts, so the
 * clause can never disagree with its own breakdown. Silent when every sampled
 * pixel carried an informative class.
 */
function unclassifiedRemainder(
  coverage: LandCoverContextSummary["coverage"]
): string {
  const reasons = unclassifiedReasons(coverage);
  if (reasons.length === 0) return "";
  const remainder = reasons.reduce(
    (total, reason) => total + reason.sampleCount,
    0
  );
  // One reason accounts for the whole remainder, so naming the count twice
  // would add nothing: "the other 268 pixels source-unclassified" reads
  // correctly for each of the three reasons on its own.
  if (reasons.length === 1) {
    return ` (the other ${pixels(remainder)} ${reasons[0].text})`;
  }
  return ` (the other ${pixels(remainder)}: ${reasons
    .map((reason) => `${reason.sampleCount} ${reason.text}`)
    .join(", ")})`;
}

function reading(
  status: LandCoverCompositionReading["status"],
  headline: string,
  detail: string,
  composition: LandCoverCompositionSummary
): LandCoverCompositionReading {
  return {
    kind: "land-cover-region-class-composition-reading",
    isInterpretation: false,
    status,
    headline,
    detail,
    text: `${headline} — ${detail}`,
    composition,
  };
}

/**
 * The most frequent class's share, rounded, but never rounded up to "100%".
 *
 * This formats a share only in the "composed" branch, which a single-class
 * sample never reaches — so a share reaching 100% here is always a partial one
 * that the very next clause contradicts by naming the other classes present. A
 * large drawn region makes that ordinary rather than rare: the sampling grid
 * runs up to 28x28, so one stray class among ~780 classified pixels rounds to
 * 100%. Rendered as ">99%" instead, matching how the vegetation-index support
 * note formats a share in the same status line.
 *
 * No "<1%" guard is paired with it: this only ever formats the LARGEST of at
 * most 17 informative IGBP class shares, which cannot fall below 1/17.
 */
function percent(fraction: number): string {
  const rounded = Math.round(fraction * 100);
  return rounded === 100 && fraction < 1 ? ">99%" : `${rounded}%`;
}

function index(value: number): string {
  return value.toFixed(2);
}

function pixels(count: number): string {
  return `${count} pixel${count === 1 ? "" : "s"}`;
}
