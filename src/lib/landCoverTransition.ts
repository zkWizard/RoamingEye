import {
  IGBP_LAND_COVER_CLASSES,
  LAND_COVER_SOURCE,
  publicationStatusForYear,
  type IgbpLandCoverClass,
  type IgbpLandCoverClassCode,
  type LandCoverPublicationStatus,
} from "./landCover";
import { LAYERS, type DatasetRef } from "./timeline";

/**
 * Categorical land-cover transition context for paired MCD12Q1 samples.
 *
 * Given co-located samples with an earlier and a later IGBP LC_Type1 class
 * code, these helpers count `from -> to` class-code pairs only. They never
 * average class identifiers and never infer land area, land-use change,
 * deforestation, degradation, gain, loss, ecosystem condition, causes, or
 * forecasts.
 *
 * A critical honesty constraint governs this module: a year-to-year difference
 * in the MCD12Q1 LC_Type1 label is NOT evidence of real land conversion. The
 * product's own documentation warns that much of the apparent inter-annual
 * class change is classification uncertainty, not physical change. These
 * summaries therefore report "co-located class-code pairs", explicitly not
 * "detected change", and stay categorical and provenance-tagged throughout.
 */

const layer = LAYERS.landcover;

/** Existing NASA MCD12Q1 v061 provenance, retained in every transition summary. */
export const LAND_COVER_TRANSITION_SOURCE: DatasetRef = LAND_COVER_SOURCE;

export const LAND_COVER_TRANSITION_LIMITATIONS = [
  "A changed LC_Type1 class between years is a class-code pair, not verified land conversion.",
  "MCD12Q1 inter-annual label differences are dominated by classification uncertainty, not physical change.",
  "Class codes are categorical identifiers; they are counted, never averaged or ordered.",
  "This summary does not infer land area, land use, deforestation, degradation, gain, loss, ecosystem condition, causes, or forecasts.",
] as const;

export interface LandCoverTransitionObservation {
  /** Earlier-year MCD12Q1 class code; null means no usable earlier code. */
  fromClassCode: number | null;
  /** Later-year MCD12Q1 class code; null means no usable later code. */
  toClassCode: number | null;
  /** Co-located samples/pixels represented by this pair. Defaults to one. */
  sampleCount?: number;
}

export type LandCoverTransitionStatus = "available" | "no-data";

export interface LandCoverTransitionCoverage {
  status: LandCoverTransitionStatus;
  /** Supplied pairs with a positive integer count, including no-data pairs. */
  totalSampleCount: number;
  /** Pairs with a known IGBP class 1..17 at BOTH years (transition-eligible). */
  bothClassifiedSampleCount: number;
  /** Pairs classified at exactly one year (partial; ineligible for a pair). */
  partiallyClassifiedSampleCount: number;
  /** Pairs where the sampler supplied no usable code at either year. */
  noDataSampleCount: number;
  /** Pairs with a code outside the IGBP contract at either year. */
  invalidClassSampleCount: number;
  /** Records rejected because their sample count was not a positive integer. */
  invalidRecordCount: number;
  /** Share of all counted pairs eligible for a from->to comparison. */
  bothClassifiedFraction: number | null;
  reason: "no-samples" | "no-both-classified" | null;
}

export interface LandCoverClassTransition {
  fromClassCode: IgbpLandCoverClassCode;
  fromLabel: string;
  toClassCode: IgbpLandCoverClassCode;
  toLabel: string;
  /** True when the earlier and later class codes are identical. */
  isStable: boolean;
  sampleCount: number;
  /** Denominator is every transition-eligible (both-classified) pair. */
  fractionOfBothClassified: number;
}

export interface LandCoverTransitionProvenance {
  layerId: "landcover";
  wmsLayer: string;
  fromYear: number;
  toYear: number;
  cadence: "annual";
  classScheme: "IGBP";
  sourceResolution: "500 m";
  source: DatasetRef;
  fromPublicationStatus: LandCoverPublicationStatus;
  toPublicationStatus: LandCoverPublicationStatus;
  /** True only when both years fall inside the published layer range. */
  bothYearsPublished: boolean;
}

export interface LandCoverTransitionSummary {
  kind: "observed-class-coded-land-cover-transition";
  /** Explicitly prevents consumers from treating pairs as detected change. */
  isChangeDetection: false;
  isForecast: false;
  provenance: LandCoverTransitionProvenance;
  coverage: LandCoverTransitionCoverage;
  /** Every observed from->to pair, most frequent first. */
  transitions: LandCoverClassTransition[];
  /** Both-classified pairs whose earlier and later class codes match. */
  stableSampleCount: number;
  /** Both-classified pairs whose earlier and later class codes differ. */
  changedSampleCount: number;
  /** Most frequent differing pair among both-classified samples; null if none. */
  dominantChange: LandCoverClassTransition | null;
  limitations: typeof LAND_COVER_TRANSITION_LIMITATIONS;
}

const IGBP_BY_CODE = new Map<IgbpLandCoverClassCode, IgbpLandCoverClass>(
  IGBP_LAND_COVER_CLASSES.map((entry) => [entry.code, entry])
);

