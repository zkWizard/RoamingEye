import type {
  EnvironmentSignalBrief,
  EnvironmentSignalId,
} from "./environmentBrief";
import type { DatasetRef } from "./timeline";

/**
 * Provenance-first source-independence descriptor for a multi-signal brief.
 *
 * The environment brief's value proposition is combining independent open
 * datasets into multi-signal context — and a reader naturally treats several
 * agreeing signals as several independent lines of evidence. But two of the
 * brief's signals are the *same* source product: rainfall (precipitation rate)
 * and soil moisture are both GLDAS land-model fields sharing one DOI
 * (10.5067/SXAVCZFAQLNO). Reading "rainfall low AND soil moisture low" as two
 * independent confirmations is a real scientific error — they are one model's
 * coupled water-balance state, not two separate observing systems.
 *
 * This helper groups the usable observations by their source dataset so
 * co-sourced signals are never silently read as independent corroboration. It
 * counts the distinct source datasets among the usable signals and flags the
 * ones that share a source. It is purely a provenance descriptor over each
 * signal's `DatasetRef`: it never combines the signal values, weights them,
 * compares magnitudes, or infers any condition, agreement, change, trend,
 * causation, or forecast.
 *
 * `attributeBrief` (environmentBrief.ts) also deduplicates sources by DOI, but
 * for *crediting* — who to cite, deduplicated so a product is not listed twice.
 * This module answers a different question — which signals are NOT independent
 * evidence of each other — and is deliberately scoped to the usable signals a
 * reader would actually compare, where a no-data or unpublished signal
 * contributes no evidence to mistake for corroboration.
 *
 * Distinct source datasets are a *necessary* but not sufficient condition for
 * statistical independence: two different products can still assimilate the
 * same upstream satellite observations or share model physics and thus
 * correlate. This descriptor reports shared provenance only and says so in its
 * limits; it never asserts that distinct-source signals are truly independent.
 */

/** A group of usable signals drawing on exactly one source dataset. */
export interface SourceIndependenceGroup {
  /** The source dataset shared by every signal in the group. */
  source: DatasetRef;
  /** Signals backed by this source, in signal order. */
  signalIds: EnvironmentSignalId[];
  /** Human labels for those signals, in signal order. */
  signalLabels: string[];
}

export interface SourceIndependenceSummary {
  kind: "brief-source-independence";
  /** Usable signals (available, with a source) considered, in signal order. */
  consideredSignalIds: EnvironmentSignalId[];
  /** Source-dataset groups, in first-seen (signal) order. */
  groups: SourceIndependenceGroup[];
  /** Number of distinct source datasets among the usable signals. */
  distinctSourceCount: number;
  /**
   * Groups holding 2+ usable signals — the co-sourced signals that are NOT
   * independent lines of evidence. Empty when every usable signal is from a
   * distinct source.
   */
  sharedSourceGroups: SourceIndependenceGroup[];
  /**
   * Usable signals that share their source with at least one other usable
   * signal, flattened in signal order; the ids a reader must not treat as
   * independent confirmation of one another.
   */
  sharedSignalIds: EnvironmentSignalId[];
  /**
   * True only when there are 2+ usable signals and every one of them draws on a
   * distinct source dataset. False for a single usable signal, where
   * independence between signals is not a meaningful concept.
   */
  fullyIndependent: boolean;
  /** Honest one-line grouping statement; carries no value or condition claim. */
  statement: string;
  limits: string[];
}

const INDEPENDENCE_LIMITS = [
  "Independence here means the signals come from distinct source datasets, not a statistical guarantee.",
  "Signals sharing a source (e.g. rainfall and soil moisture from GLDAS) are not independent confirmation.",
  "Distinct-source signals can still correlate through shared upstream inputs or model physics.",
  "Grouping is over provenance only; it does not combine, weight, or compare the reported values.",
];

