import { LAYERS, type DatasetRef } from "./timeline";

/**
 * Boundary-level context for class-coded MODIS MCD12Q1 land-cover samples.
 *
 * Class identifiers are categorical labels, not measurements. These helpers
 * count source class codes and coverage outcomes only; they do not average
 * class identifiers or infer biodiversity, biomass, habitat quality,
 * productivity, ecological health, causes, or forecasts.
 */

const layer = LAYERS.landcover;
if (!layer.dataset) {
  throw new Error(
    "RoamingEye: the land-cover layer must retain a cited dataset"
  );
}

/** Existing NASA MCD12Q1 v061 provenance, retained in every summary. */
export const LAND_COVER_SOURCE: DatasetRef = layer.dataset;

export type IgbpLandCoverClassCode =
  | 1
  | 2
  | 3
  | 4
  | 5
  | 6
  | 7
  | 8
  | 9
  | 10
  | 11
  | 12
  | 13
  | 14
  | 15
  | 16
  | 17
  | 255;

export interface IgbpLandCoverClass {
  code: IgbpLandCoverClassCode;
  label: string;
  /** False for source unclassified pixels: observed, but not a land-cover type. */
  isInformativeLandCover: boolean;
}

/** MODIS MCD12Q1 LC_Type1 IGBP class codes. */
export const IGBP_LAND_COVER_CLASSES: readonly IgbpLandCoverClass[] = [
  {
    code: 1,
    label: "Evergreen needleleaf forest",
    isInformativeLandCover: true,
  },
  {
    code: 2,
    label: "Evergreen broadleaf forest",
    isInformativeLandCover: true,
  },
  {
    code: 3,
    label: "Deciduous needleleaf forest",
    isInformativeLandCover: true,
  },
  {
    code: 4,
    label: "Deciduous broadleaf forest",
    isInformativeLandCover: true,
  },
  { code: 5, label: "Mixed forest", isInformativeLandCover: true },
  { code: 6, label: "Closed shrubland", isInformativeLandCover: true },
  { code: 7, label: "Open shrubland", isInformativeLandCover: true },
  { code: 8, label: "Woody savanna", isInformativeLandCover: true },
  { code: 9, label: "Savanna", isInformativeLandCover: true },
  { code: 10, label: "Grassland", isInformativeLandCover: true },
  { code: 11, label: "Permanent wetland", isInformativeLandCover: true },
  { code: 12, label: "Cropland", isInformativeLandCover: true },
  { code: 13, label: "Urban & built-up", isInformativeLandCover: true },
  {
    code: 14,
    label: "Cropland/natural vegetation mosaic",
    isInformativeLandCover: true,
  },
  { code: 15, label: "Permanent snow & ice", isInformativeLandCover: true },
  { code: 16, label: "Barren", isInformativeLandCover: true },
  { code: 17, label: "Water", isInformativeLandCover: true },
  { code: 255, label: "Unclassified", isInformativeLandCover: false },
];

export interface LandCoverClassObservation {
  /** MCD12Q1 IGBP class code; null means the sampler observed no usable code. */
  classCode: number | null;
  /** Count of samples/pixels represented by this record. Defaults to one. */
  sampleCount?: number;
}

export type LandCoverCoverageStatus = "available" | "no-data";

export interface LandCoverCoverage {
  status: LandCoverCoverageStatus;
  /** Supplied samples with a positive integer count, including no-data. */
  totalSampleCount: number;
  /** Samples in IGBP codes 1..17. */
  knownLandCoverSampleCount: number;
  /** Samples in code 255. */
  unclassifiedSampleCount: number;
  /** Samples where the sampler supplied no usable code. */
  noDataSampleCount: number;
  /** Samples whose code was outside the IGBP contract. */
  invalidClassSampleCount: number;
  /** Records rejected because their sample count was not a positive integer. */
  invalidRecordCount: number;
  /** Share of all counted samples that carried an IGBP land-cover class 1..17. */
  knownLandCoverFraction: number | null;
  reason: "no-samples" | "no-known-land-cover" | null;
}

export interface LandCoverClassCoverage {
  classCode: IgbpLandCoverClassCode;
  label: string;
  sampleCount: number;
  fractionOfAllSamples: number;
  /** Denominator is all source-coded class samples, including unclassified. */
  fractionOfSourceClassSamples: number;
  isInformativeLandCover: boolean;
}

export type LandCoverPublicationStatus =
  "published" | "outside-layer-range" | "invalid-year";

export interface LandCoverProvenance {
  layerId: "landcover";
  wmsLayer: string;
  dataYear: number;
  cadence: "annual";
  classScheme: "IGBP";
  sourceResolution: "500 m";
  source: DatasetRef;
  publicationStatus: LandCoverPublicationStatus;
}

