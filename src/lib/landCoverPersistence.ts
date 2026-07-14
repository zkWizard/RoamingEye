import {
  IGBP_LAND_COVER_CLASSES,
  LAND_COVER_SOURCE,
  type IgbpLandCoverClass,
  type IgbpLandCoverClassCode,
} from "./landCover";
import { type DatasetRef } from "./timeline";

/**
 * Multi-year land-cover persistence for one probed location.
 *
 * Given a location's MODIS MCD12Q1 IGBP class as read from several *annual*
 * land-cover maps, these helpers report how categorically stable that class
 * was across the observed years. Class identifiers are labels, not
 * measurements: the summary counts whole years per class and reports the modal
 * (most frequent) class only. It never averages class codes, and it does not
 * infer land-use change, degradation, succession, disturbance, causes, or any
 * forecast — a class that changed between two maps may reflect a real
 * transition, a revised classification, or map error alike.
 *
 * Callers must supply years drawn from a single consistently-versioned product
 * (e.g. all MCD12Q1 v061). Mixing collection versions can relabel a class
 * without any change on the ground, so cross-version series are not comparable.
 */

/** Two known-class years is the floor for describing persistence or stability. */
export const MINIMUM_YEARS_FOR_PERSISTENCE = 2;

/** Existing NASA MCD12Q1 v061 provenance, retained in every summary. */
export const LAND_COVER_PERSISTENCE_SOURCE: DatasetRef = LAND_COVER_SOURCE;

export interface LandCoverYearObservation {
  /** Calendar year of the annual MCD12Q1 map this class was read from. */
  year: number;
  /** MCD12Q1 IGBP class code; null means the map had no usable code here. */
  classCode: number | null;
}

export type LandCoverPersistenceStatus = "available" | "no-data";

export interface LandCoverPersistenceCoverage {
  status: LandCoverPersistenceStatus;
  /** Inclusive span of retained (valid, non-duplicate) years, or null. */
  yearSpan: { firstYear: number; lastYear: number } | null;
  /** Retained years with any usable outcome (known class, unclassified). */
  observedYearCount: number;
  /** Retained years carrying an IGBP land-cover class 1..17. */
  knownLandCoverYearCount: number;
  /** Retained years coded source-unclassified (255). */
  unclassifiedYearCount: number;
  /** Retained years where the map supplied no usable code (null). */
  noDataYearCount: number;
  /** Records rejected: non-integer year, duplicate year, or off-scheme code. */
  invalidRecordCount: number;
  /** Whether known-class years fall below the persistence threshold. */
  isSparse: boolean;
  reason: "no-years" | "no-known-land-cover" | null;
}

export interface LandCoverClassTenure {
  classCode: IgbpLandCoverClassCode;
  label: string;
  /** Distinct years this class was the location's IGBP class. */
  yearCount: number;
  /** Share of known-land-cover years held by this class (0..1). */
  fractionOfKnownYears: number;
  /** The specific years, ascending — not a run-length or contiguity claim. */
  years: number[];
}

export interface LandCoverPersistence {
  modalClassCode: IgbpLandCoverClassCode;
  label: string;
  /** Years the modal class held; ties broken by lowest class code. */
  modalYearCount: number;
  modalFractionOfKnownYears: number;
  /** True when every known-land-cover year shared a single IGBP class. */
  isSingleClass: boolean;
}

export interface LandCoverPersistenceSummary {
  kind: "observed-land-cover-persistence";
  /** Explicitly prevents consumers from treating this as a temporal forecast. */
  isForecast: false;
  classScheme: "IGBP";
  source: DatasetRef;
  coverage: LandCoverPersistenceCoverage;
  /** Distinct IGBP land-cover classes observed across the known-class years. */
  distinctKnownClassCount: number;
  /** Per-class tenure, most years first, then lowest class code. */
  classTenure: LandCoverClassTenure[];
  /** Modal class and stability, or null when sparse / no known class. */
  persistence: LandCoverPersistence | null;
}

