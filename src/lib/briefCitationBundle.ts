import {
  bibtexDataset,
  bibtexTool,
  risDataset,
  risTool,
  textDataset,
  textTool,
  type CitationFormat,
} from "./citation";
import {
  attributeBrief,
  type EnvironmentSignalBrief,
} from "./environmentBrief";
import { GIBS_ACKNOWLEDGMENT } from "./providers";
import type { DatasetRef } from "./timeline";

/**
 * Brief-scoped, reference-manager-ready citations.
 *
 * `citationBundle` (citation.ts) cites the tool plus EVERY dataset in the
 * catalog — the right thing for a global "How to cite RoamingEye" affordance.
 * But when a researcher exports one place's environment brief (a figure showing,
 * say, that place's rainfall, soil moisture, and air temperature), citing the
 * whole catalog over-credits products the figure never drew on. This module
 * emits a citation bundle scoped to EXACTLY the source datasets one brief used,
 * in the format a reference manager ingests (BibTeX / RIS) or a human-readable
 * caption string (text).
 *
 * It reuses the brief's own source attribution (`attributeBrief`) so the
 * datasets cited here are identical to the ones the brief credits: deduplicated
 * by DOI and in first-seen (signal) order — a citation bundle and a credit line
 * for the same brief can never disagree about which products were consulted
 * (rainfall and soil moisture are both GLDAS, one DOI, cited once). Like that
 * credit, it is provenance-first: a source is cited because the brief consulted
 * it, INCLUDING sources that returned a no-data or unpublished state, so the
 * bundle never silently drops a product the brief relied on. It makes no claim
 * about the scientific values themselves.
 *
 * Pure and tested; an in-app "Cite this brief" affordance calls these.
 */

/** The distinct source datasets one brief drew on, deduped by DOI, in order. */
export function briefCitedDatasets(
  signals: readonly EnvironmentSignalBrief[]
): DatasetRef[] {
  return attributeBrief(signals).sources.map((entry) => entry.source);
}

/**
 * Cite the tool plus exactly the source datasets a brief drew on, in the
 * requested format. Mirrors `citationBundle`'s output shape (tool first, then
 * the deduplicated datasets, blank-line separated, trailing newline) but scoped
 * to one brief. An empty brief still cites the tool — the tool is always the
 * work being cited, whatever data it did or did not resolve.
 *
 * GIBS's requested acknowledgment is intentionally not injected here (it belongs
 * in a paper's acknowledgments section, not a reference-manager entry); it stays
 * available verbatim via `attributeBrief().acknowledgment` and `acknowledgment`.
 */
export function briefCitationBundle(
  signals: readonly EnvironmentSignalBrief[],
  format: CitationFormat
): string {
  const datasets = briefCitedDatasets(signals);
  if (format === "ris") {
    return [risTool(), ...datasets.map(risDataset)].join("\n\n") + "\n";
  }
  if (format === "text") {
    return [textTool(), ...datasets.map(textDataset)].join("\n\n") + "\n";
  }
  return [bibtexTool(), ...datasets.map(bibtexDataset)].join("\n\n") + "\n";
}

/** GIBS's requested acknowledgment, re-exported for the acknowledgments section. */
export const acknowledgment = GIBS_ACKNOWLEDGMENT;