export interface LandCoverContextSummary {
  kind: "observed-class-coded-land-cover";
  /** Explicitly prevents consumers from treating this as a temporal forecast. */
  isForecast: false;
  provenance: LandCoverProvenance;
  coverage: LandCoverCoverage;
  classCoverage: LandCoverClassCoverage[];
  /** Most common informative class by sample count; null for no known class. */
  dominantClass: LandCoverClassCoverage | null;
}

const IGBP_BY_CODE = new Map<IgbpLandCoverClassCode, IgbpLandCoverClass>(
  IGBP_LAND_COVER_CLASSES.map((entry) => [entry.code, entry])
);

export function summarizeLandCoverContext(
  observations: readonly LandCoverClassObservation[],
  dataYear: number
): LandCoverContextSummary {
  const classCounts = new Map<IgbpLandCoverClassCode, number>();
  let totalSampleCount = 0;
  let knownLandCoverSampleCount = 0;
  let unclassifiedSampleCount = 0;
  let noDataSampleCount = 0;
  let invalidClassSampleCount = 0;
  let invalidRecordCount = 0;

  for (const observation of observations) {
    const sampleCount = observation.sampleCount ?? 1;
    if (!Number.isInteger(sampleCount) || sampleCount <= 0) {
      invalidRecordCount += 1;
      continue;
    }

    totalSampleCount += sampleCount;
    const classCode = observation.classCode;
    if (classCode === null) {
      noDataSampleCount += sampleCount;
      continue;
    }
    if (
      !Number.isInteger(classCode) ||
      !IGBP_BY_CODE.has(classCode as IgbpLandCoverClassCode)
    ) {
      invalidClassSampleCount += sampleCount;
      invalidRecordCount += 1;
      continue;
    }

    const igbpCode = classCode as IgbpLandCoverClassCode;
    const igbpClass = IGBP_BY_CODE.get(igbpCode)!;
    classCounts.set(igbpCode, (classCounts.get(igbpCode) ?? 0) + sampleCount);
    if (igbpClass.isInformativeLandCover) {
      knownLandCoverSampleCount += sampleCount;
    } else {
      unclassifiedSampleCount += sampleCount;
    }
  }

  const sourceClassSampleCount =
    knownLandCoverSampleCount + unclassifiedSampleCount;
  const classCoverage = [...classCounts.entries()]
    .map(([classCode, sampleCount]) => {
      const igbpClass = IGBP_BY_CODE.get(classCode)!;
      return {
        classCode,
        label: igbpClass.label,
        sampleCount,
        fractionOfAllSamples:
          totalSampleCount === 0 ? 0 : sampleCount / totalSampleCount,
        fractionOfSourceClassSamples:
          sourceClassSampleCount === 0
            ? 0
            : sampleCount / sourceClassSampleCount,
        isInformativeLandCover: igbpClass.isInformativeLandCover,
      };
    })
    .sort((a, b) => b.sampleCount - a.sampleCount || a.classCode - b.classCode);

  const dominantClass =
    classCoverage.find((entry) => entry.isInformativeLandCover) ?? null;
  const coverage: LandCoverCoverage = {
    status: knownLandCoverSampleCount > 0 ? "available" : "no-data",
    totalSampleCount,
    knownLandCoverSampleCount,
    unclassifiedSampleCount,
    noDataSampleCount,
    invalidClassSampleCount,
    invalidRecordCount,
    knownLandCoverFraction:
      totalSampleCount === 0
        ? null
        : knownLandCoverSampleCount / totalSampleCount,
    reason:
      totalSampleCount === 0
        ? "no-samples"
        : knownLandCoverSampleCount === 0
          ? "no-known-land-cover"
          : null,
  };

  return {
    kind: "observed-class-coded-land-cover",
    isForecast: false,
    provenance: {
      layerId: "landcover",
      wmsLayer: layer.wmsLayer,
      dataYear,
      cadence: "annual",
      classScheme: "IGBP",
      sourceResolution: "500 m",
      source: LAND_COVER_SOURCE,
      publicationStatus: publicationStatusForYear(dataYear),
    },
    coverage,
    classCoverage,
    dominantClass,
  };
}

function publicationStatusForYear(
  dataYear: number
): LandCoverPublicationStatus {
  if (!Number.isInteger(dataYear)) return "invalid-year";
  const latestYear = layer.latest?.year ?? layer.start.year;
  return dataYear >= layer.start.year && dataYear <= latestYear
    ? "published"
    : "outside-layer-range";
}

/**
 * Broad vegetation-formation groups for the IGBP LC_Type1 scheme.
 *
 * The 17 informative IGBP classes are routinely collapsed into coarser
 * formation groups for summary reporting. Grouping only re-buckets whole class
 * codes and sums their sample counts; it never averages the categorical class
 * identifiers. Source unclassified pixels (code 255) carry no land-cover type
 * and therefore belong to no formation.
 */