/** Resolve a supplied code to an informative IGBP class, or null otherwise. */
function informativeClass(code: number | null): IgbpLandCoverClass | null {
  if (code === null || !Number.isInteger(code)) return null;
  const igbpClass = IGBP_BY_CODE.get(code as IgbpLandCoverClassCode);
  return igbpClass && igbpClass.isInformativeLandCover ? igbpClass : null;
}

/** True when a supplied code is present but outside the IGBP class contract. */
function isInvalidCode(code: number | null): boolean {
  if (code === null) return false;
  return (
    !Number.isInteger(code) || !IGBP_BY_CODE.has(code as IgbpLandCoverClassCode)
  );
}

/**
 * Count co-located earlier/later IGBP class-code pairs into an honest
 * transition summary. Only pairs classified into an informative class at both
 * years are eligible; the source "Unclassified" code (255) is a valid
 * observation but not a land-cover type, so it is treated as unclassified for
 * pairing rather than as one end of a transition.
 */
export function summarizeLandCoverTransitions(
  observations: readonly LandCoverTransitionObservation[],
  fromYear: number,
  toYear: number
): LandCoverTransitionSummary {
  const pairCounts = new Map<string, number>();
  let totalSampleCount = 0;
  let bothClassifiedSampleCount = 0;
  let partiallyClassifiedSampleCount = 0;
  let noDataSampleCount = 0;
  let invalidClassSampleCount = 0;
  let invalidRecordCount = 0;
  let stableSampleCount = 0;
  let changedSampleCount = 0;

  for (const observation of observations) {
    const sampleCount = observation.sampleCount ?? 1;
    if (!Number.isInteger(sampleCount) || sampleCount <= 0) {
      invalidRecordCount += 1;
      continue;
    }
    totalSampleCount += sampleCount;

    if (
      isInvalidCode(observation.fromClassCode) ||
      isInvalidCode(observation.toClassCode)
    ) {
      invalidClassSampleCount += sampleCount;
      invalidRecordCount += 1;
      continue;
    }

    const fromClass = informativeClass(observation.fromClassCode);
    const toClass = informativeClass(observation.toClassCode);
    if (fromClass && toClass) {
      bothClassifiedSampleCount += sampleCount;
      const key = `${fromClass.code}->${toClass.code}`;
      pairCounts.set(key, (pairCounts.get(key) ?? 0) + sampleCount);
      if (fromClass.code === toClass.code) {
        stableSampleCount += sampleCount;
      } else {
        changedSampleCount += sampleCount;
      }
    } else if (fromClass || toClass) {
      partiallyClassifiedSampleCount += sampleCount;
    } else {
      noDataSampleCount += sampleCount;
    }
  }

  const transitions = [...pairCounts.entries()]
    .map(([key, sampleCount]) => {
      const [fromCode, toCode] = key
        .split("->")
        .map((part) => Number(part) as IgbpLandCoverClassCode);
      const fromClass = IGBP_BY_CODE.get(fromCode)!;
      const toClass = IGBP_BY_CODE.get(toCode)!;
      return {
        fromClassCode: fromCode,
        fromLabel: fromClass.label,
        toClassCode: toCode,
        toLabel: toClass.label,
        isStable: fromCode === toCode,
        sampleCount,
        fractionOfBothClassified:
          bothClassifiedSampleCount === 0
            ? 0
            : sampleCount / bothClassifiedSampleCount,
      };
    })
    .sort(
      (a, b) =>
        b.sampleCount - a.sampleCount ||
        a.fromClassCode - b.fromClassCode ||
        a.toClassCode - b.toClassCode
    );

  const dominantChange =
    transitions.find((transition) => !transition.isStable) ?? null;

  const coverage: LandCoverTransitionCoverage = {
    status: bothClassifiedSampleCount > 0 ? "available" : "no-data",
    totalSampleCount,
    bothClassifiedSampleCount,
    partiallyClassifiedSampleCount,
    noDataSampleCount,
    invalidClassSampleCount,
    invalidRecordCount,
    bothClassifiedFraction:
      totalSampleCount === 0
        ? null
        : bothClassifiedSampleCount / totalSampleCount,
    reason:
      totalSampleCount === 0
        ? "no-samples"
        : bothClassifiedSampleCount === 0
          ? "no-both-classified"
          : null,
  };

  const fromPublicationStatus = publicationStatusForYear(fromYear);
  const toPublicationStatus = publicationStatusForYear(toYear);

  return {
    kind: "observed-class-coded-land-cover-transition",
    isChangeDetection: false,
    isForecast: false,
    provenance: {
      layerId: "landcover",
      wmsLayer: layer.wmsLayer,
      fromYear,
      toYear,
      cadence: "annual",
      classScheme: "IGBP",
      sourceResolution: "500 m",
      source: LAND_COVER_TRANSITION_SOURCE,
      fromPublicationStatus,
      toPublicationStatus,
      bothYearsPublished:
        fromPublicationStatus === "published" &&
        toPublicationStatus === "published",
    },
    coverage,
    transitions,
    stableSampleCount,
    changedSampleCount,
    dominantChange,
    limitations: LAND_COVER_TRANSITION_LIMITATIONS,
  };
}
