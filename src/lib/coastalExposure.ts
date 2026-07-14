import {
  MARINE_SURFACE_CONTEXT_SOURCE,
  type MarineSurfaceContextSummary,
} from "./marineSurfaceContext";
import { formatYm, type YearMonth } from "./timeline";

/**
 * Grade the surface-water share of a probed footprint from the existing IGBP
 * surface context. `marineSurfaceContext` reports only whether IGBP Water
 * (class 17) is present alongside other classes; it never says whether a
 * "mixed" footprint is 5% water or 95% water. This descriptor closes that gap
 * by classifying the water share of the classified surface samples into a
 * graded coastal-exposure band.
 *
 * This is a SURFACE-COMPOSITION gradient over the supplied IGBP samples, not a
 * distance-to-shore or coastline-proximity measurement, and not a marine-
 * biology, habitat, ecosystem-condition, causal, risk, or forecast claim. It
 * reuses the same MCD12Q1 provenance and never invents a value for footprints
 * with too few classified surface samples to grade honestly.
 */

/**
 * A footprint needs at least this many classified IGBP surface samples before a
 * water share is graded. Below this the share is too sparse to name a band
 * without over-reading a handful of pixels.
 */
export const MINIMUM_COASTAL_EXPOSURE_CLASSIFIED_SAMPLES = 8;

/**
 * Descriptive water-share cut points. These name categories over the observed
 * IGBP water fraction; they are readability breakpoints, not authoritative
 * oceanographic thresholds and not a coastline definition.
 */
export const COASTAL_EXPOSURE_THRESHOLDS = {
  /** At or above this water share, treat the footprint as open water. */
  openWater: 0.95,
  /** At or above this share (and below openWater), water predominates. */
  predominantlyWater: 0.65,
  /** At or above this share (and below predominantlyWater), a coastal mix. */
  coastalMixed: 0.35,
} as const;

export type CoastalExposureClass =
  | "open-water"
  | "predominantly-water"
  | "coastal-mixed"
  | "predominantly-land"
  | "land-only";

export type CoastalExposureStatus =
  "graded" | "insufficient-classified-surface" | "no-classified-surface";

export interface CoastalExposureSummary {
  kind: "observed-coastal-surface-exposure";
  /** A surface-composition gradient, never a distance-to-shore measurement. */
  isCoastlineDistance: false;
  /** Surface composition, not a marine-biology or habitat observation. */
  marineBiologyObservation: false;
  isForecast: false;
  claimScope: "descriptive-surface-water-share-only";
  source: typeof MARINE_SURFACE_CONTEXT_SOURCE;
  /** Preserved from the SST observation the surface context accompanied. */
  sstDataMonth: YearMonth;
  /** Year of the annual MCD12Q1 surface context, retained unchanged. */
  contextDataYear: number;
  status: CoastalExposureStatus;
  /** Named exposure band, or null when the share cannot be graded honestly. */
  exposureClass: CoastalExposureClass | null;
  /**
   * IGBP Water (class 17) share among CLASSIFIED surface samples (0..1), or
   * null when there are no classified surface samples. No-data and unclassified
   * samples are excluded from the denominator, not counted as land.
   */
  waterSurfaceFraction: number | null;
  classifiedSurfaceSampleCount: number;
  igbpWaterSampleCount: number;
  otherIgbpClassSampleCount: number;
}

export const COASTAL_EXPOSURE_LIMITATIONS = [
  "The water share is a fraction of classified IGBP surface samples, not a coastline, distance to shore, or shoreline length.",
  "No-data and unclassified samples are excluded from the denominator; they are never counted as land or water.",
  "Bands describe surface composition only and never imply habitat, marine biology, ecosystem condition, causation, risk, or a forecast.",
  "The annual MCD12Q1 surface context may precede or follow the accompanying SST month; the two are kept distinct and never merged.",
] as const;

/**
 * Classify the surface-water share of a footprint from its IGBP surface
 * context. The water and other-class tallies are read verbatim from the
 * supplied summary; nothing is re-sampled, interpolated, or inferred.
 */
