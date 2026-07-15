import { citedDatasets, GIBS_ACKNOWLEDGMENT } from "./providers";
import type { DatasetRef } from "./timeline";

/**
 * Journal-ready Data Availability Statement (DAS) for the datasets RoamingEye
 * renders.
 *
 * `citation.ts` exports reference-manager citations (BibTeX / RIS) and a
 * formatted-text citation — what a researcher drops into a *reference list*. A
 * Data Availability Statement is a distinct, complementary artifact that most
 * journals now *require* in their own right (see e.g. the FAIR principles and
 * publisher data-availability policies): a short prose paragraph stating where
 * the underlying data can be obtained and under what terms, so the work is
 * reproducible without chasing the reference list. RoamingEye had every input a
 * DAS needs — resolvable dataset DOIs, the GIBS/EOSDIS access path, and the
 * requested acknowledgment — but never composed them into the statement itself.
 *
 * This module builds that statement from the same deduplicated `citedDatasets()`
 * source the citation bundle uses, so a DAS and a reference list never disagree
 * about which products backed the figures. It is provenance-first and honest by
 * construction:
 *   - It names only the products actually cited, each with its resolvable DOI;
 *     it invents no author, access date, or metadata the `DatasetRef` lacks.
 *   - The reuse-terms sentence states NASA's published EOSDIS open-data policy
 *     (full and open sharing, free of charge, no restrictions on subsequent use
 *     or redistribution). That policy governs the NASA GIBS/EOSDIS catalog this
 *     app streams; the statement frames every product as GIBS/EOSDIS-served, so
 *     it never asserts terms beyond that provenance.
 *   - It makes no claim about the scientific *values* any dataset reports.
 *
 * Pure and offline-testable; an in-app "Copy data availability statement"
 * affordance can call `dataAvailabilityStatement()` directly.
 */

/** DOI resolver prefix, so every named product carries a resolvable link. */
const DOI_RESOLVER = "https://doi.org/";

export interface DataAvailabilityOptions {
  /**
   * Optional access date/month rendered verbatim (e.g. "2026-07" or
   * "15 July 2026") for reproducibility. Omitted by default — an access date is
   * never fabricated, because the module cannot know when the reader pulled the
   * imagery.
   */
  accessed?: string;
  /**
   * Source datasets to describe. Defaults to the app's full cited catalog
   * (`citedDatasets()`). Any supplied list is deduplicated by DOI so a product
   * backing two layers (NDVI/EVI; the two GLDAS fields) is named once.
   */
  datasets?: readonly DatasetRef[];
}

/**
 * Render one source dataset as a DAS clause:
 * `Title (shortName vversion, https://doi.org/DOI)`. The DOI is rendered as a
 * resolvable link only when the ref actually carries one — a blank/absent DOI is
 * dropped rather than fabricated into a broken `https://doi.org/` link (citation
 * completeness is audited separately in `citationCompleteness.ts`).
 */
export function dataAvailabilityClause(ref: DatasetRef): string {
  const doi = typeof ref.doi === "string" ? ref.doi.trim() : "";
  const link = doi ? `, ${DOI_RESOLVER}${doi}` : "";
  return `${ref.title} (${ref.shortName} v${ref.version}${link})`;
}

/** Deduplicate datasets by DOI, preserving first-seen order. */
function dedupeByDoi(datasets: readonly DatasetRef[]): DatasetRef[] {
  const seen = new Set<string>();
  const out: DatasetRef[] = [];
  for (const ref of datasets) {
    const key = typeof ref.doi === "string" ? ref.doi.trim() : "";
    // Refs with no DOI cannot be deduplicated by identity, so keep each — the
    // DAS should still name a product even when its DOI is missing.
    if (key && seen.has(key)) continue;
    if (key) seen.add(key);
    out.push(ref);
  }
  return out;
}

/**
 * Compose a journal-ready Data Availability Statement for the cited datasets.
 * The statement names every distinct source product with its resolvable DOI,
 * states the GIBS/EOSDIS access path and NASA's open-data reuse terms, and ends
 * with the requested GIBS acknowledgment. It reports provenance only — never a
 * value, condition, comparison, or forecast claim about the data.
 */
export function dataAvailabilityStatement(
  options?: DataAvailabilityOptions
): string {
  const source = options?.datasets ?? citedDatasets().map((c) => c.dataset);
  const datasets = dedupeByDoi(source);

  if (datasets.length === 0) {
    return "No source datasets to report for a data availability statement.";
  }

  const noun = datasets.length === 1 ? "dataset" : "datasets";
  const productNoun = datasets.length === 1 ? "product is" : "products are";
  const clauses = datasets.map(dataAvailabilityClause).join("; ");

  const accessClause =
    options?.accessed && options.accessed.trim().length > 0
      ? ` GIBS imagery was accessed on ${options.accessed.trim()}.`
      : "";

  return (
    `The Earth-observation ${noun} underlying this work ${datasets.length === 1 ? "is" : "are"} ` +
    "openly available through NASA's Global Imagery Browse Services (GIBS), " +
    "part of NASA's Earth Science Data and Information System (EOSDIS). " +
    `The source ${productNoun}: ${clauses}. ` +
    "NASA Earth science data are distributed free of charge under NASA's full " +
    "and open data policy, without restriction on subsequent use or " +
    `redistribution.${accessClause} ${GIBS_ACKNOWLEDGMENT}`
  );
}
