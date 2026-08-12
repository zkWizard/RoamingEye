import {
  citedVectorSources,
  type VectorSourceCitation,
} from "./citedVectorSources";
import { citedDatasets } from "./providers";
import type { DatasetRef } from "./timeline";

/**
 * Machine-readable citations (ESIP data & software citation guidelines):
 * export the tool and its source datasets in the formats reference managers
 * ingest — BibTeX (LaTeX), RIS (EndNote/Zotero/Mendeley), and CSL-JSON (the
 * Citation Style Language item format that pandoc, Quarto, and Zotero's
 * "Better BibTeX" round-trip) — each carrying a resolvable DOI wherever the
 * source has one, rather than a bare URL. A researcher should be able to copy a
 * citation and drop it straight into a manuscript or a `references.json`.
 *
 * "Sources" means everything the app renders, not just the imagery: the GIBS
 * products behind the layers and the vector datasets behind the volcano,
 * earthquake, and plate-boundary overlays. One of those (the USGS feed) has no
 * DOI at all; it is cited by URL and says so, because dropping it from the
 * bundle would silently under-credit data the reader can plainly see on screen.
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
  /**
   * CSL item type: the tool is "software", a data product is a "dataset", and
   * "article-journal" covers a source whose DOI resolves to the paper defining
   * the model rather than to a data product (see citedVectorSources.ts).
   */
  type: "software" | "dataset" | "article-journal";
  title: string;
  author?: CslName[];
  issued?: CslDate;
  version?: string;
  publisher?: string;
  /** Journal or database the work appeared in, per CSL's `container-title`. */
  "container-title"?: string;
  volume?: string;
  issue?: string;
  /** Bare DOI (no resolver prefix), per CSL's `DOI` variable. */
  DOI?: string;
  URL?: string;
  /** Free-text qualification a reader needs, per CSL's `note` variable. */
  note?: string;
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

/**
 * The formatters above are specific to a CMR `DatasetRef`: they hard-code NASA
 * GIBS as the publisher and assume a short name, a version, and a DOI. The
 * globe also renders three vector datasets that are none of those things (see
 * citedVectorSources.ts), so they get their own formatters rather than being
 * squeezed into a shape that would misattribute them to GIBS.
 *
 * Each formatter emits only the fields the source actually holds. A source with
 * no DOI is located by its URL alone — no DOI field is emitted empty, and none
 * is borrowed — and its qualifying `note` travels with the entry so the
 * limitation is not lost between the app and the manuscript.
 */

/** BibTeX entry for a rendered vector source. */
export function bibtexVectorSource(ref: VectorSourceCitation): string {
  const entry = ref.type === "article-journal" ? "article" : "misc";
  const title =
    ref.version === undefined
      ? bibtexEscape(ref.title)
      : `${bibtexEscape(ref.title)} (v${bibtexEscape(ref.version)})`;
  const lines = [`@${entry}{${ref.key},`, `  title = {${title}},`];
  if (ref.author) lines.push(`  author = {${bibtexEscape(ref.author)}},`);
  if (ref.containerTitle)
    lines.push(`  journal = {${bibtexEscape(ref.containerTitle)}},`);
  if (ref.volume) lines.push(`  volume = {${bibtexEscape(ref.volume)}},`);
  if (ref.issue) lines.push(`  number = {${bibtexEscape(ref.issue)}},`);
  if (ref.year !== undefined) lines.push(`  year = {${ref.year}},`);
  if (ref.publisher)
    lines.push(`  publisher = {${bibtexEscape(ref.publisher)}},`);
  if (ref.version !== undefined)
    lines.push(`  version = {${bibtexEscape(ref.version)}},`);
  if (ref.doi) lines.push(`  doi = {${bibtexEscape(ref.doi)}},`);
  if (ref.note) lines.push(`  note = {${bibtexEscape(ref.note)}},`);
  // The locator closes the entry, so it carries no trailing comma.
  lines.push(`  url = {${ref.doi ? doiResolverUrl(ref.doi) : ref.url}}`);
  lines.push(`}`);
  return lines.join("\n");
}

