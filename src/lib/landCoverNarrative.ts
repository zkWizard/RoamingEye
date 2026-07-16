import type { LandCoverContextSummary } from "./landCover";

/**
 * User-facing language for a sampled MCD12Q1 LC_Type1 result.
 *
 * This deliberately describes only source class-code frequencies within the
 * selected boundary. It does not make a claim about land area, land use,
 * biodiversity, biomass, habitat, ecosystem condition, cause, or future.
 */
export interface LandCoverObservationNarrative {
  kind: "land-cover-observation-narrative";
  isInterpretation: false;
  headline: string;
  detail: string;
  provenance: {
    dataYear: number;
    publicationStatus: LandCoverContextSummary["provenance"]["publicationStatus"];
    geographicCoverage: LandCoverContextSummary["provenance"]["geographicCoverage"];
    nativeValue: string;
    sourceLabel: string;
    sourceUrl: string;
    wmsLayer: string;
    sourceResolution: "500 m";
  };
  coverage: LandCoverContextSummary["coverage"];
  limitations: readonly [
    "Class-code frequencies describe counted selected-boundary samples, not land-area shares.",
    "Rendered-imagery sampling is approximate; use the cited MCD12Q1 product for measurement-grade analysis.",
    "This observation does not infer biodiversity, biomass, habitat quality, ecosystem health, causes, or forecasts.",
  ];
}

const LIMITATIONS = [
  "Class-code frequencies describe counted selected-boundary samples, not land-area shares.",
  "Rendered-imagery sampling is approximate; use the cited MCD12Q1 product for measurement-grade analysis.",
  "This observation does not infer biodiversity, biomass, habitat quality, ecosystem health, causes, or forecasts.",
] as const;

/**
 * Convert a source-backed land-cover summary into honest UI copy while keeping
 * the data year, selected-boundary coverage, categorical native value, and
 * citation available to the caller.
 */
export function describeLandCoverObservation(
  summary: LandCoverContextSummary
): LandCoverObservationNarrative {
  const { provenance, coverage } = summary;
  const sourceLabel = `${provenance.source.shortName} v${provenance.source.version} — ${provenance.source.title}`;
  const sourceUrl = `https://doi.org/${provenance.source.doi}`;

  return {
    kind: "land-cover-observation-narrative",
    isInterpretation: false,
    headline: headlineFor(summary),
    detail: detailFor(summary),
    provenance: {
      dataYear: provenance.dataYear,
      publicationStatus: provenance.publicationStatus,
      geographicCoverage: provenance.geographicCoverage,
      nativeValue: `${provenance.nativeValue} (${provenance.nativeUnit}; no physical unit)`,
      sourceLabel,
      sourceUrl,
      wmsLayer: provenance.wmsLayer,
      sourceResolution: provenance.sourceResolution,
    },
    coverage,
    limitations: LIMITATIONS,
  };
}

function headlineFor(summary: LandCoverContextSummary): string {
  const { provenance, coverage, dominantClass } = summary;
  if (provenance.publicationStatus !== "published") {
    return `Land-cover record not published for ${provenance.dataYear}`;
  }
  if (coverage.status === "no-data" || !dominantClass) {
    return `No known IGBP class observed for ${provenance.dataYear}`;
  }
  return `Most frequent observed class: ${dominantClass.label}`;
}

function detailFor(summary: LandCoverContextSummary): string {
  const { provenance, coverage, dominantClass } = summary;
  const coverageDetail = coverageText(coverage);

  if (provenance.publicationStatus !== "published") {
    return `The requested annual record is ${publicationText(provenance.publicationStatus)}. ${coverageDetail}`;
  }
  if (!dominantClass) return coverageDetail;

  return `${dominantClass.label} occurred in ${dominantClass.sampleCount} of ${coverage.totalSampleCount} counted selected-boundary samples (${percent(dominantClass.fractionOfAllSamples)}). ${coverageDetail}`;
}

function coverageText(coverage: LandCoverContextSummary["coverage"]): string {
  if (coverage.totalSampleCount === 0) {
    return "No countable selected-boundary samples were supplied.";
  }

  const parts = [
    `Known IGBP classes occurred in ${coverage.knownLandCoverSampleCount} of ${coverage.totalSampleCount} counted samples (${percent(coverage.knownLandCoverFraction)}).`,
  ];
  if (coverage.unclassifiedSampleCount > 0) {
    parts.push(
      `${countedSamples(coverage.unclassifiedSampleCount)} ${wasWere(coverage.unclassifiedSampleCount)} source-unclassified.`
    );
  }
  if (coverage.noDataSampleCount > 0) {
    parts.push(
      `${countedSamples(coverage.noDataSampleCount)} had no usable code.`
    );
  }
  if (coverage.invalidClassSampleCount > 0) {
    parts.push(
      `${countedSamples(coverage.invalidClassSampleCount)} ${wasWere(coverage.invalidClassSampleCount)} outside the IGBP source-class contract.`
    );
  }
  if (coverage.invalidRecordCount > 0) {
    parts.push(
      `${coverage.invalidRecordCount} supplied records were rejected.`
    );
  }
  return parts.join(" ");
}

function publicationText(
  status: LandCoverContextSummary["provenance"]["publicationStatus"]
): string {
  switch (status) {
    case "invalid-year":
      return "invalid because the year is not a whole calendar year";
    case "outside-layer-range":
      return "outside the published layer range";
    case "published":
      return "published";
  }
}

function percent(value: number | null): string {
  return value === null ? "not available" : `${Math.round(value * 100)}%`;
}

function countedSamples(count: number): string {
  return `${count} counted sample${count === 1 ? "" : "s"}`;
}

function wasWere(count: number): "was" | "were" {
  return count === 1 ? "was" : "were";
}