export function summarizeCoastalExposure(
  context: MarineSurfaceContextSummary
): CoastalExposureSummary {
  const { coverage } = context;
  const water = coverage.igbpWaterSampleCount;
  const other = coverage.otherIgbpClassSampleCount;
  const classified = coverage.classifiedSurfaceSampleCount;

  const base = {
    kind: "observed-coastal-surface-exposure",
    isCoastlineDistance: false,
    marineBiologyObservation: false,
    isForecast: false,
    claimScope: "descriptive-surface-water-share-only",
    source: context.source,
    sstDataMonth: context.sstDataMonth,
    contextDataYear: context.contextDataYear,
    classifiedSurfaceSampleCount: classified,
    igbpWaterSampleCount: water,
    otherIgbpClassSampleCount: other,
  } as const;

  if (!areUsableCounts(water, other, classified) || classified <= 0) {
    return {
      ...base,
      status: "no-classified-surface",
      exposureClass: null,
      waterSurfaceFraction: null,
    };
  }

  const waterSurfaceFraction = water / classified;

  if (classified < MINIMUM_COASTAL_EXPOSURE_CLASSIFIED_SAMPLES) {
    return {
      ...base,
      status: "insufficient-classified-surface",
      exposureClass: null,
      waterSurfaceFraction,
    };
  }

  return {
    ...base,
    status: "graded",
    exposureClass: exposureClassFor(waterSurfaceFraction),
    waterSurfaceFraction,
  };
}

/**
 * Counts must be a consistent set of non-negative integers whose water and
 * other-class parts sum to the classified total. Anything else is treated as
 * missing surface context rather than silently graded.
 */
function areUsableCounts(
  water: number,
  other: number,
  classified: number
): boolean {
  return (
    Number.isInteger(water) &&
    Number.isInteger(other) &&
    Number.isInteger(classified) &&
    water >= 0 &&
    other >= 0 &&
    classified >= 0 &&
    water + other === classified
  );
}

function exposureClassFor(waterSurfaceFraction: number): CoastalExposureClass {
  if (waterSurfaceFraction === 0) return "land-only";
  if (waterSurfaceFraction >= COASTAL_EXPOSURE_THRESHOLDS.openWater) {
    return "open-water";
  }
  if (waterSurfaceFraction >= COASTAL_EXPOSURE_THRESHOLDS.predominantlyWater) {
    return "predominantly-water";
  }
  if (waterSurfaceFraction >= COASTAL_EXPOSURE_THRESHOLDS.coastalMixed) {
    return "coastal-mixed";
  }
  return "predominantly-land";
}

/**
 * Plain-language phrase for each exposure band. These name the surface-water
 * share only; none of them is a coastline, habitat, or biological claim.
 */
const EXPOSURE_CLASS_PHRASES: Record<CoastalExposureClass, string> = {
  "open-water": "open water",
  "predominantly-water": "predominantly water",
  "coastal-mixed": "a coastal mix of water and other surface classes",
  "predominantly-land": "predominantly other surface classes",
  "land-only": "no IGBP water among the classified surface samples",
};

/**
 * Build a provenance-tagged, screen-reader-ready sentence for a coastal-
 * exposure summary. It reports only the water share of the classified surface
 * samples and its band; it never implies a coastline, distance to shore,
 * habitat, marine biology, causation, risk, or forecast. Insufficient and
 * missing surface context are stated honestly instead of guessing a band.
 */
export function describeCoastalExposure(
  summary: CoastalExposureSummary
): string {
  const source = summary.source.source;
  const provenance = `Source: ${source.shortName} v${source.version}. This is an IGBP surface-composition gradient, not a coastline, distance to shore, marine-biology, ecosystem, or forecast claim.`;

  const month = isYearMonth(summary.sstDataMonth)
    ? formatYm(summary.sstDataMonth)
    : "an invalid month";
  const lead = `Coastal surface exposure for the SST footprint of ${month}:`;

  let body: string;
  if (summary.status === "no-classified-surface") {
    body =
      "no classified IGBP surface samples were supplied, so no water share is reported.";
  } else if (summary.status === "insufficient-classified-surface") {
    const count = summary.classifiedSurfaceSampleCount;
    body = `only ${count} classified surface ${count === 1 ? "sample was" : "samples were"} supplied (below the ${MINIMUM_COASTAL_EXPOSURE_CLASSIFIED_SAMPLES}-sample floor), so the water share is not graded.`;
  } else {
    const phrase = summary.exposureClass
      ? EXPOSURE_CLASS_PHRASES[summary.exposureClass]
      : "an unclassified band";
    const share = Math.round((summary.waterSurfaceFraction ?? 0) * 100);
    body = `${share}% of the ${summary.classifiedSurfaceSampleCount} classified surface samples are IGBP water, ${phrase}.`;
  }

  return `${lead} ${body} ${provenance}`;
}

function isYearMonth(value: YearMonth): boolean {
  return (
    Number.isInteger(value.year) &&
    Number.isInteger(value.month) &&
    value.month >= 1 &&
    value.month <= 12
  );
}
