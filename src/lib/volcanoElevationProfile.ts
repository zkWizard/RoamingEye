import { GVP_VOLCANO_SOURCE, VOLCANO_CONTEXT_UNITS } from "./volcanoContext";
import {
  elevationRegime,
  type ElevationRegime,
  type Volcano,
} from "./volcanoes";

/**
 * Descriptive summit-elevation distribution for a supplied set of GVP volcano
 * records.
 *
 * summarizeVolcanoTypes and summarizeEruptionRecency tally the categorical
 * morphology and eruption-recency labels; volcanoes.ts already classifies a
 * single record's datum-relative {@link elevationRegime}
 * (subaerial / sea-level / submarine / unknown). This module adds the interior
 * shape of the *elevation* field itself — the quartiles and median of the
 * reported summit heights — so a place panel, an in-view extent summary, or an
 * export can distinguish, say, a cluster of high subaerial stratovolcanoes from
 * a field of submarine seamounts whose datum-relative extremes alone would look
 * similar.
 *
 * Summit elevation is a linear physical quantity in metres relative to the sea-
 * level datum (negative below it), so order statistics (median, quartiles,
 * interquartile range) are well defined and robust to outliers. This is a
 * descriptive summary of the elevations GVP reports; it never averages the
 * categorical morphology or recency labels, and it is not an edifice-relief,
 * prominence, hazard, or eruption-style inference — GVP records a summit
 * elevation, not the height of the edifice above its surrounding terrain.
 *
 * Pure, render-free logic (see volcanoElevationProfile.test.ts).
 */

export interface ElevationQuantiles {
  /** Lowest reported summit elevation in the supplied set (m relative to sea level). */
  min: number;
  /** First quartile (25th percentile) of reported summit elevation. */
  q1: number;
  /** Median (50th percentile) of reported summit elevation. */
  median: number;
  /** Third quartile (75th percentile) of reported summit elevation. */
  q3: number;
  /** Highest reported summit elevation in the supplied set. */
  max: number;
  /** Interquartile range, q3 − q1 (m); zero when elevations do not vary. */
  iqr: number;
}

/** Elevation regimes ordered high-to-low datum position for deterministic iteration. */
export const ELEVATION_REGIME_ORDER: readonly ElevationRegime[] = [
  "subaerial",
  "sea-level",
  "submarine",
  "unknown",
] as const;

/**
 * A descriptive aggregation of supplied volcano records' reported summit
 * elevations, not a hazard, relief, or activity ranking. `quantiles` is null
 * when no supplied record carried a finite elevation, making an empty basis
 * explicit; the regime tally still counts every supplied record (a missing
 * elevation counts as "unknown"), so nothing is silently dropped.
 */
export interface VolcanoElevationProfile {
  kind: "gvp-volcano-elevation-profile";
  isForecast: false;
  /** Number of supplied records tallied (every supplied record is countable). */
  volcanoCount: number;
  /** Records carrying a finite summit elevation (the basis for `quantiles`). */
  elevationCount: number;
  quantiles: ElevationQuantiles | null;
  /** Every supplied record bucketed by datum-relative regime; sums to volcanoCount. */
  regimeCounts: Record<ElevationRegime, number>;
  provenance: typeof GVP_VOLCANO_SOURCE;
  units: typeof VOLCANO_CONTEXT_UNITS;
  limitations: readonly string[];
}

const LIMITATIONS = [
  "Describes only the reported summit elevations of the supplied, locally bundled GVP-derived records; it is not a complete volcano catalog.",
  "GVP reports summit elevation relative to sea level (negative below it) — the height of the summit above that datum, NOT the edifice's relief or topographic prominence above its surrounding terrain or the sea floor.",
  "Quantiles are computed over the signed datum-relative elevations, so a set mixing subaerial and submarine summits yields quantiles that cross the 0 m datum; this is one distribution of summit heights, not two separate populations.",
  "Quantiles use linear interpolation between the two nearest order statistics (the R-7 / NumPy-default convention); interior quantiles from a small sample are uncertain.",
  "Descriptive summary only: it does not average the categorical morphology or recency labels, rank hazard or activity, score risk, or forecast eruptions.",
] as const;

/**
 * The p-th quantile (0 ≤ p ≤ 1) of a pre-sorted ascending array by linear
 * interpolation between the closest ranks — the R-7 / NumPy-default method. The
 * caller guarantees a non-empty array.
 */
function quantileSorted(sorted: readonly number[], p: number): number {
  const lastIndex = sorted.length - 1;
  if (lastIndex === 0) return sorted[0];
  const rank = lastIndex * p;
  const lower = Math.floor(rank);
  const upper = Math.ceil(rank);
  if (lower === upper) return sorted[lower];
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (rank - lower);
}