/**
 * Group a composed brief's usable signals by their source dataset. Only signals
 * carrying a usable observation (`available`) participate — no-data, invalid,
 * and unpublished signals contribute no evidence a reader could mistake for
 * independent corroboration. Signals in the same group share a source dataset
 * and must not be read as independent confirmation of one another.
 */
export function summarizeSourceIndependence(
  signals: readonly EnvironmentSignalBrief[]
): SourceIndependenceSummary {
  const usable = signals.filter((signal) => signal.status === "available");

  const groupsByKey = new Map<string, SourceIndependenceGroup>();
  const order: string[] = [];
  usable.forEach((signal, index) => {
    const key = sourceIdentity(signal.source, index);
    const existing = groupsByKey.get(key);
    if (existing) {
      existing.signalIds.push(signal.id);
      existing.signalLabels.push(signal.label);
    } else {
      groupsByKey.set(key, {
        source: signal.source,
        signalIds: [signal.id],
        signalLabels: [signal.label],
      });
      order.push(key);
    }
  });

  const groups = order.map((key) => groupsByKey.get(key)!);
  const consideredSignalIds = usable.map((signal) => signal.id);
  const sharedSourceGroups = groups.filter(
    (group) => group.signalIds.length >= 2
  );
  const sharedSignalIds = sharedSourceGroups.flatMap(
    (group) => group.signalIds
  );

  return {
    kind: "brief-source-independence",
    consideredSignalIds,
    groups,
    distinctSourceCount: groups.length,
    sharedSourceGroups,
    sharedSignalIds,
    fullyIndependent: usable.length >= 2 && sharedSourceGroups.length === 0,
    statement: independenceStatement(
      consideredSignalIds.length,
      groups,
      sharedSourceGroups
    ),
    limits: INDEPENDENCE_LIMITS,
  };
}

/**
 * A stable identity for one signal's source dataset. Prefers the DOI (the same
 * key `attributeBrief` deduplicates on, so shared-product signals like the two
 * GLDAS fields group together). Falls back to "shortName|version" when the DOI
 * is blank, and finally to a per-signal unique sentinel when no identifying
 * field survives — so two sources of genuinely unknown identity are never
 * wrongly merged and declared "shared".
 */
function sourceIdentity(source: DatasetRef, index: number): string {
  const doi = typeof source.doi === "string" ? source.doi.trim() : "";
  if (doi) return `doi:${doi}`;
  const shortName =
    typeof source.shortName === "string" ? source.shortName.trim() : "";
  const version =
    typeof source.version === "string" ? source.version.trim() : "";
  if (shortName || version) return `name:${shortName}|${version}`;
  return `unknown:${index}`;
}

function independenceStatement(
  consideredCount: number,
  groups: readonly SourceIndependenceGroup[],
  sharedSourceGroups: readonly SourceIndependenceGroup[]
): string {
  if (consideredCount === 0) {
    return "No usable observations to assess for source independence.";
  }
  const obs = `${consideredCount} usable observation${plural(consideredCount)}`;
  if (consideredCount === 1) {
    return `${obs}, from ${sourceLabel(groups[0].source)}; source independence is not applicable to a single signal.`;
  }
  const distinct = `${groups.length} distinct source dataset${plural(groups.length)}`;
  if (sharedSourceGroups.length === 0) {
    return `${obs} from ${distinct}; no two signals share a source dataset.`;
  }
  const sharedClauses = sharedSourceGroups
    .map((group) => sharedGroupClause(group))
    .join("; ");
  return `${obs} draw on ${distinct}: ${sharedClauses} — co-sourced signals are not independent confirmation and should not be read as corroborating evidence.`;
}

function sharedGroupClause(group: SourceIndependenceGroup): string {
  return `${group.signalIds.join(", ")} share ${sourceLabel(group.source)}`;
}

function sourceLabel(source: DatasetRef): string {
  return `${source.shortName} v${source.version}`;
}

function plural(count: number): string {
  return count === 1 ? "" : "s";
}
