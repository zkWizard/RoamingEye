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
  const sampled = `${metrics.knownLandCoverSampleCount} classified of ${coverage.totalSampleCount} sampled image pixels`;

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
  return "No IGBP land-cover classes in this region";
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
  const parts: string[] = [];
  if (coverage.unclassifiedSampleCount > 0) {
    parts.push(
      `${pixels(coverage.unclassifiedSampleCount)} source-unclassified`
    );
  }
  if (coverage.noDataSampleCount > 0) {
    parts.push(`${pixels(coverage.noDataSampleCount)} with no usable colour`);
  }
  if (coverage.invalidClassSampleCount > 0) {
    parts.push(
      `${pixels(coverage.invalidClassSampleCount)} outside the IGBP class contract`
    );
  }
  return parts.length === 0
    ? `None of the ${coverage.totalSampleCount} sampled image pixels carried an IGBP class.`
    : `Of ${coverage.totalSampleCount} sampled image pixels: ${parts.join(", ")}.`;
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

function percent(fraction: number): string {
  return `${Math.round(fraction * 100)}%`;
}

function index(value: number): string {
  return value.toFixed(2);
}

function pixels(count: number): string {
  return `${count} pixel${count === 1 ? "" : "s"}`;
}
