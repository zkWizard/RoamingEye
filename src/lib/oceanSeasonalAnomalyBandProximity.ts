import { formatYm, type DatasetRef, type YearMonth } from "./timeline";
import {
  OCEAN_ANOMALY_MAGNITUDE_BAND_THRESHOLDS,
  type OceanAnomalyMagnitudeBand,
  type OceanSeasonalAnomalyContext,
} from "./oceanSeasonalAnomalyContext";
import type { UsableSstFootprint } from "./oceanSeasonalBaseline";

/**
 * Describe how close a standardized sea-surface-temperature anomaly sits to the
 * edges of its magnitude band.
 *
 * `contextualizeOceanSeasonalAnomaly` sorts a continuous standardized anomaly
 * (|z|, in baseline sample-standard-deviation multiples) into three coarse
 * bands with hard cutoffs at |z| = 1 and |z| = 2. A reading of |z| = 1.02 is
 * labelled `beyond-typical-spread` while |z| = 0.98 is `within-typical-spread`,
 * yet the two are practically identical — and the divisor is a *sample* SD from
 * a short run of same-calendar-month years, so it carries its own uncertainty.
 * Reporting the distance (in |z|) to the nearest band edge keeps a single band
 * label from being over-read as a sharp category.
 *
 * This describes only the already-computed standardized anomaly and its
 * arithmetic distance to the fixed |z| thresholds. It derives no new central
 * tendency, probability, significance test, trend, or forecast, and never infers
 * marine-biological abundance, habitat, ecosystem condition, hazard, or
 * causation. The thresholds are imported from
 * `OCEAN_ANOMALY_MAGNITUDE_BAND_THRESHOLDS`, the same source of truth
 * `magnitudeBandOf` uses, so the band edges here can never drift from the band
 * assignment they describe. Provenance from the underlying context is retained.
 */

/**
 * One magnitude band and the |z| thresholds separating it from its neighbours.
 * A `null` boundary marks the open side of the innermost/outermost band, where
 * there is no neighbouring band to be close to (|z| = 0 is the baseline mean,
 * not a band edge, and |z| has no finite ceiling).
 */
export interface OceanAnomalyBandDefinition {
  band: OceanAnomalyMagnitudeBand;
  /** |z| at/above which this band starts; null for the innermost band. */
  lowerThreshold: number | null;
  /** |z| below which this band ends; null for the outermost band. */
  upperThreshold: number | null;
  /** Less-extreme neighbour across the lower threshold; null for innermost. */
  lessExtremeNeighbor: OceanAnomalyMagnitudeBand | null;
  /** More-extreme neighbour across the upper threshold; null for outermost. */
  moreExtremeNeighbor: OceanAnomalyMagnitudeBand | null;
}

/**
 * Ordered innermost→outermost. Each half-open interval [lowerThreshold,
 * upperThreshold) in |z| matches `magnitudeBandOf`: |z| < 1 within-typical,
 * < 2 beyond-typical, otherwise well-beyond-typical. The thresholds are pulled
 * from the shared constant so the two never disagree.
 */
export const OCEAN_ANOMALY_MAGNITUDE_BANDS: readonly OceanAnomalyBandDefinition[] =
  [
    {
      band: "within-typical-spread",
      lowerThreshold: null,
      upperThreshold:
        OCEAN_ANOMALY_MAGNITUDE_BAND_THRESHOLDS.beyondTypicalSpread,
      lessExtremeNeighbor: null,
      moreExtremeNeighbor: "beyond-typical-spread",
    },
    {
      band: "beyond-typical-spread",
      lowerThreshold:
        OCEAN_ANOMALY_MAGNITUDE_BAND_THRESHOLDS.beyondTypicalSpread,
      upperThreshold:
        OCEAN_ANOMALY_MAGNITUDE_BAND_THRESHOLDS.wellBeyondTypicalSpread,
      lessExtremeNeighbor: "within-typical-spread",
      moreExtremeNeighbor: "well-beyond-typical-spread",
    },
    {
      band: "well-beyond-typical-spread",
      lowerThreshold:
        OCEAN_ANOMALY_MAGNITUDE_BAND_THRESHOLDS.wellBeyondTypicalSpread,
      upperThreshold: null,
      lessExtremeNeighbor: "beyond-typical-spread",
      moreExtremeNeighbor: null,
    },
  ] as const;