/** A zeroed tally with one entry per regime, so absent regimes read as 0. */
function emptyRegimeCounts(): Record<ElevationRegime, number> {
  return { subaerial: 0, "sea-level": 0, submarine: 0, unknown: 0 };
}

/**
 * Bucket reported summit elevations by datum-relative regime. Every supplied
 * value is counted — a missing or non-finite elevation lands in "unknown" —
 * so the tally always sums to the number of values supplied.
 *
 * Exposed separately from {@link volcanoElevationProfile} because a caller that
 * holds elevations without whole {@link Volcano} records (the place panel holds
 * GVP extent records, which name the field `elevationMeters`) still needs the
 * same classification, and duplicating it would let the two drift apart.
 */
export function tallyElevationRegimes(
  elevations: readonly (number | null)[]
): Record<ElevationRegime, number> {
  const regimeCounts = emptyRegimeCounts();
  for (const elevation of elevations) {
    regimeCounts[elevationRegime(elevation)] += 1;
  }
  return regimeCounts;
}

/** Join clauses as "a", "a and b", or "a, b, and c" — locale-independent. */
function joinClauses(parts: readonly string[]): string {
  if (parts.length <= 1) return parts[0] ?? "";
  if (parts.length === 2) return `${parts[0]} and ${parts[1]}`;
  return `${parts.slice(0, -1).join(", ")}, and ${parts[parts.length - 1]}`;
}

/**
 * One sentence describing where a set's reported summits sit relative to the
 * sea-level datum. GVP reports summit elevation as a signed height against that
 * datum, so a negative value is a summit *below* sea level, not a data error —
 * a distinction a bare "−1410 m" in a record list does not make.
 *
 * Returns null when nothing would be added: when no supplied record reported a
 * finite elevation, or when every reported summit is subaerial and the plain
 * metres-above-sea-level reading is already unambiguous.
 *
 * The datum is named by whichever clause comes first, so the sentence never
 * refers back to a surface it has not introduced.
 *
 * This reads the sign GVP reports. It is not a claim about eruption style,
 * edifice relief, or whether an edifice currently breaches the sea surface.
 */
export function summitDatumText(
  regimeCounts: Record<ElevationRegime, number>
): string | null {
  const { subaerial, submarine } = regimeCounts;
  const atDatum = regimeCounts["sea-level"];
  const reported = subaerial + atDatum + submarine;
  if (reported === 0 || submarine + atDatum === 0) return null;

  const parts: string[] = [];
  if (subaerial > 0) parts.push(`${subaerial} above sea level`);
  if (atDatum > 0) parts.push(`${atDatum} at the 0 m datum`);
  if (submarine > 0) {
    // "below it" leans on a datum an earlier clause names — "above sea level",
    // or "at the 0 m datum", which is the same surface. An arc, ridge, or
    // seamount extent can match submarine summits and nothing else, and there
    // both clauses are absent, leaving the pronoun pointing at nothing. Name
    // the datum outright when this clause leads.
    const datum = parts.length === 0 ? "below sea level" : "below it";
    parts.push(
      `${submarine} ${datum} (submarine ${submarine === 1 ? "summit" : "summits"})`
    );
  }
  return `Of the ${reported} reported summit ${
    reported === 1 ? "elevation" : "elevations"
  }, ${joinClauses(parts)}.`;
}

/**
 * Summarize the reported summit-elevation distribution of the supplied volcano
 * records, retaining GVP provenance and native unit labels. Records without a
 * finite elevation are excluded from the quantiles but still counted in
 * volcanoCount and in the "unknown" regime bucket, so the basis of the summary
 * stays auditable.
 */
export function volcanoElevationProfile(
  volcanoes: readonly Volcano[]
): VolcanoElevationProfile {
  const regimeCounts = tallyElevationRegimes(
    volcanoes.map((volcano) => volcano.elevation)
  );
  const elevations: number[] = [];

  for (const volcano of volcanoes) {
    const elevation = volcano.elevation;
    if (elevation !== null && Number.isFinite(elevation)) {
      elevations.push(elevation);
    }
  }

  elevations.sort((first, second) => first - second);

  let quantiles: ElevationQuantiles | null = null;
  if (elevations.length > 0) {
    const q1 = quantileSorted(elevations, 0.25);
    const q3 = quantileSorted(elevations, 0.75);
    quantiles = {
      min: elevations[0],
      q1,
      median: quantileSorted(elevations, 0.5),
      q3,
      max: elevations[elevations.length - 1],
      iqr: q3 - q1,
    };
  }

  return {
    kind: "gvp-volcano-elevation-profile",
    isForecast: false,
    volcanoCount: volcanoes.length,
    elevationCount: elevations.length,
    quantiles,
    regimeCounts,
    provenance: GVP_VOLCANO_SOURCE,
    units: VOLCANO_CONTEXT_UNITS,
    limitations: LIMITATIONS,
  };
}
