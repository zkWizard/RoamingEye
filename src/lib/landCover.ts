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