/**
 * Default display margin (in |z|). A standardized anomaly whose |z| is within
 * this distance of its nearest band edge is flagged `near-boundary`. A quarter
 * of a baseline SD is a presentation convenience, not a scientific or
 * biological threshold; callers may override it.
 */
export const DEFAULT_ANOMALY_NEAR_BOUNDARY_MARGIN = 0.25;

export interface OceanSeasonalAnomalyBandProximityOptions {
  /** |z| within which a reading counts as `near-boundary`; default 0.25. */
  nearBoundaryMargin?: number;
}

/** The nearest band edge to a reading, and the neighbour across it. */
export interface NearestAnomalyBandBoundary {
  /** |z| threshold between the current band and the neighbour. */
  thresholdMagnitude: number;
  /** Absolute distance in |z| from the reading to that threshold. */
  distance: number;
  /** Whether the neighbour across the threshold is more or less extreme. */
  direction: "more-extreme" | "less-extreme";
  neighborBand: OceanAnomalyMagnitudeBand;
}

export interface OceanSeasonalAnomalyBandProximitySummary {
  kind: "standardized-sst-anomaly-band-proximity";
  /** Explicitly prevents consumers from treating this as a forecast. */
  isForecast: false;
  claimScope: "descriptive-sea-surface-temperature-only";
  /** Cited source of the underlying SST observations; never dropped. */
  source: DatasetRef;
  /** Month of the target observation, echoed for audit. */
  dataMonth: YearMonth;
  /** Footprint the baseline was built on; never mixed across footprints. */
  footprint: UsableSstFootprint | null;
  /** `usable` only when the context carried a labelled standardized anomaly. */
  status: "usable" | "not-usable";
  /** Machine-readable reason carried through when not usable. */
  reason: string | null;
  band: OceanAnomalyMagnitudeBand | null;
  /** The signed standardized anomaly, echoed for audit; null when not usable. */
  standardizedAnomaly: number | null;
  /** |z| = |standardizedAnomaly|, the value the band is keyed on. */
  standardizedMagnitude: number | null;
  /**
   * Distance in |z| to the threshold with the more-extreme neighbouring band,
   * or null in the outermost band or when not usable.
   */
  distanceToMoreExtremeBoundary: number | null;
  /**
   * Distance in |z| to the threshold with the less-extreme neighbouring band,
   * or null in the innermost band or when not usable.
   */
  distanceToLessExtremeBoundary: number | null;
  /** The closer of the two edges; null when the band has no neighbour. */
  nearestBoundary: NearestAnomalyBandBoundary | null;
  /** Documented display margin used to set `position`; not a scientific claim. */
  nearBoundaryMargin: number;
  /** Where the reading sits relative to its band edges; null when not usable. */
  position: "interior" | "near-boundary" | null;
  limitations: typeof OCEAN_ANOMALY_BAND_PROXIMITY_LIMITATIONS;
}

export const OCEAN_ANOMALY_BAND_PROXIMITY_LIMITATIONS = [
  "Magnitude bands discretize a continuous |z|; a reading near an edge is close to the neighbouring band and can flip with a tiny data change.",
  "Distances describe only the supplied standardized anomaly against fixed |z| thresholds; no new mean, probability, significance test, trend, or forecast is derived.",
  "The divisor is a sample standard deviation from a short same-calendar-month record and carries its own uncertainty, so the band edges are not sharp.",
  "`near-boundary` uses a display margin, not a physical, statistical, or biological threshold.",
  "Sea surface temperature is a physical observation and never a marine-biological measurement.",
] as const;

/**
 * Reduce dimensionless distances to 0.001 |z| so reported values do not carry
 * floating-point subtraction noise (e.g. 2 − 1.98). The comparison for
 * `position` uses the unrounded distance so the flag never disagrees with the
 * rounded number.
 */
