import type { EnvironmentBrief, EnvironmentSignalId } from "./environmentBrief";
import type { DatasetRef } from "./timeline";

/**
 * Cross-citation DOI-consistency rigor for provenance-first output.
 *
 * RoamingEye credits and cites its sources deduplicated *by DOI*:
 * `attributeBrief`, `citedDatasets`, and `briefCitationBundle` all collapse refs
 * that share a DOI to a single entry — keeping the first-seen ref and dropping
 * the rest (rainfall and soil moisture are both GLDAS, one DOI, cited once; see
 * METHODS.md). That dedup is only sound if a DOI uniquely identifies a dataset:
 * every ref sharing a DOI must also carry the same shortName, version, and
 * title. Nothing checked it. A catalog re-point that left two same-DOI refs
 * disagreeing on version (say GLDAS "2.0" for rainfall but "2.1" for soil
 * moisture) would be silently collapsed to one arbitrary citation, and which
 * metadata a reader is handed would depend on signal order — a provenance defect
 * no existing audit catches. `auditDatasetCitation` (citationCompleteness.ts)
 * checks each ref in isolation for presence and DOI shape; it cannot see that
 * two independently-complete refs disagree. `auditCitationCffConsistency`
 * (citationCff.ts) guards the *tool's* metadata, not the *datasets'*.
 *
 * This module makes the dedup assumption testable. It groups the audited refs by
 * DOI and, for every DOI carried by two or more refs, checks they agree on the
 * three identifying citation fields. It is a metadata-integrity check only: it
 * does NOT dereference the DOI over the network (that remains the weekly citation
 * contract's job) and makes no claim about the scientific values a brief reports.
 */

/** The DatasetRef fields that must agree across refs sharing one DOI. */
export type CitationIdentityField = "shortName" | "version" | "title";

export interface CitationFieldConflict {
  field: CitationIdentityField;
  /**
   * The distinct trimmed values found for this field within the DOI group, in
   * first-seen order. Always 2+ entries — a single distinct value is agreement,
   * not a conflict.
   */
  values: string[];
  /** Human-readable explanation, safe to surface in a UI, log, or CI failure. */
  detail: string;
}

/** One DOI carried by two or more of the audited refs, with any disagreements. */
export interface DoiCitationGroup {
  /** The trimmed DOI shared by this group's refs. */
  doi: string;
  /** Labels of the refs carrying this DOI, in first-seen order. */
  members: string[];
  /** Field-level disagreements among the group's refs; empty when they agree. */
  conflicts: CitationFieldConflict[];
  /** True only when every identifying field agrees across the group. */
  consistent: boolean;
}

export interface CitationConsistencyAudit {
  /** True only when every shared DOI's refs agree on all identifying fields. */
  consistent: boolean;
  /**
   * One entry per DOI carried by 2+ refs, in first-seen order. A DOI carried by
   * a single ref cannot disagree with itself and is omitted — there is nothing
   * to cross-check.
   */
  sharedDois: DoiCitationGroup[];
  /** DOIs whose refs disagree, for quick triage (a subset of `sharedDois`). */
  conflictingDois: string[];
  /** Honest one-line summary; carries no claim about the reported values. */
  statement: string;
}

/** A source dataset paired with a human label, for consistency auditing. */
export interface LabeledCitation {
  source: DatasetRef;
  /** Human handle for triage — a signal id, a layer label, etc. */
  label: string;
}

/** The identifying fields checked for agreement, in report order. */
const IDENTITY_FIELDS: readonly CitationIdentityField[] = [
  "shortName",
  "version",
  "title",
];

/**
 * Group the audited citations by DOI and check that every DOI shared by two or
 * more refs carries the same identifying metadata. This is the enforcement point
 * for the dedup-by-DOI assumption every citation credit path relies on: an audit
 * with `consistent === false` means at least one DOI would deduplicate to an
 * order-dependent, ambiguous citation and should not be treated as publishable.
 *
 * Refs with a blank or absent DOI are skipped: they cannot be grouped or
 * deduplicated by DOI, and their emptiness is already a completeness defect
 * (`auditDatasetCitation`) — flagging it here too would double-count it.
 */
