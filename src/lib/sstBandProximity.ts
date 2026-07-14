import {
  SEA_SURFACE_TEMPERATURE_METRIC,
  type OceanConditionSummary,
  type OceanCoverageReason,
  type SeaSurfaceTemperatureBand,
} from "./oceanConditions";
import type { YearMonth } from "./timeline";

/**
 * Describe how close a supplied MODIS/Aqua sea-surface-temperature value sits to
 * the edges of its descriptive temperature band.
 *
 * The `SeaSurfaceTemperatureBand` labels (near-freezing / cool / temperate /
 * warm / very-warm) discretize a continuous physical value, so a reading near a
 * band edge is qualitatively close to its neighbouring band. Reporting that edge
 * distance keeps a single band label from being over-read as a sharp category.
 *
 * This describes only the supplied SST value and its distance, in the source
 * unit (°C), to the fixed band thresholds. It derives no central tendency,
 * trend, anomaly, or forecast, and never infers marine-biological abundance,
 * habitat, ecosystem condition, hazard, comfort, or causation. The band
 * thresholds mirror `oceanConditions`' canonical `temperatureBandForSst`; the
 * `sstBandProximity.test.ts` drift guard asserts they stay in step.
 */

/**
 * One descriptive band and the thresholds that separate it from its neighbours.
 * A `null` boundary marks the open side of the coldest/warmest band, where there
 * is no neighbouring band to be close to (the source's physical value floor and
 * ceiling are a validity range, not a band boundary).
 */
export interface SeaSurfaceTemperatureBandDefinition {
  band: SeaSurfaceTemperatureBand;
  /** Threshold (°C) at/above which this band starts; null for the coldest band. */
  lowerThreshold: number | null;
  /** Threshold (°C) below which this band ends; null for the warmest band. */
  upperThreshold: number | null;
  /** Cooler neighbour across the lower threshold; null for the coldest band. */
  coolerNeighbor: SeaSurfaceTemperatureBand | null;
  /** Warmer neighbour across the upper threshold; null for the warmest band. */
  warmerNeighbor: SeaSurfaceTemperatureBand | null;
}

/**
 * Ordered coldest→warmest. Each half-open interval [lowerThreshold,
 * upperThreshold) matches `temperatureBandForSst`: value < 2 near-freezing,
 * < 10 cool, < 20 temperate, < 28 warm, otherwise very-warm.
 */
export const SEA_SURFACE_TEMPERATURE_BANDS: readonly SeaSurfaceTemperatureBandDefinition[] =
  [
    {
      band: "near-freezing",
      lowerThreshold: null,
      upperThreshold: 2,
      coolerNeighbor: null,
      warmerNeighbor: "cool",
    },
    {
      band: "cool",
      lowerThreshold: 2,
      upperThreshold: 10,
      coolerNeighbor: "near-freezing",
      warmerNeighbor: "temperate",
    },
    {
      band: "temperate",
      lowerThreshold: 10,
      upperThreshold: 20,
      coolerNeighbor: "cool",
      warmerNeighbor: "warm",
    },
    {
      band: "warm",
      lowerThreshold: 20,
      upperThreshold: 28,
      coolerNeighbor: "temperate",
      warmerNeighbor: "very-warm",
    },
    {
      band: "very-warm",
      lowerThreshold: 28,
      upperThreshold: null,
      coolerNeighbor: "warm",
      warmerNeighbor: null,
    },
  ] as const;

/**
 * Default display margin (°C). A usable value within this distance of its
 * nearest band threshold is flagged `near-boundary`. This is a presentation
 * convenience, not a scientific claim; callers may override it.
 */
export const DEFAULT_NEAR_BOUNDARY_MARGIN = 1;

export interface SstBandProximityOptions {
  /** °C within which a value counts as `near-boundary`; default 1 °C. */
  nearBoundaryMargin?: number;
}

/** The nearest band threshold to a usable value, and the neighbour across it. */
export interface NearestBandBoundary {
  /** Threshold value (°C) between the observed band and the neighbour. */
  thresholdValue: number;
  /** Absolute distance (°C) from the observed value to that threshold. */
  distance: number;
  /** Whether the neighbour across the threshold is warmer or cooler. */
  direction: "warmer" | "cooler";
  neighborBand: SeaSurfaceTemperatureBand;
}

export interface SstBandProximitySummary {
  kind: "sea-surface-temperature-band-proximity";
  /** Explicitly prevents consumers from treating this as a forecast. */
  isForecast: false;
  claimScope: "descriptive-band-proximity-only";
  metric: typeof SEA_SURFACE_TEMPERATURE_METRIC;
  dataMonth: YearMonth;
  /** `usable` only when the underlying month carried a usable SST value. */
  status: "usable" | "not-usable";
  /** Coverage reason carried through when the month is not usable. */
  reason: OceanCoverageReason;
  band: SeaSurfaceTemperatureBand | null;
  /** Retained in `metric.sourceUnit`, or null when not usable. */
  observedValue: number | null;
  /**
   * Distance (°C) to the threshold with the warmer neighbouring band, or null
   * when the value is in the warmest band or the month is not usable.
   */
  distanceToWarmerBoundary: number | null;
  /**
   * Distance (°C) to the threshold with the cooler neighbouring band, or null
   * when the value is in the coldest band or the month is not usable.
   */
  distanceToCoolerBoundary: number | null;
  /** The closer of the two boundaries; null when the band has no neighbour. */
  nearestBoundary: NearestBandBoundary | null;
  /** Documented display margin used to set `position`; not a scientific claim. */
  nearBoundaryMargin: number;
  /** Where the value sits relative to its band edges; null when not usable. */
  position: "interior" | "near-boundary" | null;
  limitations: typeof SST_BAND_PROXIMITY_LIMITATIONS;
}