function roundZ(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function bandDefinitionFor(
  band: OceanAnomalyMagnitudeBand
): OceanAnomalyBandDefinition {
  const definition = OCEAN_ANOMALY_MAGNITUDE_BANDS.find(
    (entry) => entry.band === band
  );
  if (!definition) {
    // The band union and the table are kept in step; this guards against drift.
    throw new Error(`RoamingEye: no anomaly band definition for "${band}"`);
  }
  return definition;
}

/**
 * Describe how close a labelled standardized-anomaly context sits to its
 * magnitude-band edges. Contexts that did not yield a labelled anomaly (a flat,
 * single-year, or otherwise unavailable baseline) are passed through honestly
 * with no distance, mirroring `contextualizeOceanSeasonalAnomaly`.
 */
export function summarizeOceanSeasonalAnomalyBandProximity(
  context: OceanSeasonalAnomalyContext,
  options: OceanSeasonalAnomalyBandProximityOptions = {}
): OceanSeasonalAnomalyBandProximitySummary {
  const nearBoundaryMargin = normalizeMargin(options.nearBoundaryMargin);
  const base = {
    kind: "standardized-sst-anomaly-band-proximity",
    isForecast: false,
    claimScope: "descriptive-sea-surface-temperature-only",
    source: context.source,
    dataMonth: context.dataMonth,
    footprint: context.footprint,
    nearBoundaryMargin,
    limitations: OCEAN_ANOMALY_BAND_PROXIMITY_LIMITATIONS,
  } as const;

  if (
    context.status !== "available" ||
    context.magnitudeBand === null ||
    context.standardizedAnomaly === null
  ) {
    return {
      ...base,
      status: "not-usable",
      reason: context.reason ?? "standardized-anomaly-unavailable",
      band: null,
      standardizedAnomaly: null,
      standardizedMagnitude: null,
      distanceToMoreExtremeBoundary: null,
      distanceToLessExtremeBoundary: null,
      nearestBoundary: null,
      position: null,
    };
  }

  const standardizedAnomaly = context.standardizedAnomaly;
  const magnitude = Math.abs(standardizedAnomaly);
  const definition = bandDefinitionFor(context.magnitudeBand);

  const rawMoreExtreme =
    definition.upperThreshold === null
      ? null
      : definition.upperThreshold - magnitude;
  const rawLessExtreme =
    definition.lowerThreshold === null
      ? null
      : magnitude - definition.lowerThreshold;

  const nearest = nearestBoundaryFor(
    definition,
    rawMoreExtreme,
    rawLessExtreme
  );
  const position =
    nearest === null
      ? "interior"
      : nearest.rawDistance <= nearBoundaryMargin
        ? "near-boundary"
        : "interior";

  return {
    ...base,
    status: "usable",
    reason: null,
    band: context.magnitudeBand,
    standardizedAnomaly,
    standardizedMagnitude: roundZ(magnitude),
    distanceToMoreExtremeBoundary:
      rawMoreExtreme === null ? null : roundZ(rawMoreExtreme),
    distanceToLessExtremeBoundary:
      rawLessExtreme === null ? null : roundZ(rawLessExtreme),
    nearestBoundary:
      nearest === null
        ? null
        : {
            thresholdMagnitude: nearest.thresholdMagnitude,
            distance: roundZ(nearest.rawDistance),
            direction: nearest.direction,
            neighborBand: nearest.neighborBand,
          },
    position,
  };
}

interface NearestBoundaryInternal extends NearestAnomalyBandBoundary {
  /** Unrounded distance retained so `position` never disagrees with the report. */
  rawDistance: number;
}

/**
 * Pick the closer of the more-extreme/less-extreme edges. Ties (a reading
 * exactly midway between two thresholds, only possible in the middle band)
 * resolve toward the more-extreme edge so the result is deterministic and never
 * understates how close a reading is to the outer band.
 */
function nearestBoundaryFor(
  definition: OceanAnomalyBandDefinition,
  rawMoreExtreme: number | null,
  rawLessExtreme: number | null
): NearestBoundaryInternal | null {
  const moreExtreme =
    rawMoreExtreme === null || definition.moreExtremeNeighbor === null
      ? null
      : {
          thresholdMagnitude: definition.upperThreshold as number,
          rawDistance: rawMoreExtreme,
          direction: "more-extreme" as const,
          neighborBand: definition.moreExtremeNeighbor,
          distance: rawMoreExtreme,
        };
  const lessExtreme =
    rawLessExtreme === null || definition.lessExtremeNeighbor === null
      ? null
      : {
          thresholdMagnitude: definition.lowerThreshold as number,
          rawDistance: rawLessExtreme,
          direction: "less-extreme" as const,
          neighborBand: definition.lessExtremeNeighbor,
          distance: rawLessExtreme,
        };

  if (moreExtreme === null) return lessExtreme;
  if (lessExtreme === null) return moreExtreme;
  return lessExtreme.rawDistance < moreExtreme.rawDistance
    ? lessExtreme
    : moreExtreme;
}

function normalizeMargin(margin: number | undefined): number {
  if (margin === undefined) return DEFAULT_ANOMALY_NEAR_BOUNDARY_MARGIN;
  if (!Number.isFinite(margin) || margin < 0)
    return DEFAULT_ANOMALY_NEAR_BOUNDARY_MARGIN;
  return margin;
}

const BAND_PHRASES: Record<OceanAnomalyMagnitudeBand, string> = {
  "within-typical-spread": "within the typical year-to-year spread",
  "beyond-typical-spread": "beyond the typical year-to-year spread",
  "well-beyond-typical-spread": "well beyond the typical year-to-year spread",
};

/**
 * Build a provenance-tagged, screen-reader-ready sentence describing where a
 * standardized SST anomaly sits within its magnitude band. It states the band,
 * the distance (in |z|) to the nearest edge, and whether the reading is close
 * enough to that edge to be treated as marginal. It never infers marine
 * biology, ecosystem condition, hazard, causation, probability, or any forecast,
 * and states not-usable cases honestly instead of inventing a distance.
 */
export function describeOceanSeasonalAnomalyBandProximity(
  summary: OceanSeasonalAnomalyBandProximitySummary
): string {
  const source = summary.source;
  const provenance = `Source: ${source.shortName} v${source.version}. This is a descriptive distance to fixed band edges, not a probability, significance test, marine-biology, ecosystem, hazard, or forecast claim.`;

  const month = isYearMonth(summary.dataMonth)
    ? formatYm(summary.dataMonth)
    : "an invalid month";
  const lead = `Standardized SST anomaly band proximity for ${month}:`;

  if (summary.status !== "usable") {
    return `${lead} no band proximity is reported (${summary.reason ?? "unavailable"}). ${provenance}`;
  }

  const bandPhrase = BAND_PHRASES[summary.band as OceanAnomalyMagnitudeBand];
  const z = roundZ(summary.standardizedMagnitude as number);

  if (summary.nearestBoundary === null) {
    // Innermost or outermost band with no reachable neighbour on the open side.
    return `${lead} |z| = ${z}, ${bandPhrase}; the band has no neighbouring edge on its open side. ${provenance}`;
  }

  const edge = summary.nearestBoundary;
  const edgePhrase =
    edge.direction === "more-extreme"
      ? "the more-extreme edge"
      : "the less-extreme edge";
  const marginNote =
    summary.position === "near-boundary"
      ? `only ${edge.distance} from ${edgePhrase} (|z| = ${edge.thresholdMagnitude}), so the band label is marginal and could flip with a small change in the data`
      : `${edge.distance} from ${edgePhrase} (|z| = ${edge.thresholdMagnitude}), comfortably inside the band`;

  return `${lead} |z| = ${z}, ${bandPhrase}, ${marginNote}. ${provenance}`;
}

function isYearMonth(value: YearMonth): boolean {
  return (
    Number.isInteger(value.year) &&
    Number.isInteger(value.month) &&
    value.month >= 1 &&
    value.month <= 12
  );
}
