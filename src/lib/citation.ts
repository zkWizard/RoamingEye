import { citedDatasets } from "./providers";
import type { DatasetRef } from "./timeline";

/**
 * Machine-readable citations (ESIP data & software citation guidelines):
 * export the tool and its source datasets in the formats reference managers
 * ingest — BibTeX (LaTeX) and RIS (EndNote/Zotero/Mendeley) — each carrying a
 * resolvable DOI, not a bare URL. A researcher should be able to copy a
 * citation and drop it straight into a manuscript.
 *
 * Pure and tested; the in-app "Copy citation" affordance calls these.
 */

/** The DOI proxy every resolvable citation link is built on. */
export const DOI_RESOLVER = "https://doi.org/";

/**
 * Characters that must be percent-encoded when a DOI name is placed in a URL,
 * per Crossref's DOI display guidance. A DOI name is an opaque string that may
 * legally contain characters a URL parser would otherwise swallow — a bare "#"
 * starts a fragment, "?" a query, an unescaped "%" an invalid escape — so a
 * copied resolver link built by naive interpolation could silently point
 * somewhere other than the dataset. The DOI's own "/" separators are structural
 * and are deliberately left intact; only these unsafe characters are escaped.
 *
 * "%" maps first in the table (and is listed first in the character class) so an
 * existing percent sign becomes "%25" rather than being read as the prefix of an
 * escape we just introduced.
 */
const DOI_URL_ESCAPES: Record<string, string> = {
  "%": "%25",
  '"': "%22",
  "#": "%23",
  "?": "%3F",
  " ": "%20",
  "<": "%3C",
  ">": "%3E",
  "{": "%7B",
  "}": "%7D",
  "^": "%5E",
  "`": "%60",
  "|": "%7C",
  "\\": "%5C",
};

/**
 * Build the resolvable `https://doi.org/<doi>` link for a DOI name, percent-
 * encoding the URL-unsafe characters the DOI suffix may carry while preserving
 * its structural "/" separators. This is the single place a resolver link is
 * constructed, so BibTeX, RIS, plain-text, and the environment brief's source
 * credit all emit a link that resolves rather than one that breaks on a "#" or a
 * stray space. It performs no network dereference and asserts nothing about the
 * DOI's resolvability — only that the string is safe to embed in a URL. The DOI
 * is trimmed first; a caller holding a possibly-absent DOI should guard emptiness
 * before calling (an empty input yields the bare resolver base).
 */
