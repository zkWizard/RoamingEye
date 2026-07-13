import { LAND_COVER_SOURCE, type LandCoverContextSummary } from "./landCover";
import type { DatasetRef, YearMonth } from "./timeline";

/**
 * Source-aware surface context for an SST boundary. This translates only the
 * existing MCD12Q1 IGBP class-17 Water samples and the other classified IGBP
 * samples. It does not turn an SST observation into a marine-biology
 * observation, and does not infer a coastline, habitat, abundance, ecosystem
 * condition, causal relationship, risk, or forecast.
 */

export const MARINE_SURFACE_CONTEXT_SOURCE = {
  layerId: "landcover",
  label: "IGBP land-cover surface context",
  waterClassCode: 17,
  waterClassLabel: "Water",
  source: LAND_COVER_SOURCE,
} as const satisfies {
  layerId: "landcover";
  label: string;
  waterClassCode: 17;
  waterClassLabel: string;
  source: DatasetRef;
};

export type MarineSurfaceContextStatus =
  | "igbp-water-only"
  | "other-igbp-classes-only"
  | "mixed-igbp-water-and-other-classes"
  | "unknown";

export type SurfaceContextTiming =
  | "same-calendar-year"
  | "different-calendar-year"
  | "invalid-sst-month"
  | "invalid-context-year";

export interface MarineSurfaceContextInput {
  /** Month of the separately supplied SST observation this context accompanies. */
  sstDataMonth: YearMonth;
  /** Existing annual MCD12Q1 summary for the same sampled boundary. */
  landCover: LandCoverContextSummary;
}

export interface MarineSurfaceContextSummary {
  kind: "observed-igbp-surface-context";
  /** This is surface context, not a sea-surface-temperature measurement. */
  seaSurfaceTemperatureObservation: false;
  /** This is surface context, not a marine-biology measurement. */
  marineBiologyObservation: false;
  isForecast: false;
  source: typeof MARINE_SURFACE_CONTEXT_SOURCE;
  /** Preserved SST month; no value is estimated or interpolated for it. */
  sstDataMonth: YearMonth;
  contextDataYear: number;
  timing: SurfaceContextTiming;
  sourcePublicationStatus: LandCoverContextSummary["provenance"]["publicationStatus"];
  coverage: {
    status: MarineSurfaceContextStatus;
    totalSampleCount: number;
    classifiedSurfaceSampleCount: number;
    igbpWaterSampleCount: number;
    otherIgbpClassSampleCount: number;
    unclassifiedSampleCount: number;
    noDataSampleCount: number;
    invalidClassSampleCount: number;
    invalidRecordCount: number;
    /** Share of all sampled records carrying IGBP class 1..17. */
    classifiedSurfaceFraction: number | null;
    reason: "no-classified-surface-samples" | null;
  };
}

/**
 * Keep annual IGBP surface context distinct from a monthly SST observation.
 * IGBP class 17 is reported verbatim as the source's Water class. Classes
 * 1..16 stay grouped as other classified IGBP classes rather than being
 * relabelled as habitat, a coastline, or a biological condition.
 */
export function summarizeMarineSurfaceContext(
  input: MarineSurfaceContextInput
): MarineSurfaceContextSummary {
  const water =
    input.landCover.classCoverage.find(
      (entry) =>
        entry.classCode === MARINE_SURFACE_CONTEXT_SOURCE.waterClassCode
    )?.sampleCount ?? 0;
  const classifiedSurfaceSampleCount =
    input.landCover.coverage.knownLandCoverSampleCount;
  const otherIgbpClassSampleCount = classifiedSurfaceSampleCount - water;

  return {
    kind: "observed-igbp-surface-context",
    seaSurfaceTemperatureObservation: false,
    marineBiologyObservation: false,
    isForecast: false,
    source: MARINE_SURFACE_CONTEXT_SOURCE,
    sstDataMonth: input.sstDataMonth,
    contextDataYear: input.landCover.provenance.dataYear,
    timing: timingFor(input.sstDataMonth, input.landCover.provenance.dataYear),
    sourcePublicationStatus: input.landCover.provenance.publicationStatus,
    coverage: {
      status: statusFor(water, otherIgbpClassSampleCount),
      totalSampleCount: input.landCover.coverage.totalSampleCount,
      classifiedSurfaceSampleCount,
      igbpWaterSampleCount: water,
      otherIgbpClassSampleCount,
      unclassifiedSampleCount: input.landCover.coverage.unclassifiedSampleCount,
      noDataSampleCount: input.landCover.coverage.noDataSampleCount,
      invalidClassSampleCount: input.landCover.coverage.invalidClassSampleCount,
      invalidRecordCount: input.landCover.coverage.invalidRecordCount,
      classifiedSurfaceFraction:
        input.landCover.coverage.totalSampleCount === 0
          ? null
          : classifiedSurfaceSampleCount /
            input.landCover.coverage.totalSampleCount,
      reason:
        classifiedSurfaceSampleCount === 0
          ? "no-classified-surface-samples"
          : null,
    },
  };
}

function statusFor(
  waterSampleCount: number,
  otherIgbpClassSampleCount: number
): MarineSurfaceContextStatus {
  if (waterSampleCount > 0 && otherIgbpClassSampleCount > 0) {
    return "mixed-igbp-water-and-other-classes";
  }
  if (waterSampleCount > 0) return "igbp-water-only";
  if (otherIgbpClassSampleCount > 0) return "other-igbp-classes-only";
  return "unknown";
}

function timingFor(
  sstDataMonth: YearMonth,
  contextDataYear: number
): SurfaceContextTiming {
  if (!isYearMonth(sstDataMonth)) return "invalid-sst-month";
  if (!Number.isInteger(contextDataYear)) return "invalid-context-year";
  return sstDataMonth.year === contextDataYear
    ? "same-calendar-year"
    : "different-calendar-year";
}

function isYearMonth(value: YearMonth): boolean {
  return (
    Number.isInteger(value.year) &&
    Number.isInteger(value.month) &&
    value.month >= 1 &&
    value.month <= 12
  );
}
