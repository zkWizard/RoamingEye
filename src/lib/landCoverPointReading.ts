import type { LandCoverContextSummary } from "./landCover";

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
  summary: LandCoverContextSummary
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
        return reading(
          "unavailable",
          "No IGBP land-cover class here",
          `${unclassifiedText(coverage)} ${source}. ${categorical}`
        );
    }
  }

  const sampled = `of ${coverage.totalSampleCount} sampled image pixels`;
  if (dominantClass) {
    return reading(
      "classified",
      `${dominantClass.label} (IGBP class ${dominantClass.classCode})`,
      `Most frequent class in ${dominantClass.sampleCount} ${sampled}. ${source}. ${categorical}`
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
    `Each occurred in ${tied.sampleCount} ${sampled}; no single most frequent class. ${source}. ${categorical}`
  );
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
  coverage: LandCoverContextSummary["coverage"]
): string {
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

function pixels(count: number): string {
  return `${count} pixel${count === 1 ? "" : "s"}`;
}
