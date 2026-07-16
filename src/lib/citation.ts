import { citedDatasets } from "./providers";
import type { DatasetRef } from "./timeline";

/**
 * Machine-readable citations (ESIP data & software citation guidelines):
 * export the tool and its source datasets in the formats reference managers
 * ingest — BibTeX (LaTeX), RIS (EndNote/Zotero/Mendeley), and CSL-JSON (the
 * Citation Style Language item format that pandoc, Quarto, and Zotero's
 * "Better BibTeX" round-trip) — each carrying a resolvable DOI, not a bare URL.
 * A researcher should be able to copy a citation and drop it straight into a
 * manuscript or a `references.json`.
 *
 * Pure and tested; the in-app "Copy citation" affordance calls these.
 */

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
    `  url = {https://doi.org/${ref.doi}}`,
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
    `UR  - https://doi.org/${ref.doi}`,
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
  return `${ref.title} (${ref.shortName} v${ref.version}) [Data set]. NASA Global Imagery Browse Services (GIBS). https://doi.org/${ref.doi}`;
}

/**
 * A CSL-JSON item (Citation Style Language, the item shape pandoc/Quarto/Zotero
 * ingest). Only the subset of standard CSL variables we can populate from the
 * provenance we actually hold is typed here — nothing is invented. Optional
 * fields are omitted entirely (not emitted as null) when the source lacks them,
 * so the item never over-claims metadata: the tool carries no DOI, and a
 * DatasetRef carries no author or publication date.
 */
export interface CslName {
  /** Organizational/collective name as a single literal (no family/given split). */
  literal: string;
}

export interface CslDate {
  /** CSL date encoding; a year-only date is `[[year]]`. */
  "date-parts": number[][];
}

export interface CslItem {
  /** Stable citation key (matches the BibTeX key for the same work). */
  id: string;
  /** CSL item type: the tool is "software", each source is a "dataset". */
  type: "software" | "dataset";
  title: string;
  author?: CslName[];
  issued?: CslDate;
  version?: string;
  publisher?: string;
  /** Bare DOI (no resolver prefix), per CSL's `DOI` variable. */
  DOI?: string;
  URL?: string;
}

/** CSL-JSON item for the tool (type "software"). */
export function cslTool(): CslItem {
  const t = TOOL_CITATION;
  return {
    id: "roamingeye",
    type: "software",
    title: t.title,
    author: [{ literal: t.author }],
    issued: { "date-parts": [[t.year]] },
    version: t.version,
    URL: t.url,
  };
}

/**
 * CSL-JSON item for a source dataset (type "dataset"), carrying its DOI as both
 * the `DOI` variable and a resolvable `URL`. Built only from the provenance
 * fields the DatasetRef holds and the known publisher — no author or release
 * date is invented.
 */
export function cslDataset(ref: DatasetRef): CslItem {
  return {
    id: datasetKey(ref),
    type: "dataset",
    title: `${ref.title} (${ref.shortName} v${ref.version})`,
    publisher: "NASA Global Imagery Browse Services (GIBS)",
    version: ref.version,
    DOI: ref.doi,
    URL: `https://doi.org/${ref.doi}`,
  };
}

/**
 * Serialize CSL items as a pretty-printed JSON array with a trailing newline —
 * the on-disk shape of a `references.json` a manuscript pipeline reads.
 */
export function cslJson(items: readonly CslItem[]): string {
  return JSON.stringify(items, null, 2) + "\n";
}

export type CitationFormat = "bibtex" | "ris" | "text" | "csljson";

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
  if (format === "csljson") {
    return cslJson([cslTool(), ...datasets.map(cslDataset)]);
  }
  return [bibtexTool(), ...datasets.map(bibtexDataset)].join("\n\n") + "\n";
}