/** RIS entry for a rendered vector source (TY=DATA, or JOUR for an article). */
export function risVectorSource(ref: VectorSourceCitation): string {
  const lines = [
    `TY  - ${ref.type === "article-journal" ? "JOUR" : "DATA"}`,
    `TI  - ${ref.version === undefined ? ref.title : `${ref.title} (v${ref.version})`}`,
  ];
  if (ref.author) lines.push(`AU  - ${ref.author}`);
  if (ref.year !== undefined) lines.push(`PY  - ${ref.year}`);
  if (ref.containerTitle) lines.push(`JO  - ${ref.containerTitle}`);
  if (ref.volume) lines.push(`VL  - ${ref.volume}`);
  if (ref.issue) lines.push(`IS  - ${ref.issue}`);
  if (ref.publisher) lines.push(`PB  - ${ref.publisher}`);
  if (ref.doi) lines.push(`DO  - ${ref.doi}`);
  lines.push(`UR  - ${ref.doi ? doiResolverUrl(ref.doi) : ref.url}`);
  if (ref.note) lines.push(`N1  - ${ref.note}`);
  lines.push(`ER  - `);
  return lines.join("\n");
}

/**
 * Human-readable formatted-text citation for a rendered vector source. When the
 * repo holds the publisher's own reference string it is used verbatim, so the
 * rendered citation is the publisher's wording rather than a reconstruction.
 */
export function textVectorSource(ref: VectorSourceCitation): string {
  const head =
    ref.formattedCitation ??
    [
      ref.publisher,
      ref.version === undefined ? ref.title : `${ref.title} (v${ref.version})`,
      ref.type === "article-journal" ? undefined : "[Data set]",
    ]
      .filter((part) => part !== undefined)
      .join(". ");
  const locator = ref.doi ? doiResolverUrl(ref.doi) : ref.url;
  return [head, locator, ref.note].filter(Boolean).join(". ");
}

/** CSL-JSON item for a rendered vector source. */
export function cslVectorSource(ref: VectorSourceCitation): CslItem {
  const item: CslItem = {
    id: ref.key,
    type: ref.type,
    title:
      ref.version === undefined ? ref.title : `${ref.title} (v${ref.version})`,
    URL: ref.doi ? doiResolverUrl(ref.doi) : ref.url,
  };
  if (ref.author) item.author = [{ literal: ref.author }];
  if (ref.year !== undefined) item.issued = { "date-parts": [[ref.year]] };
  if (ref.version !== undefined) item.version = ref.version;
  if (ref.publisher) item.publisher = ref.publisher;
  if (ref.containerTitle) item["container-title"] = ref.containerTitle;
  if (ref.volume) item.volume = ref.volume;
  if (ref.issue) item.issue = ref.issue;
  if (ref.doi) item.DOI = ref.doi;
  if (ref.note) item.note = ref.note;
  return item;
}

export type CitationFormat = "bibtex" | "ris" | "text" | "csljson";

/**
 * The full citation bundle a researcher needs: the tool, every GIBS source
 * dataset it renders (deduplicated by DOI), and the vector sources behind the
 * volcano, earthquake, and plate-boundary overlays — in the requested format,
 * ready to paste into a reference manager.
 *
 * The two groups are kept in a fixed order (imagery, then vector) so the bundle
 * is byte-stable across calls and diffable between releases.
 */
export function citationBundle(format: CitationFormat): string {
  const datasets = citedDatasets().map((c) => c.dataset);
  const vectors = citedVectorSources();
  if (format === "ris") {
    return (
      [
        risTool(),
        ...datasets.map(risDataset),
        ...vectors.map(risVectorSource),
      ].join("\n\n") + "\n"
    );
  }
  if (format === "text") {
    return (
      [
        textTool(),
        ...datasets.map(textDataset),
        ...vectors.map(textVectorSource),
      ].join("\n\n") + "\n"
    );
  }
  if (format === "csljson") {
    return cslJson([
      cslTool(),
      ...datasets.map(cslDataset),
      ...vectors.map(cslVectorSource),
    ]);
  }
  return (
    [
      bibtexTool(),
      ...datasets.map(bibtexDataset),
      ...vectors.map(bibtexVectorSource),
    ].join("\n\n") + "\n"
  );
}
