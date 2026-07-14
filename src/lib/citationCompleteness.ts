import type { EnvironmentBrief, EnvironmentSignalId } from "./environmentBrief";
import type { DatasetRef } from "./timeline";

/**
 * Citation-completeness rigor for provenance-first output.
 *
 * The environment brief is provenance-first by contract: every signal it
 * renders or summarizes must stay bound to a complete, resolvable dataset
 * citation ("never drop a DatasetRef"; see METHODS.md and the providers page).
 * That invariant was asserted in prose and enforced at the catalog edge, but
 * never machine-checked over the *brief output itself* — a signal whose
 * `source` lost a field, or carried a malformed DOI, would still emit a
 * confident-looking statement bound to a broken citation.
 *
 * This module makes the invariant testable at the synthesis layer. It inspects
 * the four DatasetRef fields RoamingEye cites on — shortName, version, doi, and
 * title — for presence and non-blankness, and checks the DOI is *shaped* like a
 * registered DOI (`10.<registrant>/<suffix>`) so a copied citation resolves
 * rather than 404s. It is a metadata-integrity check only: it does NOT
 * dereference the DOI over the network (that is the weekly citation contract's
 * job), and it makes no claim about the scientific values a brief reports.
 */

/** The DatasetRef fields a RoamingEye citation must carry to be usable. */
export type CitationField = "shortName" | "version" | "doi" | "title";

export type CitationIssueCode = "missing" | "blank" | "malformed-doi";

export interface CitationIssue {
  field: CitationField;
  code: CitationIssueCode;
  /** Human-readable explanation, safe to surface in a UI or log. */
  detail: string;
}

export interface CitationAudit {
  /** True only when every required field is present and the DOI is well-shaped. */
  complete: boolean;
  /** Empty when complete; otherwise one entry per defect, in field order. */
  issues: CitationIssue[];
}

const REQUIRED_FIELDS: readonly CitationField[] = [
  "shortName",
  "version",
  "doi",
  "title",
];

/**
 * A registered DOI: the "10." prefix, a numeric registrant, then a non-empty
 * suffix. Matches the DataCite/Crossref shape without asserting the suffix's
 * internal grammar (DOIs are opaque and case-insensitive after the prefix).
 * This checks *shape*, not resolvability — a well-shaped DOI can still 404.
 */
const DOI_SHAPE = /^10\.\d{4,9}\/\S+$/;

/**
 * Audit a single dataset citation for completeness. Guards against
 * runtime-degenerate refs (a field gone missing, whitespace-only, or a DOI
 * that lost its prefix) even though the static type promises four strings —
 * the values originate in an external catalog and can degrade without the
 * compiler noticing.
 */
export function auditDatasetCitation(ref: DatasetRef): CitationAudit {
  const issues: CitationIssue[] = [];

  for (const field of REQUIRED_FIELDS) {
    const value = ref[field];
    if (typeof value !== "string" || value.length === 0) {
      issues.push({ field, code: "missing", detail: `${field} is absent` });
      continue;
    }
    if (value.trim().length === 0) {
      issues.push({ field, code: "blank", detail: `${field} is blank` });
    }
  }

  // Only shape-check a DOI that is actually present and non-blank; a missing
  // or blank DOI is already reported above, and re-flagging it as malformed
  // would double-count the same defect.
  const doi = ref.doi;
  if (
    typeof doi === "string" &&
    doi.trim().length > 0 &&
    !DOI_SHAPE.test(doi.trim())
  ) {
    issues.push({
      field: "doi",
      code: "malformed-doi",
      detail: `doi "${doi}" is not a registered DOI (expected 10.<registrant>/<suffix>)`,
    });
  }

  return { complete: issues.length === 0, issues };
}

export interface SignalCitationAudit extends CitationAudit {
  signalId: EnvironmentSignalId;
  source: DatasetRef;
}

export interface BriefCitationAudit {
  /** True only when every signal carries a complete, well-shaped citation. */
  allCited: boolean;
  /** One audit per signal, in the brief's signal order. */
  signals: SignalCitationAudit[];
  /** Signals whose citation is incomplete or malformed, for quick triage. */
  incompleteSignalIds: EnvironmentSignalId[];
  /** Honest one-line summary; carries no claim about the reported values. */
  statement: string;
}

/**
 * Audit every signal's citation in a composed brief. This is the enforcement
 * point for the provenance-first "never drop a DatasetRef" invariant: a brief
 * with `allCited === false` is emitting at least one signal bound to an
 * incomplete or malformed citation and should not be treated as publishable.
 */
export function auditBriefCitations(
  brief: Pick<EnvironmentBrief, "signals">
): BriefCitationAudit {
  const signals: SignalCitationAudit[] = brief.signals.map((signal) => ({
    signalId: signal.id,
    source: signal.source,
    ...auditDatasetCitation(signal.source),
  }));
  const incompleteSignalIds = signals
    .filter((audit) => !audit.complete)
    .map((audit) => audit.signalId);

  return {
    allCited: incompleteSignalIds.length === 0,
    signals,
    incompleteSignalIds,
    statement: briefCitationStatement(signals.length, incompleteSignalIds),
  };
}

function briefCitationStatement(
  total: number,
  incompleteSignalIds: EnvironmentSignalId[]
): string {
  if (total === 0) return "No signals to check for citation completeness.";
  const noun = total === 1 ? "signal" : "signals";
  if (incompleteSignalIds.length === 0) {
    return `All ${total} ${noun} carry a complete, well-formed dataset citation.`;
  }
  return `${incompleteSignalIds.length} of ${total} ${noun} have an incomplete or malformed citation: ${incompleteSignalIds.join(", ")}.`;
}
