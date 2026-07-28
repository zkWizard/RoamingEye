import type {
  EnvironmentSignalBrief,
  EnvironmentSignalId,
  EnvironmentSignalStatus,
} from "./environmentBrief";
import type { YearMonth } from "./timeline";

/**
 * Provenance-first reproducibility fingerprint for a composed environment brief.
 *
 * The brief folds independent monthly products into one view. Two people (or the
 * same person on two days) can build "the same" brief and quietly be looking at
 * different inputs — a newer composite selected for one signal, a corrected
 * value, a source re-versioned after a DAAC migration. This module folds exactly
 * the *provenance-and-value* facts that define a brief's inputs — each signal's
 * cited source identity (short name, version, DOI), its data month, its status,
 * its observed value, and its coverage fraction — into a short, order-independent
 * hex fingerprint that a figure caption or observation export can carry. Quoting
 * that fingerprint lets a reader confirm they are looking at the exact same
 * composed inputs, or see at a glance that something diverged.
 *
 * What it deliberately is and is not:
 *   - It is a *non-cryptographic* content fingerprint (two FNV-1a-32 lanes,
 *     concatenated to 64 bits) for detecting accidental divergence between two
 *     briefs — not a tamper-evident or security hash. It resists mistakes, not
 *     adversaries.
 *   - Equal digests mean the folded fields matched; different digests mean the
 *     inputs genuinely differ. Collisions over this small fixed field set are
 *     astronomically unlikely but, as with any fingerprint, not impossible.
 *   - It folds *data*, never prose: statement text, labels, and layer ids are
 *     derived from the signal id and are not hashed, so wording changes do not
 *     move the digest while a changed value does.
 *   - It is a provenance descriptor. It is not a quality, condition, risk, or
 *     agreement score, and says nothing about the values beyond their identity.
 *
 * Every signal keeps its own source `DatasetRef`; this never replaces citation.
 */

/** Bumped only if the folded field set or canonical form changes. */
export const BRIEF_DIGEST_VERSION = "ev1" as const;

/** Names the fingerprint construction so a reader can reproduce it. */
export const BRIEF_DIGEST_ALGORITHM = "fnv1a-64" as const;

/** One signal's provenance-and-value contribution to the digest. */
export interface BriefDigestEntry {
  id: EnvironmentSignalId;
  status: EnvironmentSignalStatus;
  /** Folded data month, or null when the signal carries none. */
  dataMonth: YearMonth | null;
  /** Folded observed value; null for any non-available or non-finite value. */
  observedValue: number | null;
  /** Folded coverage share in [0, 1], or null when not supplied. */
  validFraction: number | null;
  /** The cited source identity that was folded (never dropped). */
  source: { shortName: string; version: string; doi: string };
  /** The exact canonical string this entry contributed, for transparency. */
  canonical: string;
}

export interface BriefDigest {
  version: typeof BRIEF_DIGEST_VERSION;
  algorithm: typeof BRIEF_DIGEST_ALGORITHM;
  /** Number of signals folded into the digest. */
  signalCount: number;
  /** Per-signal folded facts, sorted by signal id (order-independent). */
  entries: BriefDigestEntry[];
  /** The full canonical manifest string that was hashed. */
  manifest: string;
  /** Short fingerprint, e.g. "ev1-1a2b3c4d5e6f7a8b". */
  digest: string;
  /** Caption-ready one-liner; carries the honesty caveat. */
  statement: string;
}

/**
 * Fold a brief's signals into a reproducibility fingerprint. The result is
 * independent of the order the signals are passed (entries are sorted by id
 * before hashing) so two callers that compose the same signals in a different
 * order still agree. Passing `brief.signals` is the intended use.
 */