export const SST_BAND_PROXIMITY_LIMITATIONS = [
  "Temperature bands are a discretization of a continuous value; a reading near an edge is close to the neighbouring band.",
  "Distances describe only the supplied value against fixed thresholds; no mean, trend, anomaly, or forecast is derived.",
  "`near-boundary` uses a display margin, not a physical or biological threshold.",
  "Sea surface temperature is a physical observation and never a marine-biological measurement.",
] as const;

/**
 * Reduce distances to 0.001 °C so reported values do not carry floating-point
 * subtraction noise (e.g. 20 − 19.9). The comparison for `position` uses the
 * unrounded distance so the flag never disagrees with the rounded number.
 */
function roundCelsius(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function bandDefinitionFor(
  band: SeaSurfaceTemperatureBand
): SeaSurfaceTemperatureBandDefinition {
  const definition = SEA_SURFACE_TEMPERATURE_BANDS.find(
    (entry) => entry.band === band
  );
  if (!definition) {
    // The band union and the table are kept in step; this guards against drift.
    throw new Error(`RoamingEye: no band definition for "${band}"`);
  }
  return definition;
}

/**
 * Describe how close a summarized SST condition sits to its band edges. Not-usable
 * months (land, missing, or invalid) are passed through honestly with no value
 * or distance, mirroring `summarizeOceanConditions`.
 */
export function summarizeSstBandProximity(
  condition: OceanConditionSummary,
  options: SstBandProximityOptions = {}
): SstBandProximitySummary {
  const nearBoundaryMargin = normalizeMargin(options.nearBoundaryMargin);
  const base = {
    kind: "sea-surface-temperature-band-proximity",
    isForecast: false,
    claimScope: "descriptive-band-proximity-only",
    metric: SEA_SURFACE_TEMPERATURE_METRIC,
    dataMonth: condition.dataMonth,
    nearBoundaryMargin,
    limitations: SST_BAND_PROXIMITY_LIMITATIONS,
  } as const;

  if (condition.observedValue === null || condition.temperatureBand === null) {
    return {
      ...base,
      status: "not-usable",
      reason: condition.coverage.reason,
      band: null,
      observedValue: null,
      distanceToWarmerBoundary: null,
      distanceToCoolerBoundary: null,
      nearestBoundary: null,
      position: null,
    };
  }

  const value = condition.observedValue;
  const definition = bandDefinitionFor(condition.temperatureBand);

  const rawWarmer =
    definition.upperThreshold === null
      ? null
      : definition.upperThreshold - value;
  const rawCooler =
    definition.lowerThreshold === null
      ? null
      : value - definition.lowerThreshold;

  const nearest = nearestBoundaryFor(definition, rawWarmer, rawCooler);
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
    band: condition.temperatureBand,
    observedValue: value,
    distanceToWarmerBoundary:
      rawWarmer === null ? null : roundCelsius(rawWarmer),
    distanceToCoolerBoundary:
      rawCooler === null ? null : roundCelsius(rawCooler),
    nearestBoundary:
      nearest === null
        ? null
        : {
            thresholdValue: nearest.thresholdValue,
            distance: roundCelsius(nearest.rawDistance),
            direction: nearest.direction,
            neighborBand: nearest.neighborBand,
          },
    position,
  };
}

interface NearestBoundaryInternal extends NearestBandBoundary {
  /** Unrounded distance retained so `position` never disagrees with the report. */
  rawDistance: number;
}

/**
 * Pick the closer of the warmer/cooler boundaries. Ties (a value exactly
 * midway between two thresholds) resolve toward the warmer boundary so the
 * result is deterministic.
 */
function nearestBoundaryFor(
  definition: SeaSurfaceTemperatureBandDefinition,
  rawWarmer: number | null,
  rawCooler: number | null
): NearestBoundaryInternal | null {
  const warmer =
    rawWarmer === null || definition.warmerNeighbor === null
      ? null
      : {
          thresholdValue: definition.upperThreshold as number,
          rawDistance: rawWarmer,
          direction: "warmer" as const,
          neighborBand: definition.warmerNeighbor,
          distance: rawWarmer,
        };
  const cooler =
    rawCooler === null || definition.coolerNeighbor === null
      ? null
      : {
          thresholdValue: definition.lowerThreshold as number,
          rawDistance: rawCooler,
          direction: "cooler" as const,
          neighborBand: definition.coolerNeighbor,
          distance: rawCooler,
        };

  if (warmer === null) return cooler;
  if (cooler === null) return warmer;
  return cooler.rawDistance < warmer.rawDistance ? cooler : warmer;
}

function normalizeMargin(margin: number | undefined): number {
  if (margin === undefined) return DEFAULT_NEAR_BOUNDARY_MARGIN;
  if (!Number.isFinite(margin) || margin < 0)
    return DEFAULT_NEAR_BOUNDARY_MARGIN;
  return margin;
}
