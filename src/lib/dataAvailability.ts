import {
  citedVectorSources,
  type VectorSourceCitation,
} from "./citedVectorSources";
import { doiResolverUrl } from "./doiLink";
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
 *     app streams, and the statement scopes it to exactly those products.
 *   - The globe also draws four datasets that are NOT NASA products — the
 *     Smithsonian volcano database, the USGS seismicity feed, the Bird (2003)
 *     plate-boundary model and the Natural Earth basemap. A statement naming
 *     only the imagery would under-report the work's inputs, and stretching
 *     NASA's policy over them would assert terms their publishers never
 *     granted. They are named in a sentence of their own that states no reuse
 *     terms at all: it points at each source and says the terms are theirs to
 *     read. The registry is `citedVectorSources()`, the same one the providers
 *     page and the citation bundle enumerate, so the three cannot disagree
 *     about what the globe renders.
 *   - It makes no claim about the scientific *values* any dataset reports.
 *
 * Pure and offline-testable; an in-app "Copy data availability statement"
 * affordance can call `dataAvailabilityStatement()` directly.
 */

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
  /**
   * The rendered non-NASA vector datasets. Defaults to `citedVectorSources()`.
   * Pass an empty array to describe the imagery alone — for a figure that drew
   * no overlay, where naming them would over-report what the work used.
   */
  vectorSources?: readonly VectorSourceCitation[];
}

/**
 * Render one source dataset as a DAS clause:
 * `Title (shortName vversion, https://doi.org/DOI)`. The DOI is rendered as a
 * resolvable link only when the ref actually carries one — a blank/absent DOI is
 * dropped rather than fabricated into a broken `https://doi.org/` link (citation
 * completeness is audited separately in `citationCompleteness.ts`). The link is
 * built by `doiResolverUrl` (doiLink.ts) so a DAS pasted into a manuscript
 * carries exactly the same resolver URL as the reference-list citation.
 */
export function dataAvailabilityClause(ref: DatasetRef): string {
  const doi = typeof ref.doi === "string" ? ref.doi.trim() : "";
  const link = doi ? `, ${doiResolverUrl(doi)}` : "";
  return `${ref.title} (${ref.shortName} v${ref.version}${link})`;
}

/**
 * Render one rendered vector source as a DAS clause:
 * `Title vversion (Publisher, locator)`. The locator is the resolvable DOI when
 * the source has one and its landing URL when it does not — the same rule the
 * providers page links by, so a DAS and that list send a reader to the same
 * page. A source whose committed provenance names no publisher falls back to
 * the journal that carries it, and one with neither is named without an
 * attribution rather than with an invented one (Bird 2003 is cited as the
 * article that defines the model; `citedVectorSources.ts` explains why).
 */
export function vectorAvailabilityClause(source: VectorSourceCitation): string {
  const version = source.version ? ` v${source.version}` : "";
  const locator = source.doi ? doiResolverUrl(source.doi) : source.url;
  const attribution = source.publisher ?? source.containerTitle;
  const inner = attribution ? `${attribution}, ${locator}` : locator;
  return `${source.title}${version} (${inner})`;
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
 * Small counts as words, the way a manuscript writes them; anything larger
 * stays a numeral rather than growing a spelling table this app will never use.
 * The count is read from the registry, so it cannot drift out of step with the
 * clauses it introduces.
 */
function spelledCount(n: number): string {
  const words = [
    "zero",
    "one",
    "two",
    "three",
    "four",
    "five",
    "six",
    "seven",
    "eight",
    "nine",
  ];
  return words[n] ?? String(n);
}

/**
 * The sentence naming the rendered vector datasets. Kept separate from the
 * imagery sentences because its honesty rests on what it does NOT say: no
 * licence, no policy, no access guarantee. It states where each source lives
 * and hands the terms back to its publisher, which is the most a repo holding
 * no licence field can truthfully report.
 */
function vectorAvailabilitySentence(
  sources: readonly VectorSourceCitation[],
  /**
   * False when no imagery sentence precedes this one, in which case there is no
   * "that policy" to exclude the sources from and nothing for "also" to follow.
   */
  followsImagery: boolean
): string {
  if (sources.length === 0) return "";
  const clauses = sources.map(vectorAvailabilityClause).join("; ");
  const plural = sources.length !== 1;
  const count = spelledCount(sources.length);
  const subject = followsImagery
    ? `also renders ${count} further ${plural ? "datasets" : "dataset"} ` +
      `${plural ? "that are not NASA products and are not" : "that is not a NASA product and is not"} covered by that policy`
    : `renders ${count} ${plural ? "datasets" : "dataset"}`;
  const each = plural ? "Each is" : "It is";
  return (
    `The globe ${subject}: ${clauses}. ` +
    `${each} governed by its own publisher's terms of use; consult the linked ` +
    "source, and where one publishes no DOI and no fixed version, cite it with " +
    "the date you retrieved it."
  );
}

/**
 * Compose a journal-ready Data Availability Statement for the cited datasets.
 * The statement names every distinct NASA source product with its resolvable
 * DOI, states the GIBS/EOSDIS access path and NASA's open-data reuse terms for
 * exactly those products, names the rendered non-NASA vector datasets without
 * claiming terms for them, and ends with the requested GIBS acknowledgment. It
 * reports provenance only — never a value, condition, comparison, or forecast
 * claim about the data.
 */
export function dataAvailabilityStatement(
  options?: DataAvailabilityOptions
): string {
  const source = options?.datasets ?? citedDatasets().map((c) => c.dataset);
  const datasets = dedupeByDoi(source);
  const vectors = options?.vectorSources ?? citedVectorSources();

  if (datasets.length === 0) {
    // No imagery means the GIBS access path, NASA's policy and the requested
    // acknowledgment all describe nothing, so none of them is emitted. Any
    // vector source the work still drew is reported on its own rather than
    // dropped — under-reporting inputs is the defect this branch exists to
    // avoid, not a tidier sentence.
    if (vectors.length === 0) {
      return "No source datasets to report for a data availability statement.";
    }
    return vectorAvailabilitySentence(vectors, false);
  }

  const noun = datasets.length === 1 ? "dataset" : "datasets";
  const productNoun = datasets.length === 1 ? "product is" : "products are";
  const clauses = datasets.map(dataAvailabilityClause).join("; ");

  const accessClause =
    options?.accessed && options.accessed.trim().length > 0
      ? ` GIBS imagery was accessed on ${options.accessed.trim()}.`
      : "";

  return (
    `The NASA Earth-observation imagery ${noun} underlying this work ${datasets.length === 1 ? "is" : "are"} ` +
    "openly available through NASA's Global Imagery Browse Services (GIBS), " +
    "part of NASA's Earth Science Data and Information System (EOSDIS). " +
    `The source ${productNoun}: ${clauses}. ` +
    "NASA Earth science data are distributed free of charge under NASA's full " +
    "and open data policy, without restriction on subsequent use or " +
    `redistribution.${accessClause}` +
    (vectors.length === 0
      ? ""
      : ` ${vectorAvailabilitySentence(vectors, true)}`) +
    ` ${GIBS_ACKNOWLEDGMENT}`
  );
}
