import {
  IGBP_LAND_COVER_CLASSES,
  type IgbpLandCoverClassCode,
  type LandCoverContextSummary,
} from "./landCover";

/** Stable table/export rows for the complete MCD12Q1 IGBP class legend. */
export type LandCoverProfileRowStatus =
  "observed" | "not-observed-in-counted-sample" | "unavailable";

export interface LandCoverClassProfileRow {
  classCode: IgbpLandCoverClassCode;
  label: string;
  isInformativeLandCover: boolean;
  status: LandCoverProfileRowStatus;
  /** Null when the requested year or counted sample is unavailable. */
  sampleCount: number | null;
  /** Denominator is every counted selected-boundary sample. */
  fractionOfAllSamples: number | null;
  /** Denominator is informative IGBP classes 1..17; null for code 255. */
  fractionOfKnownLandCover: number | null;
}

export interface LandCoverClassProfile {
  kind: "observed-land-cover-class-profile";
  isForecast: false;
  status: "available" | "unavailable";
  reason:
    | "unpublished-data-year"
    | "no-counted-samples"
    | "no-known-land-cover"
    | null;
  provenance: LandCoverContextSummary["provenance"];
  /** Original coverage is retained as an audit trail, including rejected data. */
  coverage: LandCoverContextSummary["coverage"];
  rows: LandCoverClassProfileRow[];
  limitations: readonly string[];
}

export const LAND_COVER_PROFILE_LIMITATIONS = [
  "Not observed means only that a class had zero counts in this selected-boundary rendered-imagery sample; it does not establish geographic absence.",
  "Sample fractions are not land-area shares, and categorical IGBP class codes are never averaged.",
  "The profile does not infer biodiversity, biomass, habitat quality, ecosystem condition, cause, risk, or forecast.",
] as const;

/**
 * Build a stable full-legend profile from an already validated land-cover
 * summary. Every IGBP row is present in source-code order, allowing UI and
 * export consumers to distinguish a zero count from an unavailable sample
 * without inventing classes or parsing narrative text.
 */
export function buildLandCoverClassProfile(
  context: LandCoverContextSummary
): LandCoverClassProfile {
  const publicationAvailable =
    context.provenance.publicationStatus === "published";
  const sampleAvailable = context.coverage.totalSampleCount > 0;
  const available = publicationAvailable && sampleAvailable;
  const byCode = new Map(
    context.classCoverage.map((entry) => [entry.classCode, entry])
  );

  const rows = IGBP_LAND_COVER_CLASSES.map((definition) => {
    const observed = byCode.get(definition.code);
    if (!available) {
      return {
        classCode: definition.code,
        label: definition.label,
        isInformativeLandCover: definition.isInformativeLandCover,
        status: "unavailable" as const,
        sampleCount: null,
        fractionOfAllSamples: null,
        fractionOfKnownLandCover: null,
      };
    }

    const sampleCount = observed?.sampleCount ?? 0;
    return {
      classCode: definition.code,
      label: definition.label,
      isInformativeLandCover: definition.isInformativeLandCover,
      status:
        sampleCount > 0
          ? ("observed" as const)
          : ("not-observed-in-counted-sample" as const),
      sampleCount,
      fractionOfAllSamples: sampleCount / context.coverage.totalSampleCount,
      fractionOfKnownLandCover: definition.isInformativeLandCover
        ? context.coverage.knownLandCoverSampleCount === 0
          ? null
          : sampleCount / context.coverage.knownLandCoverSampleCount
        : null,
    };
  });

  return {
    kind: "observed-land-cover-class-profile",
    isForecast: false,
    status: available ? "available" : "unavailable",
    reason: !publicationAvailable
      ? "unpublished-data-year"
      : !sampleAvailable
        ? "no-counted-samples"
        : context.coverage.knownLandCoverSampleCount === 0
          ? "no-known-land-cover"
          : null,
    provenance: context.provenance,
    coverage: context.coverage,
    rows,
    limitations: LAND_COVER_PROFILE_LIMITATIONS,
  };
}
