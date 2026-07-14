import type {
  EnvironmentSignalBrief,
  EnvironmentSignalId,
} from "./environmentBrief";

/**
 * Provenance-first cross-signal *unit commensurability* descriptor.
 *
 * The environment brief composes vegetation, rainfall, soil-moisture, and
 * air-temperature as independent monthly observations and, by design, never
 * combines them into a single score. Companion descriptors already encode the
 * other reasons the signals must stay separate: shared provenance
 * (`sourceIndependence.ts`), differing data months (`summarizeTemporalAlignment`),
 * and differing spatial coverage (`coverageAdequacy.ts`). This module encodes
 * the remaining, *dimensional* reason: the signals are reported in incommensurable
 * native units — NDVI (unitless), precipitation rate (kg/m²/s), soil moisture
 * (kg/m²), and air temperature (K) — so no two are dimensionally comparable and
 * none can be reduced to a common index.
 *
 * It groups the considered signals by their native unit and reports which units
 * are present and whether any two signals even share a unit. It only reports the
 * dimensional structure of the units already carried by each signal; it never
 * converts, rescales, combines, or ranks the values, and makes no condition,
 * risk, causation, or forecast claim. Provenance (each signal's source DOI) is
 * carried by the signals themselves and the attribution/independence descriptors;
 * this is a dimensional descriptor, not a source descriptor.
 */

/** Distinct native unit backing one or more signals. */
export interface UnitGroup {
  /** The native unit shared by the grouped signals (verbatim, trimmed). */
  unit: string;
  /** Signals reported in this unit, in signal order. */
  signalIds: EnvironmentSignalId[];
  /** Human labels for those signals, in signal order. */
  signalLabels: string[];
}

export interface UnitCommensurabilitySummary {
  kind: "unit-commensurability";
  /** Signals assessed (usable observations by default), in signal order. */
  consideredSignalIds: EnvironmentSignalId[];
  /** Distinct native units backing the considered signals, first-seen order. */
  groups: UnitGroup[];
  /** Number of distinct native units (`groups.length`). */
  distinctUnits: number;
  /**
   * Groups whose unit backs more than one signal. Same-unit signals are the
   * only ones that are dimensionally comparable at all — even so, the brief
   * still reports them separately rather than combining them.
   */
  comparableGroups: UnitGroup[];
  /**
   * True when there are at least two considered signals and every one is in a
   * distinct native unit, so no two are dimensionally comparable. False for a
   * single signal (comparability is not a meaningful concept) or when some
   * signals share a unit.
   */
  allIncommensurable: boolean;
  /** Honest one-line commensurability statement (no condition inference). */
  statement: string;
  limits: string[];
}

export interface UnitCommensurabilityOptions {
  /**
   * Which signals to assess. "available" (default) considers only signals
   * carrying a usable observation, because comparability matters for the values
   * a reader might actually try to combine; "all" describes the brief's whole
   * unit basis regardless of per-signal status.
   */
  include?: "available" | "all";
}

const COMMENSURABILITY_LIMITS = [
  "Native units are dimensional labels, not a data-quality or fitness judgement.",
  "Signals in different units are not dimensionally comparable and are never combined into a single index.",
  "Even signals sharing a unit are reported separately, not merged, by this brief.",
];

/**
 * Group the brief's signals by their native unit and report whether any two
 * signals share a unit. Signals in different units are dimensionally
 * incommensurable — they cannot be directly compared or reduced to a common
 * score — and this descriptor makes that explicit rather than leaving it to a
 * method-limit comment.
 */
export function summarizeUnitCommensurability(
  signals: readonly EnvironmentSignalBrief[],
  options?: UnitCommensurabilityOptions
): UnitCommensurabilitySummary {
  const include = options?.include ?? "available";
  const considered = signals.filter((signal) =>
    include === "all" ? true : signal.status === "available"
  );

  const groupsByUnit = new Map<string, UnitGroup>();
  for (const signal of considered) {
    const unit = signal.nativeUnit.trim();
    const existing = groupsByUnit.get(unit);
    if (existing) {
      existing.signalIds.push(signal.id);
      existing.signalLabels.push(signal.label);
    } else {
      groupsByUnit.set(unit, {
        unit,
        signalIds: [signal.id],
        signalLabels: [signal.label],
      });
    }
  }

  const groups = [...groupsByUnit.values()];
  const comparableGroups = groups.filter((group) => group.signalIds.length > 1);
  const consideredSignalIds = considered.map((signal) => signal.id);

  return {
    kind: "unit-commensurability",
    consideredSignalIds,
    groups,
    distinctUnits: groups.length,
    comparableGroups,
    allIncommensurable: considered.length >= 2 && comparableGroups.length === 0,
    statement: commensurabilityStatement(
      consideredSignalIds.length,
      groups,
      comparableGroups
    ),
    limits: COMMENSURABILITY_LIMITS,
  };
}

function commensurabilityStatement(
  consideredCount: number,
  groups: readonly UnitGroup[],
  comparableGroups: readonly UnitGroup[]
): string {
  if (consideredCount === 0) {
    return "No usable observations to assess for unit commensurability.";
  }
  if (consideredCount === 1) {
    return `1 usable observation in ${groups[0].unit}; unit commensurability is not applicable to a single signal.`;
  }

  const obs = `${consideredCount} usable observations`;
  const unitList = groups.map((group) => group.unit).join(", ");
  const distinct = `${groups.length} distinct native unit${plural(
    groups.length
  )} (${unitList})`;

  if (comparableGroups.length === 0) {
    return `${obs} in ${distinct}; no two signals share a unit, so none are dimensionally comparable and they must not be combined into a single index.`;
  }

  const sharedClauses = comparableGroups
    .map((group) => `${group.signalIds.join(", ")} share ${group.unit}`)
    .join("; ");
  return `${obs} in ${distinct}; ${sharedClauses} — only same-unit signals are dimensionally comparable, and even those are reported separately, not combined.`;
}

function plural(count: number): string {
  return count === 1 ? "" : "s";
}