export function auditCitationConsistency(
  entries: readonly LabeledCitation[]
): CitationConsistencyAudit {
  const groups = new Map<string, LabeledCitation[]>();
  const order: string[] = [];
  for (const entry of entries) {
    const doi =
      typeof entry.source.doi === "string" ? entry.source.doi.trim() : "";
    if (doi.length === 0) continue;
    let bucket = groups.get(doi);
    if (!bucket) {
      bucket = [];
      groups.set(doi, bucket);
      order.push(doi);
    }
    bucket.push(entry);
  }

  const sharedDois: DoiCitationGroup[] = [];
  for (const doi of order) {
    const bucket = groups.get(doi)!;
    if (bucket.length < 2) continue; // a lone ref has nothing to conflict with
    const conflicts = fieldConflicts(bucket);
    sharedDois.push({
      doi,
      members: bucket.map((entry) => entry.label),
      conflicts,
      consistent: conflicts.length === 0,
    });
  }

  const conflictingDois = sharedDois
    .filter((group) => !group.consistent)
    .map((group) => group.doi);

  return {
    consistent: conflictingDois.length === 0,
    sharedDois,
    conflictingDois,
    statement: consistencyStatement(sharedDois.length, conflictingDois),
  };
}

/**
 * The distinct trimmed values each identifying field takes across a DOI group.
 * A field with more than one distinct value is a conflict: the refs sharing this
 * DOI would deduplicate to whichever the caller happened to see first. Values
 * are trimmed before comparison so trailing whitespace alone is not reported as
 * a disagreement, matching the completeness audit's blank/trim handling.
 */
function fieldConflicts(
  bucket: readonly LabeledCitation[]
): CitationFieldConflict[] {
  const conflicts: CitationFieldConflict[] = [];
  for (const field of IDENTITY_FIELDS) {
    const values: string[] = [];
    for (const entry of bucket) {
      const raw = entry.source[field];
      const value = typeof raw === "string" ? raw.trim() : "";
      if (!values.includes(value)) values.push(value);
    }
    if (values.length > 1) {
      conflicts.push({
        field,
        values,
        detail: `${field} disagrees across the shared DOI: ${values
          .map((value) => `"${value}"`)
          .join(" vs ")}`,
      });
    }
  }
  return conflicts;
}

function consistencyStatement(
  sharedCount: number,
  conflictingDois: string[]
): string {
  if (sharedCount === 0) {
    return "No DOI is shared by multiple citations; nothing to cross-check.";
  }
  const noun = sharedCount === 1 ? "shared DOI" : "shared DOIs";
  if (conflictingDois.length === 0) {
    return `All ${sharedCount} ${noun} carry consistent citation metadata across their sources.`;
  }
  return `${conflictingDois.length} of ${sharedCount} ${noun} carry conflicting citation metadata: ${conflictingDois.join(", ")}.`;
}

/**
 * Audit the citations of a composed brief for cross-signal DOI consistency. This
 * is the brief-scoped enforcement point: `attributeBrief` and
 * `briefCitationBundle` deduplicate the brief's signals by DOI, so a brief whose
 * two GLDAS signals disagreed on version would credit an order-dependent
 * citation. Signals are labeled by their id, so an offending DOI names exactly
 * which signals disagree.
 */
export function auditBriefCitationConsistency(
  brief: Pick<EnvironmentBrief, "signals">
): CitationConsistencyAudit {
  return auditCitationConsistency(
    brief.signals.map((signal): LabeledCitation => ({
      source: signal.source,
      label: signal.id satisfies EnvironmentSignalId,
    }))
  );
}