export type LandCoverFormationId =
  | "forest"
  | "shrubland"
  | "savanna"
  | "grassland"
  | "wetland"
  | "cropland"
  | "urban"
  | "snow-and-ice"
  | "barren"
  | "water";

export interface LandCoverFormation {
  id: LandCoverFormationId;
  label: string;
  /** Whole IGBP LC_Type1 class codes collapsed into this formation. */
  classCodes: readonly IgbpLandCoverClassCode[];
}

/**
 * IGBP LC_Type1 classes 1..17 grouped into vegetation formations. Every
 * informative class code appears in exactly one group; codes 6-7, 8-9, and
 * 12/14 are the standard multi-class formations.
 */
export const LAND_COVER_FORMATIONS: readonly LandCoverFormation[] = [
  { id: "forest", label: "Forest", classCodes: [1, 2, 3, 4, 5] },
  { id: "shrubland", label: "Shrubland", classCodes: [6, 7] },
  { id: "savanna", label: "Savanna", classCodes: [8, 9] },
  { id: "grassland", label: "Grassland", classCodes: [10] },
  { id: "wetland", label: "Permanent wetland", classCodes: [11] },
  { id: "cropland", label: "Cropland", classCodes: [12, 14] },
  { id: "urban", label: "Urban & built-up", classCodes: [13] },
  { id: "snow-and-ice", label: "Permanent snow & ice", classCodes: [15] },
  { id: "barren", label: "Barren", classCodes: [16] },
  { id: "water", label: "Water", classCodes: [17] },
];

export interface LandCoverFormationCoverage {
  id: LandCoverFormationId;
  label: string;
  classCodes: readonly IgbpLandCoverClassCode[];
  sampleCount: number;
  /** Denominator is every counted sample, including no-data and unclassified. */
  fractionOfAllSamples: number;
  /** Denominator is samples carrying an informative IGBP class 1..17. */
  fractionOfKnownLandCover: number;
}

export interface LandCoverFormationSummary {
  kind: "observed-land-cover-formation-groups";
  /** Explicitly prevents consumers from treating this as a temporal forecast. */
  isForecast: false;
  provenance: LandCoverProvenance;
  formationCoverage: LandCoverFormationCoverage[];
  /** Most common formation by sample count; null when no known class present. */
  dominantFormation: LandCoverFormationCoverage | null;
  /**
   * Informative-class samples not mapped to any formation. Zero for the
   * complete IGBP contract; a positive value flags an unmapped class code.
   */
  ungroupedKnownSampleCount: number;
}

const FORMATION_BY_CLASS = new Map<IgbpLandCoverClassCode, LandCoverFormation>(
  LAND_COVER_FORMATIONS.flatMap((formation) =>
    formation.classCodes.map((code) => [code, formation] as const)
  )
);

/**
 * Collapse a class-coded land-cover summary into vegetation-formation groups.
 *
 * Reuses the already-validated coverage and provenance from
 * {@link summarizeLandCoverContext}: no dataset reference is dropped and no
 * class code is re-parsed. Fractions share the same denominators as the class
 * coverage so callers can mix formation and class views without rescaling.
 */
export function summarizeLandCoverFormations(
  context: LandCoverContextSummary
): LandCoverFormationSummary {
  const groupCounts = new Map<LandCoverFormationId, number>();
  let ungroupedKnownSampleCount = 0;

  for (const entry of context.classCoverage) {
    if (!entry.isInformativeLandCover) continue;
    const formation = FORMATION_BY_CLASS.get(entry.classCode);
    if (!formation) {
      ungroupedKnownSampleCount += entry.sampleCount;
      continue;
    }
    groupCounts.set(
      formation.id,
      (groupCounts.get(formation.id) ?? 0) + entry.sampleCount
    );
  }

  const { totalSampleCount, knownLandCoverSampleCount } = context.coverage;
  const formationCoverage = LAND_COVER_FORMATIONS.filter((formation) =>
    groupCounts.has(formation.id)
  )
    .map((formation) => {
      const sampleCount = groupCounts.get(formation.id)!;
      return {
        id: formation.id,
        label: formation.label,
        classCodes: formation.classCodes,
        sampleCount,
        fractionOfAllSamples:
          totalSampleCount === 0 ? 0 : sampleCount / totalSampleCount,
        fractionOfKnownLandCover:
          knownLandCoverSampleCount === 0
            ? 0
            : sampleCount / knownLandCoverSampleCount,
      };
    })
    .sort(
      (a, b) =>
        b.sampleCount - a.sampleCount || a.classCodes[0] - b.classCodes[0]
    );

  return {
    kind: "observed-land-cover-formation-groups",
    isForecast: false,
    provenance: context.provenance,
    formationCoverage,
    dominantFormation: formationCoverage[0] ?? null,
    ungroupedKnownSampleCount,
  };
}
