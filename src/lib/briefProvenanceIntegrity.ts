import {
  unsupportedBriefLanguageHits,
  type EnvironmentBrief,
  type EnvironmentSignalBrief,
  type EnvironmentSignalId,
  type EnvironmentSignalStatus,
} from "./environmentBrief";
import {
  auditBriefCitations,
  type BriefCitationAudit,
} from "./citationCompleteness";

/**
 * Provenance-integrity gate for a composed environment brief.
 *
 * RoamingEye already carries a rich set of independent provenance descriptors —
 * citation completeness, temporal alignment, co-observation, currency, value
 * uncertainty, and more — but each answers one narrow question and none states,
 * in a single go/no-go, whether a composed brief satisfies the structural
 * invariants required to hand it to someone as provenance-first output. Export
 * and "Copy citation" affordances therefore had no one place to ask: *is this
 * brief self-consistent and on-message enough to publish?*
 *
 * This module is that gate. It composes checks that must all hold for a brief to
 * be sound as provenance-complete output, WITHOUT judging the scientific data:
 *
 *  - **citations-complete** — every signal carries a complete, well-shaped
 *    DatasetRef (the "never drop a DatasetRef" contract). Delegates to
 *    `auditBriefCitations`, so the export path and the brief share one standard.
 *  - **language-bounded** — the brief's *generated* prose carries none of the
 *    unsupported-claim vocabulary (risk, forecast, diagnosis, causation, …).
 *    Crucially this scans the brief's derived statements too — its completeness
 *    and temporal-alignment sentences — which the brief's own
 *    `unsupportedLanguageHits` field does not: that field is built only from the
 *    per-signal statements, so an over-claim in a derived sentence would slip
 *    past it. This gate closes that surface.
 *  - **status-accounted** — the completeness tally is self-consistent with the
 *    signals it summarizes: every signal's status is one of the four known
 *    states, and the recomputed per-status counts and totals match the brief's.
 *    A guard against a degraded or hand-assembled brief whose headline tally
 *    silently disagrees with its own signals.
 *
 * It is a metadata-and-prose integrity check only. `sound === true` means the
 * brief is internally consistent and on-message enough to export as
 * provenance-first output; it is NOT a claim that the values are accurate, fit
 * for a purpose, or free of the source products' own uncertainty. The shared
 * method limits and the source products' own validation still govern the data.
 */

export type IntegrityCheckId =
  "citations-complete" | "language-bounded" | "status-accounted";

/** Fixed reporting order, so no check is silently dropped or reordered. */
const INTEGRITY_CHECK_IDS: readonly IntegrityCheckId[] = [
  "citations-complete",
  "language-bounded",
  "status-accounted",
];

/** The four signal states the completeness tally must account for. */
const KNOWN_STATUSES: readonly EnvironmentSignalStatus[] = [
  "available",
  "no-data",
  "invalid",
  "unavailable",
];

export interface IntegrityCheck {
  id: IntegrityCheckId;
  passed: boolean;
  /** Human-readable explanation, safe to surface in a UI or log. */
  detail: string;
}

export interface BriefIntegrityReport {
  kind: "brief-provenance-integrity";
  /** True only when every integrity check passed. */
  sound: boolean;
  /** One result per check, in fixed `INTEGRITY_CHECK_IDS` order. */
  checks: IntegrityCheck[];
  /** Ids of the checks that failed, in check order; empty when sound. */
  failedCheckIds: IntegrityCheckId[];
  /** The delegated citation audit, retained for traceable per-signal detail. */
  citationAudit: BriefCitationAudit;
  /** Signals whose citation is incomplete or malformed, for quick triage. */
  incompleteCitationSignalIds: EnvironmentSignalId[];
  /**
   * Unsupported-claim vocabulary found anywhere in the brief's generated prose
   * (per-signal statements plus the derived completeness and temporal-alignment
   * sentences), deduplicated in first-seen order. Empty when language-bounded.
   */
  unsupportedLanguageHits: string[];
  /** Honest one-line summary; carries no claim about the reported values. */
  statement: string;
  limits: string[];
}

/**
 * The subset of a composed brief this gate reads. Callers pass a whole
 * `EnvironmentBrief`; tests can pass a minimal structural object.
 */
export type BriefIntegrityInput = Pick<
  EnvironmentBrief,
  "signals" | "statements" | "completeness" | "temporalAlignment"
>;

const INTEGRITY_LIMITS = [
  "This is a provenance-integrity and self-consistency gate over the brief's metadata and generated prose; it makes no judgement about the scientific fitness, accuracy, or condition the values imply.",
  "A sound brief is internally consistent and on-message enough to export as provenance-first output; it is not certified correct — the source products carry their own validation (see METHODS).",
  "Language screening is a lexical guard against a fixed unsupported-claim vocabulary, not a semantic guarantee that every sentence is claim-free.",
  "Citation checking verifies each DatasetRef is complete and well-shaped; it does not dereference the DOI over the network (that remains the weekly citation contract's job).",
];

/**
 * Gate a composed brief on the structural invariants required to export it as
 * provenance-first output. The checks are independent and all must pass for
 * `sound` to be true; each reports its own honest detail so a failing gate
 * points straight at the defect.
 */
