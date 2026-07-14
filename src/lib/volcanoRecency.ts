import { GVP_VOLCANO_SOURCE, VOLCANO_CONTEXT_UNITS } from "./volcanoContext";
import { eruptionClass, type EruptionClass, type Volcano } from "./volcanoes";

/**
 * Descriptive eruption-recency tally across a supplied set of GVP volcano
 * records.
 *
 * This aggregates the per-marker {@link eruptionClass} buckets that the overlay
 * already uses to color volcanoes (recent / historic / holocene) into counts
 * for a place panel, an in-view extent summary, or an export — e.g. "of 12
 * volcanoes in view, 3 have erupted since 1900". It parallels the seismicity
 * summary in earthquakes.ts and keeps the same contract: only categorical
 * labels of the recorded eruption year are reported.
 *
 * It is not a hazard assessment, activity ranking, risk score, or forecast, and
 * it never averages the class labels. "Recent" reflects only the most recent
 * *known* eruption year in the source record, so a low recent count does not
 * establish that a set of volcanoes is dormant — see the limitations.
 */

/** Recency classes ordered most-recent first for deterministic iteration. */
export const ERUPTION_CLASS_ORDER: readonly EruptionClass[] = [
  "recent",
  "historic",
  "holocene",
] as const;

/** Inclusive year range; nulls make an empty set of dated eruptions explicit. */
export interface EruptionYearRange {
  min: number | null;
  max: number | null;
}

/**
 * A descriptive aggregation of supplied volcano records, not a hazard or
 * activity ranking. Null year bounds mean no supplied record carried a dated
 * eruption year.
 */
export interface EruptionRecencySummary {
  kind: "gvp-eruption-recency-summary";
  isForecast: false;
  /** Number of supplied records tallied (every supplied record is countable). */
  volcanoCount: number;
  recencyClassCounts: Record<EruptionClass, number>;
  /** Records carrying a finite eruption year (includes BCE / negative years). */
  datedEruptionCount: number;
  /** Records with no dated eruption year (Holocene evidence only). */
  undatedCount: number;
  /**
   * Range of dated eruption years across the supplied records. A negative bound
   * is BCE. Undated (Holocene-only) records do not contribute to this range.
   */
  lastEruptionYear: EruptionYearRange;
  provenance: typeof GVP_VOLCANO_SOURCE;
  units: typeof VOLCANO_CONTEXT_UNITS;
  limitations: readonly string[];
}

const LIMITATIONS = [
  "Counts only the supplied, locally bundled GVP-derived volcano records; it is not a complete volcano catalog.",
  "Classes reflect the most recent KNOWN eruption year only. 'Holocene' means no dated eruption is recorded since 1 CE (a BCE-dated eruption falls here too), not that the volcano is inactive; a small 'recent' count does not establish dormancy.",
  "Categorical recency counts are descriptive context only; they do not forecast eruptions, rank hazard or activity, score risk, or infer causes.",
] as const;

/**
 * Tally supplied volcano records by eruption-recency class while retaining GVP
 * provenance and native unit labels. Every supplied record is countable: a null
 * or non-finite eruption year is a valid "Holocene evidence only" observation,
 * not malformed input, so no record is silently dropped.
 */
export function summarizeEruptionRecency(
  volcanoes: readonly Volcano[]
): EruptionRecencySummary {
  const recencyClassCounts: Record<EruptionClass, number> = {
    recent: 0,
    historic: 0,
    holocene: 0,
  };
  const datedYears: number[] = [];

  for (const volcano of volcanoes) {
    const year = volcano.lastEruptionYear;
    recencyClassCounts[eruptionClass(year)] += 1;
    if (year !== null && Number.isFinite(year)) datedYears.push(year);
  }

  return {
    kind: "gvp-eruption-recency-summary",
    isForecast: false,
    volcanoCount: volcanoes.length,
    recencyClassCounts,
    datedEruptionCount: datedYears.length,
    undatedCount: volcanoes.length - datedYears.length,
    lastEruptionYear: rangeFor(datedYears),
    provenance: GVP_VOLCANO_SOURCE,
    units: VOLCANO_CONTEXT_UNITS,
    limitations: LIMITATIONS,
  };
}

function rangeFor(values: readonly number[]): EruptionYearRange {
  if (values.length === 0) return { min: null, max: null };
  return { min: Math.min(...values), max: Math.max(...values) };
}
