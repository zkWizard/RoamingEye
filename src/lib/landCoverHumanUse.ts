import {
  type IgbpLandCoverClassCode,
  type LandCoverContextSummary,
  type LandCoverProvenance,
} from "./landCover";

/**
 * Land-use partition of class-coded MODIS MCD12Q1 land-cover samples.
 *
 * The IGBP LC_Type1 scheme distinguishes land cover that reflects direct human
 * land use — cropland (12), urban & built-up (13), and the cropland/natural
 * vegetation mosaic (14) — from every other informative class. This helper only
 * re-buckets whole class codes and sums their sample counts; it never averages
 * the categorical class identifiers and infers no degradation, ecological
 * health, land-use intensity, biodiversity, or causes.
 *
 * Class 14 is a genuine mixture of cultivated and natural cover, so it is kept
 * in its own category and the anthropogenic share is reported as an honest
 * lower/upper bound rather than being forced to one side of the split.
 */

export type LandCoverHumanUseCategoryId =
  | "cultivated"
  | "built"
  | "cultivated-natural-mosaic"
  | "other-land-cover";

export interface LandCoverHumanUseCategory {
  id: LandCoverHumanUseCategoryId;
  label: string;
  /** Whole IGBP LC_Type1 class codes collapsed into this category. */
  classCodes: readonly IgbpLandCoverClassCode[];
  /**
   * Whether the category is unambiguously human land use. The mosaic category
   * is not: it mixes cultivated and natural cover within a single class.
   */
  isAnthropogenic: boolean;
}

/**
 * IGBP LC_Type1 informative classes 1..17 partitioned by land use. Every
 * informative class code appears in exactly one category. Codes 15 (snow &
 * ice), 16 (barren), and 17 (water) are natural (non-anthropogenic) surfaces
 * and fall in `other-land-cover` alongside the natural vegetation classes;
 * the partition describes human land use, not vegetation presence.
 */
export const LAND_COVER_HUMAN_USE_CATEGORIES: readonly LandCoverHumanUseCategory[] =
  [
    {
      id: "cultivated",
      label: "Cropland",
      classCodes: [12],
      isAnthropogenic: true,
    },
    {
      id: "built",
      label: "Urban & built-up",
      classCodes: [13],
      isAnthropogenic: true,
    },
    {
      id: "cultivated-natural-mosaic",
      label: "Cropland/natural vegetation mosaic",
      classCodes: [14],
      // Mixed cultivated and natural cover: neither fully anthropogenic nor not.
      isAnthropogenic: false,
    },
    {
      id: "other-land-cover",
      label: "Other land cover",
      classCodes: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 15, 16, 17],
      isAnthropogenic: false,
    },
  ];

export interface LandCoverHumanUseCategoryCoverage {
  id: LandCoverHumanUseCategoryId;
  label: string;
  classCodes: readonly IgbpLandCoverClassCode[];
  isAnthropogenic: boolean;
  sampleCount: number;
  /** Denominator is every counted sample, including no-data and unclassified. */
  fractionOfAllSamples: number;
  /** Denominator is samples carrying an informative IGBP class 1..17. */
  fractionOfKnownLandCover: number;
}

export interface LandCoverAnthropogenicShare {
  /**
   * Share of informative land cover from unambiguous human land use (cropland
   * and built-up). Null when no informative land cover was observed.
   */
  lowerBound: number | null;
  /**
   * Lower bound plus the cropland/natural mosaic, the largest the anthropogenic
   * share could be if every mosaic sample were treated as human land use.
   */
  upperBound: number | null;
  /** Informative samples in the ambiguous cropland/natural mosaic class. */
  mosaicSampleCount: number;
}

export interface LandCoverHumanUseSummary {
  kind: "observed-land-cover-human-use";
  /** Explicitly prevents consumers from treating this as a temporal forecast. */
  isForecast: false;
  provenance: LandCoverProvenance;
  categoryCoverage: LandCoverHumanUseCategoryCoverage[];
  /** Bounded fraction of informative land cover under direct human land use. */
  anthropogenicShare: LandCoverAnthropogenicShare;
  /**
   * Informative-class samples not mapped to any category. Zero for the complete
   * IGBP contract; a positive value flags an unmapped class code.
   */
  ungroupedKnownSampleCount: number;
}

const CATEGORY_BY_CLASS = new Map<
  IgbpLandCoverClassCode,
  LandCoverHumanUseCategory
>(
  LAND_COVER_HUMAN_USE_CATEGORIES.flatMap((category) =>
    category.classCodes.map((code) => [code, category] as const)
  )
);

/**
 * Partition a class-coded land-cover summary by land use.
 *
 * Reuses the already-validated coverage and provenance from
 * {@link summarizeLandCoverContext}: no dataset reference is dropped and no
 * class code is re-parsed. Fractions share the same denominators as the class
 * and formation coverage so callers can mix the views without rescaling.
 */
export function summarizeLandCoverHumanUse(
  context: LandCoverContextSummary
): LandCoverHumanUseSummary {
  const categoryCounts = new Map<LandCoverHumanUseCategoryId, number>();
  let ungroupedKnownSampleCount = 0;

  for (const entry of context.classCoverage) {
    if (!entry.isInformativeLandCover) continue;
    const category = CATEGORY_BY_CLASS.get(entry.classCode);
    if (!category) {
      ungroupedKnownSampleCount += entry.sampleCount;
      continue;
    }
    categoryCounts.set(
      category.id,
      (categoryCounts.get(category.id) ?? 0) + entry.sampleCount
    );
  }

  const { totalSampleCount, knownLandCoverSampleCount } = context.coverage;
  const categoryCoverage = LAND_COVER_HUMAN_USE_CATEGORIES.filter((category) =>
    categoryCounts.has(category.id)
  )
    .map((category) => {
      const sampleCount = categoryCounts.get(category.id)!;
      return {
        id: category.id,
        label: category.label,
        classCodes: category.classCodes,
        isAnthropogenic: category.isAnthropogenic,
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

  const unambiguousAnthropogenicCount =
    (categoryCounts.get("cultivated") ?? 0) +
    (categoryCounts.get("built") ?? 0);
  const mosaicSampleCount =
    categoryCounts.get("cultivated-natural-mosaic") ?? 0;
  const anthropogenicShare: LandCoverAnthropogenicShare = {
    lowerBound:
      knownLandCoverSampleCount === 0
        ? null
        : unambiguousAnthropogenicCount / knownLandCoverSampleCount,
    upperBound:
      knownLandCoverSampleCount === 0
        ? null
        : (unambiguousAnthropogenicCount + mosaicSampleCount) /
          knownLandCoverSampleCount,
    mosaicSampleCount,
  };

  return {
    kind: "observed-land-cover-human-use",
    isForecast: false,
    provenance: context.provenance,
    categoryCoverage,
    anthropogenicShare,
    ungroupedKnownSampleCount,
  };
}