export function auditBriefIntegrity(
  brief: BriefIntegrityInput
): BriefIntegrityReport {
  const citationAudit = auditBriefCitations({ signals: brief.signals });
  const languageHits = unsupportedLanguageAcrossBrief(brief);

  const checks: IntegrityCheck[] = [
    citationCheck(citationAudit),
    languageCheck(languageHits),
    statusAccountingCheck(brief),
  ].sort(
    (a, b) =>
      INTEGRITY_CHECK_IDS.indexOf(a.id) - INTEGRITY_CHECK_IDS.indexOf(b.id)
  );

  const failedCheckIds = checks
    .filter((check) => !check.passed)
    .map((check) => check.id);

  return {
    kind: "brief-provenance-integrity",
    sound: failedCheckIds.length === 0,
    checks,
    failedCheckIds,
    citationAudit,
    incompleteCitationSignalIds: citationAudit.incompleteSignalIds,
    unsupportedLanguageHits: languageHits,
    statement: integrityStatement(checks.length, failedCheckIds),
    limits: INTEGRITY_LIMITS,
  };
}

/**
 * Scan the brief's full generated-prose surface for unsupported-claim language.
 * This is a strict superset of the brief's own `unsupportedLanguageHits` field:
 * it adds the derived completeness and temporal-alignment sentences, which that
 * field omits. Hits are deduplicated in first-seen order.
 */
function unsupportedLanguageAcrossBrief(brief: BriefIntegrityInput): string[] {
  const prose = [
    ...brief.statements,
    brief.completeness.statement,
    brief.temporalAlignment.statement,
  ].join(" ");
  return [...new Set(unsupportedBriefLanguageHits(prose))];
}

function citationCheck(audit: BriefCitationAudit): IntegrityCheck {
  if (audit.allCited) {
    return {
      id: "citations-complete",
      passed: true,
      detail: audit.statement,
    };
  }
  return {
    id: "citations-complete",
    passed: false,
    detail: `Incomplete or malformed citation on: ${audit.incompleteSignalIds.join(", ")}.`,
  };
}

function languageCheck(hits: string[]): IntegrityCheck {
  if (hits.length === 0) {
    return {
      id: "language-bounded",
      passed: true,
      detail:
        "No unsupported-claim language in the brief's generated statements.",
    };
  }
  return {
    id: "language-bounded",
    passed: false,
    detail: `Unsupported-claim language present in generated prose: ${hits.join(", ")}.`,
  };
}

/**
 * Verify the completeness tally is self-consistent with the signals it claims to
 * summarize: no signal carries an unknown status, and every recomputed count —
 * per status, the total, and the available count — matches the brief's own.
 */
function statusAccountingCheck(brief: BriefIntegrityInput): IntegrityCheck {
  const { signals, completeness } = brief;
  const problems: string[] = [];

  const unknown = signals.filter(
    (signal) => !KNOWN_STATUSES.includes(signal.status)
  );
  if (unknown.length > 0) {
    problems.push(
      `unknown status ${unknown.map((s) => `${s.id}:${String(s.status)}`).join(", ")}`
    );
  }

  const recomputed = tallyByStatus(signals);
  for (const status of KNOWN_STATUSES) {
    const reported = completeness.byStatus[status];
    if (reported !== recomputed[status]) {
      problems.push(
        `${status} count ${reported} ≠ recomputed ${recomputed[status]}`
      );
    }
  }

  if (completeness.total !== signals.length) {
    problems.push(`total ${completeness.total} ≠ ${signals.length} signals`);
  }
  if (completeness.available !== recomputed.available) {
    problems.push(
      `available ${completeness.available} ≠ recomputed ${recomputed.available}`
    );
  }

  if (problems.length === 0) {
    return {
      id: "status-accounted",
      passed: true,
      detail: `Status tally consistent across ${signals.length} signal${signals.length === 1 ? "" : "s"}.`,
    };
  }
  return {
    id: "status-accounted",
    passed: false,
    detail: `Status accounting inconsistent: ${problems.join("; ")}.`,
  };
}

function tallyByStatus(
  signals: readonly EnvironmentSignalBrief[]
): Record<EnvironmentSignalStatus, number> {
  const tally = Object.fromEntries(
    KNOWN_STATUSES.map((status) => [status, 0])
  ) as Record<EnvironmentSignalStatus, number>;
  for (const signal of signals) {
    if (KNOWN_STATUSES.includes(signal.status)) tally[signal.status] += 1;
  }
  return tally;
}

function integrityStatement(
  total: number,
  failedCheckIds: IntegrityCheckId[]
): string {
  if (failedCheckIds.length === 0) {
    return `Brief passes all ${total} provenance-integrity checks (complete citations, bounded language, consistent status accounting); it is internally consistent and on-message for export. This is not a data-fitness judgement.`;
  }
  const noun = failedCheckIds.length === 1 ? "check" : "checks";
  return `Brief fails ${failedCheckIds.length} of ${total} provenance-integrity ${noun}: ${failedCheckIds.join(", ")}. It should not be exported as provenance-complete output until resolved.`;
}