export function doiResolverUrl(doi: string): string {
  const encoded = doi
    .trim()
    .replace(/[%"#?<>{}^`|\\ ]/g, (char) => DOI_URL_ESCAPES[char]);
  return `${DOI_RESOLVER}${encoded}`;
}

/** Tool metadata, kept in step with CITATION.cff (the human-facing source). */
export const TOOL_CITATION = {
  title: "RoamingEye: an open-data 3D Earth for temporal satellite observation",
  author: "The RoamingEye contributors",
  version: __APP_VERSION__,
  year: 2026,
  url: "https://github.com/zkWizard/RoamingEye",
  license: "MIT",
} as const;

/**
 * Escape the characters that break a BibTeX/LaTeX field. Single pass over a
 * char class that INCLUDES the backslash escape character itself — mapping
 * each char to its complete escape so an inserted `\textbackslash{}` isn't
 * re-mangled by the brace rules (and so the escaping is complete, not partial:
 * a stray backslash can't slip through unescaped).
 */
const BIBTEX_ESCAPES: Record<string, string> = {
  "\\": "\\textbackslash{}",
  "{": "\\{",
  "}": "\\}",
  "#": "\\#",
  $: "\\$",
  "%": "\\%",
  "&": "\\&",
  _: "\\_",
};

function bibtexEscape(s: string): string {
  return s.replace(/[\\{}#$%&_]/g, (c) => BIBTEX_ESCAPES[c]);
}

/** BibTeX @software entry for the tool. */
export function bibtexTool(): string {
  const t = TOOL_CITATION;
  return [
    `@software{roamingeye,`,
    `  title = {${bibtexEscape(t.title)}},`,
    `  author = {${bibtexEscape(t.author)}},`,
    `  version = {${t.version}},`,
    `  year = {${t.year}},`,
    `  url = {${t.url}},`,
    `  license = {${t.license}}`,
    `}`,
  ].join("\n");
}

/** A stable, ASCII BibTeX key from a dataset short name. */
function datasetKey(ref: DatasetRef): string {
  return `dataset_${ref.shortName.replace(/[^A-Za-z0-9]/g, "")}_v${ref.version.replace(/[^A-Za-z0-9]/g, "")}`;
}

/** BibTeX @misc entry for a source dataset, with its DOI. */
export function bibtexDataset(ref: DatasetRef): string {
  return [
    `@misc{${datasetKey(ref)},`,
    `  title = {${bibtexEscape(ref.title)} (${ref.shortName} v${ref.version})},`,
    `  howpublished = {NASA Global Imagery Browse Services (GIBS)},`,
    `  doi = {${ref.doi}},`,
    `  url = {${doiResolverUrl(ref.doi)}}`,
    `}`,
  ].join("\n");
}

/** RIS entry for the tool (TY=COMP, software). */
export function risTool(): string {
  const t = TOOL_CITATION;
  return [
    `TY  - COMP`,
    `TI  - ${t.title}`,
    `AU  - ${t.author}`,
    `PY  - ${t.year}`,
    `ET  - ${t.version}`,
    `UR  - ${t.url}`,
    `ER  - `,
  ].join("\n");
}

/** RIS entry for a source dataset (TY=DATA), with its DOI. */
export function risDataset(ref: DatasetRef): string {
  return [
    `TY  - DATA`,
    `TI  - ${ref.title} (${ref.shortName} v${ref.version})`,
    `PB  - NASA Global Imagery Browse Services (GIBS)`,
    `DO  - ${ref.doi}`,
    `UR  - ${doiResolverUrl(ref.doi)}`,
    `ER  - `,
  ].join("\n");
}

/**
 * Human-readable formatted-text citation for the tool. Unlike BibTeX/RIS —
 * which target reference managers — this is the string to drop into a figure
 * caption, slide, or a "How to cite" box, following the ESIP software-citation
 * ordering: author (year), title, version, resource type, resolvable DOI/URL.
 */
export function textTool(): string {
  const t = TOOL_CITATION;
  return `${t.author} (${t.year}). ${t.title} (Version ${t.version}) [Software]. ${t.url}`;
}

/**
 * Human-readable formatted-text citation for a source dataset. Built only from
 * the provenance fields we actually hold (title, short name, version, DOI) and
 * the known publisher — no author or release date is invented, so the string
 * never over-claims metadata the DatasetRef does not carry. The DOI is rendered
 * as a resolvable link, per the ESIP data-citation guidelines.
 */
export function textDataset(ref: DatasetRef): string {
  return `${ref.title} (${ref.shortName} v${ref.version}) [Data set]. NASA Global Imagery Browse Services (GIBS). ${doiResolverUrl(ref.doi)}`;
}

export type CitationFormat = "bibtex" | "ris" | "text";

/**
 * The full citation bundle a researcher needs: the tool plus every source
 * dataset it renders, deduplicated, in the requested format — ready to paste
 * into a reference manager.
 */
export function citationBundle(format: CitationFormat): string {
  const datasets = citedDatasets().map((c) => c.dataset);
  if (format === "ris") {
    return [risTool(), ...datasets.map(risDataset)].join("\n\n") + "\n";
  }
  if (format === "text") {
    return [textTool(), ...datasets.map(textDataset)].join("\n\n") + "\n";
  }
  return [bibtexTool(), ...datasets.map(bibtexDataset)].join("\n\n") + "\n";
}