export function computeBriefDigest(
  signals: readonly EnvironmentSignalBrief[]
): BriefDigest {
  const entries = signals
    .map(digestEntry)
    // Order-independent: the *set* of folded facts defines the brief, not the
    // order they were composed in. Ids are unique per brief, so this is a total
    // order with no tie-breaking needed.
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  const manifest = [
    BRIEF_DIGEST_VERSION,
    String(entries.length),
    ...entries.map((entry) => entry.canonical),
  ].join("\n");

  const digest = `${BRIEF_DIGEST_VERSION}-${fingerprint64(manifest)}`;

  return {
    version: BRIEF_DIGEST_VERSION,
    algorithm: BRIEF_DIGEST_ALGORITHM,
    signalCount: entries.length,
    entries,
    manifest,
    digest,
    statement: digestStatement(digest, entries),
  };
}

function digestEntry(signal: EnvironmentSignalBrief): BriefDigestEntry {
  const dataMonth = normalizeMonth(signal.dataMonth);
  const observedValue = finiteOrNull(signal.observedValue);
  const validFraction = finiteOrNull(signal.coverage.validFraction);
  const source = {
    shortName: signal.source.shortName,
    version: signal.source.version,
    doi: signal.source.doi,
  };

  // JSON of a fixed-order tuple: unambiguous even when a DOI or short name
  // contains separator-like characters, and stable across runs (numbers and
  // null serialize deterministically; -0 folds to "0").
  const canonical = JSON.stringify([
    signal.id,
    signal.status,
    dataMonth ? formatMonth(dataMonth) : null,
    observedValue,
    validFraction,
    source.shortName,
    source.version,
    source.doi,
  ]);

  return {
    id: signal.id,
    status: signal.status,
    dataMonth,
    observedValue,
    validFraction,
    source,
    canonical,
  };
}

function digestStatement(
  digest: string,
  entries: readonly BriefDigestEntry[]
): string {
  if (entries.length === 0) {
    return `Environment brief digest ${digest} (${BRIEF_DIGEST_ALGORITHM}) over 0 signals; reproducibility fingerprint only, not a quality or condition score.`;
  }
  const ids = entries.map((entry) => entry.id).join(", ");
  const noun = entries.length === 1 ? "signal" : "signals";
  return `Environment brief digest ${digest} (${BRIEF_DIGEST_ALGORITHM}) over ${entries.length} ${noun}: ${ids}; fingerprint of source, data month, value, and coverage — not a quality or condition score.`;
}

function normalizeMonth(month: YearMonth | null): YearMonth | null {
  if (
    month === null ||
    !Number.isInteger(month.year) ||
    !Number.isInteger(month.month) ||
    month.month < 1 ||
    month.month > 12
  ) {
    return null;
  }
  return { year: month.year, month: month.month };
}

function formatMonth(month: YearMonth): string {
  return `${month.year}-${String(month.month).padStart(2, "0")}`;
}

function finiteOrNull(value: number | null): number | null {
  // Fold -0 and +0 to the same token, and never fold a non-finite value.
  return value !== null && Number.isFinite(value) ? value + 0 : null;
}

/**
 * A 64-bit content fingerprint as 16 lowercase hex chars, built from two
 * decorrelated FNV-1a-32 lanes (a second offset basis mixed with the golden
 * ratio). FNV-1a is a fast, dependency-free, deterministic non-cryptographic
 * hash; two lanes widen the space to keep accidental collisions negligible for
 * the small, fixed field set folded here.
 */
function fingerprint64(input: string): string {
  const laneA = fnv1a32(input, FNV_OFFSET_BASIS);
  const laneB = fnv1a32(input, FNV_OFFSET_BASIS ^ 0x9e3779b9);
  return hex8(laneA) + hex8(laneB);
}

const FNV_OFFSET_BASIS = 0x811c9dc5; // 2166136261
const FNV_PRIME = 0x01000193; // 16777619

function fnv1a32(input: string, seed: number): number {
  let hash = seed >>> 0;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, FNV_PRIME) >>> 0;
  }
  return hash >>> 0;
}

function hex8(value: number): string {
  return (value >>> 0).toString(16).padStart(8, "0");
}
