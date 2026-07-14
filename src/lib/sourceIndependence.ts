import type {
  EnvironmentSignalBrief,
  EnvironmentSignalId,
} from "./environmentBrief";
import type { DatasetRef } from "./timeline";

/**
 * Provenance-first source-independence check for a multi-signal environment
 * brief.
 *
 * The brief composes vegetation, rainfall, soil-moisture, and air-temperature
 * as "independent monthly source observations". That framing invites a reader
 * to treat two agreeing signals as two confirmations. But independence is a
 * property of the *products*, not of the signals: in this app rainfall and
 * soil moisture are both outputs of the same GLDAS Noah land-surface model
 * (GLDAS_NOAH025_M, one DOI), so they are not independent evidence — they
 * share forcing and model physics. This helper makes that explicit by grouping
 * the signals by their cited source product (DOI) and reporting which signals
 * share a source.
 *
 * It only reports provenance structure. It never combines the signal values,
 * weights them, or infers any condition, risk, causation, or forecast — the
 * shared method limits of the brief still hold.
 */

/** Distinct source product backing one or more signals. */
export interface SourceGroup {
  /** Canonical product identity used for grouping (the dataset DOI). */
  key: string;
  /** Human-facing product label (`shortName vVersion`). */
  product: string;
  /** Full dataset reference, retained so provenance is never dropped. */
  source: DatasetRef;
  /** Signals backed by this product, in signal order. */
  signalIds: EnvironmentSignalId[];
}

export interface SourceIndependenceSummary {
  kind: "source-independence";
  /** Signals assessed (usable observations by default), in signal order. */
  consideredSignalIds: EnvironmentSignalId[];
  /** Distinct source products backing the considered signals, first-seen order. */
  groups: SourceGroup[];
  /** Number of distinct source products (`groups.length`). */
  distinctSources: number;
  /** Groups backing more than one signal — shared, so not independent. */
  sharedGroups: SourceGroup[];
  /**
   * True when there are at least two considered signals and each comes from a
   * distinct product. False for a single signal, where independence between
   * signals is not a meaningful concept.
   */
  allIndependent: boolean;
  /** Honest one-line provenance-independence statement (no condition inference). */
  statement: string;
}

export interface SourceIndependenceOptions {
  /**
   * Which signals to assess. "available" (default) considers only signals
   * carrying a usable observation, because independence matters for the
   * evidence a reader would actually combine; "all" describes the brief's
   * whole source basis regardless of per-signal status.
   */
  include?: "available" | "all";
}

/**
 * Group the brief's signals by cited source product and report which signals
 * share a source. Two signals in the same group are outputs of the same
 * product and must not be read as independent confirmations of each other.
 */
export function summarizeSourceIndependence(
  signals: readonly EnvironmentSignalBrief[],
  options?: SourceIndependenceOptions
): SourceIndependenceSummary {
  const include = options?.include ?? "available";
  const considered = signals.filter((signal) =>
    include === "all" ? true : signal.status === "available"
  );

  const groupsByKey = new Map<string, SourceGroup>();
  for (const signal of considered) {
    const key = sourceKey(signal.source);
    const existing = groupsByKey.get(key);
    if (existing) {
      existing.signalIds.push(signal.id);
    } else {
      groupsByKey.set(key, {
        key,
        product: productLabel(signal.source),
        source: signal.source,
        signalIds: [signal.id],
      });
    }
  }

  const groups = [...groupsByKey.values()];
  const sharedGroups = groups.filter((group) => group.signalIds.length > 1);
  const consideredSignalIds = considered.map((signal) => signal.id);

  return {
    kind: "source-independence",
    consideredSignalIds,
    groups,
    distinctSources: groups.length,
    sharedGroups,
    allIndependent: considered.length >= 2 && sharedGroups.length === 0,
    statement: independenceStatement(
      consideredSignalIds.length,
      groups,
      sharedGroups
    ),
  };
}

/**
 * Canonical product identity for grouping. The DOI uniquely names a published
 * product; fall back to `shortName@version` only when a DOI is absent, so a
 * source is never silently treated as distinct from itself.
 */
function sourceKey(source: DatasetRef): string {
  const doi = source.doi?.trim().toLowerCase();
  return doi && doi.length > 0
    ? `doi:${doi}`
    : `name:${source.shortName}@${source.version}`;
}

function productLabel(source: DatasetRef): string {
  return `${source.shortName} v${source.version}`;
}

function independenceStatement(
  consideredCount: number,
  groups: readonly SourceGroup[],
  sharedGroups: readonly SourceGroup[]
): string {
  if (consideredCount === 0) {
    return "No usable observations to assess for source independence.";
  }
  if (consideredCount === 1) {
    return `1 usable observation from ${groups[0].product}; source independence is not applicable to a single signal.`;
  }

  const obs = `${consideredCount} usable observations`;
  const distinct = `${groups.length} distinct source product${plural(
    groups.length
  )}`;

  if (sharedGroups.length === 0) {
    return `${obs} drawn from ${distinct}; each signal is independent provenance.`;
  }

  const sharedClauses = sharedGroups
    .map((group) => `${group.signalIds.join(", ")} share ${group.product}`)
    .join("; ");
  return `${obs} drawn from ${distinct}; ${sharedClauses} — signals sharing a source are not independent evidence.`;
}

function plural(count: number): string {
  return count === 1 ? "" : "s";
}
