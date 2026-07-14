import { neumaierSum } from "./numerics";
import {
  type IgbpLandCoverClassCode,
  type LandCoverContextSummary,
  type LandCoverProvenance,
} from "./landCover";

/**
 * Class-composition descriptors for a class-coded MCD12Q1 land-cover sample.
 *
 * These summarize how the sampled pixels are distributed among the categorical
 * IGBP class labels: how many distinct informative classes are present
 * (richness) and how evenly the samples are spread across them (evenness).
 *
 * They describe the mix of land-cover CLASS LABELS in the sample and nothing
 * more. They are NOT a measure of species biodiversity, biomass, habitat
 * quality, ecological health, productivity, or landscape spatial pattern, and
 * they infer no causes or forecasts. Composition is computed over informative
 * classes (IGBP codes 1..17) only; source unclassified pixels (code 255) and
 * no-data samples carry no land-cover type and are excluded from the shares.
 */

/** Compositional metrics are only defined once informative land cover exists. */
export type LandCoverCompositionStatus = "available" | "no-data";

export interface LandCoverClassShare {
  classCode: IgbpLandCoverClassCode;
  label: string;
  sampleCount: number;
  /** Share of informative (class 1..17) samples carried by this class. */
  fractionOfKnownLandCover: number;
}

export interface LandCoverCompositionMetrics {
  /** Informative sample count used as the denominator for every share below. */
  knownLandCoverSampleCount: number;
  /** Distinct informative IGBP classes present with at least one sample. */
  classRichness: number;
  /**
   * Shannon entropy of the class-label shares, in nats: H = -Σ pᵢ ln pᵢ.
   * A single-class sample has H = 0; entropy rises as classes even out.
   */
  shannonEntropy: number;
  /** Maximum entropy for this richness, ln(classRichness); 0 for one class. */
  shannonEntropyMax: number;
  /**
   * Pielou's evenness J = H / ln(richness), bounded to [0, 1]. Null when
   * fewer than two classes are present, where evenness is undefined (0/0).
   */
  pielouEvenness: number | null;
  /**
   * Gini-Simpson index 1 - Σ pᵢ²: the probability that two samples drawn at
   * random carry different informative classes. Bounded to [0, 1).
   */
  giniSimpsonIndex: number;
  /** Largest single-class share of informative land cover, in [0, 1]. */
  dominantClassFraction: number;
}

export interface LandCoverCompositionSummary {
  kind: "observed-land-cover-class-composition";
  /** Explicitly prevents consumers from treating this as a temporal forecast. */
  isForecast: false;
  status: LandCoverCompositionStatus;
  provenance: LandCoverProvenance;
  /** Null only when no informative land cover was sampled. */
  metrics: LandCoverCompositionMetrics | null;
  /** Per-class shares, most common first, retained for auditability. */
  classShares: LandCoverClassShare[];
  /** Short machine-readable reason when metrics are withheld. */
  reason: "no-known-land-cover" | null;
}

/**
 * Describe the class-label composition of a land-cover sample.
 *
 * Reuses the already-validated coverage, class counts, and provenance from
 * {@link summarizeLandCoverContext}: no dataset reference is dropped and no
 * class code is re-parsed. Shares use the informative-land-cover sample count
 * as their denominator, so unclassified and no-data pixels never dilute the
 * composition. Categorical class identifiers are never averaged.
 */
export function summarizeLandCoverComposition(
  context: LandCoverContextSummary
): LandCoverCompositionSummary {
  const knownLandCoverSampleCount = context.coverage.knownLandCoverSampleCount;
  const informative = context.classCoverage.filter(
    (entry) => entry.isInformativeLandCover
  );

  const classShares: LandCoverClassShare[] = informative
    .map((entry) => ({
      classCode: entry.classCode,
      label: entry.label,
      sampleCount: entry.sampleCount,
      fractionOfKnownLandCover:
        knownLandCoverSampleCount === 0
          ? 0
          : entry.sampleCount / knownLandCoverSampleCount,
    }))
    .sort((a, b) => b.sampleCount - a.sampleCount || a.classCode - b.classCode);

  if (knownLandCoverSampleCount === 0 || classShares.length === 0) {
    return {
      kind: "observed-land-cover-class-composition",
      isForecast: false,
      status: "no-data",
      provenance: context.provenance,
      metrics: null,
      classShares,
      reason: "no-known-land-cover",
    };
  }

  const shares = classShares.map((entry) => entry.fractionOfKnownLandCover);
  const classRichness = classShares.length;
  // `+ 0` collapses the IEEE -0 that a lone share (share·ln 1 = 0) produces.
  const shannonEntropy =
    -neumaierSum(shares.map((share) => share * Math.log(share))) + 0;
  const shannonEntropyMax = Math.log(classRichness);
  const giniSimpsonIndex =
    1 - neumaierSum(shares.map((share) => share * share));

  return {
    kind: "observed-land-cover-class-composition",
    isForecast: false,
    status: "available",
    provenance: context.provenance,
    metrics: {
      knownLandCoverSampleCount,
      classRichness,
      shannonEntropy,
      shannonEntropyMax,
      pielouEvenness:
        classRichness < 2 ? null : shannonEntropy / shannonEntropyMax,
      giniSimpsonIndex,
      dominantClassFraction: shares[0],
    },
    classShares,
    reason: null,
  };
}
