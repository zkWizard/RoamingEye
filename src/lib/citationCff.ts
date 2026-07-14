import { TOOL_CITATION } from "./citation";

/**
 * Drift guard between the two places RoamingEye states how to cite the tool.
 *
 * The project publishes the same tool metadata twice, for two audiences:
 *   - CITATION.cff — the human/GitHub-facing citation file, hand-edited; and
 *   - TOOL_CITATION in citation.ts — the machine-readable source the BibTeX and
 *     RIS exporters build from.
 *
 * citation.ts already carries the comment "kept in step with CITATION.cff (the
 * human-facing source)", but nothing enforced it: the title, author, url,
 * license, and version live as independent string literals in both files, so a
 * change to one could silently diverge from the other. A researcher who copies
 * the CFF and a colleague who copies the app's BibTeX would then cite the same
 * release with different metadata — a provenance defect this module makes
 * machine-checkable.
 *
 * This is a metadata-consistency check only. It reads a known subset of scalar
 * fields from the CFF text and compares them field-by-field to TOOL_CITATION;
 * it does NOT validate the CFF against the full Citation File Format schema, nor
 * make any claim about the datasets a brief reports. Pure and offline-testable;
 * a companion test also runs it against the committed CITATION.cff so real drift
 * fails CI naming the field.
 */

/** The tool-citation fields cross-published in both CITATION.cff and citation.ts. */
export type CffField = "title" | "author" | "url" | "license" | "version";

/** The tool metadata shape this module compares against (a subset of TOOL_CITATION). */
export interface CitationToolMetadata {
  title: string;
  author: string;
  url: string;
  license: string;
  version: string;
}

/**
 * The subset of CITATION.cff scalar fields RoamingEye also states in
 * TOOL_CITATION. `author` is the first entry of the CFF `authors:` list (the
 * tool cites a single collective author). Null means the field was absent.
 */
export interface ParsedCitationCff {
  title: string | null;
  author: string | null;
  url: string | null;
  license: string | null;
  version: string | null;
}

export type CffIssueCode = "missing-in-cff" | "mismatch";

export interface CffConsistencyIssue {
  field: CffField;
  code: CffIssueCode;
  /** Value found in CITATION.cff (null when the field is absent). */
  cffValue: string | null;
  /** Value TOOL_CITATION states for the same field. */
  toolValue: string;
  /** Human-readable explanation, safe to surface in a log or CI failure. */
  detail: string;
}

export interface CffConsistencyAudit {
  /** True only when every compared field is present and matches TOOL_CITATION. */
  consistent: boolean;
  /** Empty when consistent; otherwise one entry per defect, in field order. */
  issues: CffConsistencyIssue[];
}

/**
 * Strip a single pair of matching surrounding quotes from a scalar value. YAML
 * accepts bare, single-, and double-quoted scalars; the CFF fields we read are
 * simple one-line scalars, so this is all the unquoting they need.
 */
function stripQuotes(raw: string): string {
  const v = raw.trim();
  if (
    v.length >= 2 &&
    ((v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'")))
  ) {
    return v.slice(1, -1);
  }
  return v;
}

/** Read a top-level (unindented) scalar `key: value` line; null if absent/blank. */
function topLevelScalar(text: string, key: CffField | "url"): string | null {
  // Anchored to column 0 so a nested key of the same name can't be mistaken for
  // the top-level one. Keys here are fixed literals, so no escaping is needed.
  const match = new RegExp(`^${key}:[ \\t]*(.*)$`, "m").exec(text);
  if (!match) return null;
  const value = stripQuotes(match[1]);
  return value.length === 0 ? null : value;
}

/**
 * Read the first author's `name` from the CFF `authors:` block. Scans the lines
 * under `authors:` until the block ends (the next unindented, non-list key) and
 * returns the first `name:` it finds.
 */
function firstAuthorName(text: string): string | null {
  const lines = text.split(/\r?\n/);
  const start = lines.findIndex((line) => /^authors:[ \t]*$/.test(line));
  if (start === -1) return null;
  for (let i = start + 1; i < lines.length; i++) {
    const line = lines[i];
    // A new top-level key (unindented, not a `- ` list item) closes the block.
    if (/^\S/.test(line) && !/^\s*-/.test(line)) break;
    const match = /^\s*(?:-\s*)?name:[ \t]*(.*)$/.exec(line);
    if (match) {
      const value = stripQuotes(match[1]);
      return value.length === 0 ? null : value;
    }
  }
  return null;
}

/**
 * Parse the RoamingEye-relevant scalar fields out of CITATION.cff text. This is
 * a deliberately narrow reader for the five fields the tool also states in
 * TOOL_CITATION — not a general Citation File Format parser.
 */
export function parseCitationCff(text: string): ParsedCitationCff {
  return {
    title: topLevelScalar(text, "title"),
    author: firstAuthorName(text),
    url: topLevelScalar(text, "url"),
    license: topLevelScalar(text, "license"),
    version: topLevelScalar(text, "version"),
  };
}

const FIELD_ORDER: readonly CffField[] = [
  "title",
  "author",
  "url",
  "license",
  "version",
];

/**
 * Audit CITATION.cff text for consistency with the machine-readable
 * TOOL_CITATION. Reports a field as `missing-in-cff` when the CFF omits it and
 * `mismatch` when both state it but disagree, so a drift between the two
 * citation sources is caught and named rather than shipped silently.
 */
export function auditCitationCffConsistency(
  cffText: string,
  tool: CitationToolMetadata = TOOL_CITATION
): CffConsistencyAudit {
  const parsed = parseCitationCff(cffText);
  // String(...) normalizes the version, which TOOL_CITATION injects from the
  // build (`__APP_VERSION__`) and the CFF writes as a bare scalar.
  const toolValues: Record<CffField, string> = {
    title: tool.title,
    author: tool.author,
    url: tool.url,
    license: tool.license,
    version: String(tool.version),
  };

  const issues: CffConsistencyIssue[] = [];
  for (const field of FIELD_ORDER) {
    const cffValue = parsed[field];
    const toolValue = toolValues[field];
    if (cffValue === null) {
      issues.push({
        field,
        code: "missing-in-cff",
        cffValue,
        toolValue,
        detail: `CITATION.cff is missing ${field}; TOOL_CITATION states "${toolValue}"`,
      });
    } else if (cffValue !== toolValue) {
      issues.push({
        field,
        code: "mismatch",
        cffValue,
        toolValue,
        detail: `${field} differs: CITATION.cff "${cffValue}" vs TOOL_CITATION "${toolValue}"`,
      });
    }
  }

  return { consistent: issues.length === 0, issues };
}