const IGBP_BY_CODE = new Map<IgbpLandCoverClassCode, IgbpLandCoverClass>(
  IGBP_LAND_COVER_CLASSES.map((entry) => [entry.code, entry])
);

/**
 * Summarize a location's land-cover class across several annual MCD12Q1 maps.
 * Duplicate years are rejected rather than merged, so a repeated year cannot
 * silently shift the modal class. Source-unclassified (255) and no-data years
 * are counted as coverage but never contribute to any land-cover class tenure.
 */
export function summarizeLandCoverPersistence(
  observations: readonly LandCoverYearObservation[]
): LandCoverPersistenceSummary {
  const classYears = new Map<IgbpLandCoverClassCode, number[]>();
  const seenYears = new Set<number>();
  let observedYearCount = 0;
  let knownLandCoverYearCount = 0;
  let unclassifiedYearCount = 0;
  let noDataYearCount = 0;
  let invalidRecordCount = 0;
  let firstYear: number | null = null;
  let lastYear: number | null = null;

  for (const observation of observations) {
    const year = observation.year;
    if (!Number.isInteger(year) || seenYears.has(year)) {
      invalidRecordCount += 1;
      continue;
    }

    const classCode = observation.classCode;
    if (
      classCode !== null &&
      (!Number.isInteger(classCode) ||
        !IGBP_BY_CODE.has(classCode as IgbpLandCoverClassCode))
    ) {
      invalidRecordCount += 1;
      continue;
    }

    seenYears.add(year);
    firstYear = firstYear === null ? year : Math.min(firstYear, year);
    lastYear = lastYear === null ? year : Math.max(lastYear, year);

    if (classCode === null) {
      noDataYearCount += 1;
      continue;
    }

    observedYearCount += 1;
    const igbpCode = classCode as IgbpLandCoverClassCode;
    if (IGBP_BY_CODE.get(igbpCode)!.isInformativeLandCover) {
      knownLandCoverYearCount += 1;
      const years = classYears.get(igbpCode) ?? [];
      years.push(year);
      classYears.set(igbpCode, years);
    } else {
      unclassifiedYearCount += 1;
    }
  }

  const classTenure: LandCoverClassTenure[] = [...classYears.entries()]
    .map(([classCode, years]) => ({
      classCode,
      label: IGBP_BY_CODE.get(classCode)!.label,
      yearCount: years.length,
      fractionOfKnownYears:
        knownLandCoverYearCount === 0
          ? 0
          : years.length / knownLandCoverYearCount,
      years: [...years].sort((a, b) => a - b),
    }))
    .sort((a, b) => b.yearCount - a.yearCount || a.classCode - b.classCode);

  const isSparse = knownLandCoverYearCount < MINIMUM_YEARS_FOR_PERSISTENCE;
  const persistence: LandCoverPersistence | null =
    classTenure.length === 0 || isSparse
      ? null
      : {
          modalClassCode: classTenure[0].classCode,
          label: classTenure[0].label,
          modalYearCount: classTenure[0].yearCount,
          modalFractionOfKnownYears: classTenure[0].fractionOfKnownYears,
          isSingleClass: classTenure.length === 1,
        };

  const coverage: LandCoverPersistenceCoverage = {
    status: knownLandCoverYearCount > 0 ? "available" : "no-data",
    yearSpan:
      firstYear === null || lastYear === null ? null : { firstYear, lastYear },
    observedYearCount,
    knownLandCoverYearCount,
    unclassifiedYearCount,
    noDataYearCount,
    invalidRecordCount,
    isSparse,
    reason:
      seenYears.size === 0
        ? "no-years"
        : knownLandCoverYearCount === 0
          ? "no-known-land-cover"
          : null,
  };

  return {
    kind: "observed-land-cover-persistence",
    isForecast: false,
    classScheme: "IGBP",
    source: LAND_COVER_PERSISTENCE_SOURCE,
    coverage,
    distinctKnownClassCount: classTenure.length,
    classTenure,
    persistence,
  };
}
