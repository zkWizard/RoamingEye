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

export type CitationFormat = "bibtex" | "ris";

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
  return [bibtexTool(), ...datasets.map(bibtexDataset)].join("\n\n") + "\n";
}
