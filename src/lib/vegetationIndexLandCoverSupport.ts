import {
  type IgbpLandCoverClassCode,
  type LandCoverContextSummary,
  type LandCoverProvenance,
} from "./landCover";
import { LAYERS, type DatasetRef, type LayerId } from "./timeline";

/**
 * Whether an IGBP land-cover class describes a surface a vegetation index can
 * be read as plant greenness on.
 *
 * MOD13A3 retrieves NDVI and EVI over every land surface, including surfaces
 * MCD12Q1 classifies as containing little or no vegetation. A greenness value
 * therefore exists where there is no canopy to describe, and its seasonal
 * cycle there tracks the background surface (snow, soil wetness, water) rather
 * than plant phenology. This helper reports which of the two cases a sample's
 * class definition puts it in.
 *
 * The partition is definitional, not ecological: every tier below is decided
 * by the cover thresholds the MCD12Q1 v061 LC_Type1 class definitions state,
 * so a tier says what the class *permits or requires*, never how much
 * vegetation is actually present. Nothing here infers biomass, productivity,
 * biodiversity, habitat quality, ecological health, causes, or forecasts, and
 * no categorical class identifier is averaged.
 */

const vegetationLayer = LAYERS.ndvi;
if (!vegetationLayer.dataset) {
  throw new Error(
    "RoamingEye: the vegetation-index layer must retain a cited dataset"
  );
}

/** MOD13A3 v061 provenance — the product the support tiers qualify. */
export const VEGETATION_INDEX_SOURCE: DatasetRef = vegetationLayer.dataset;

/** The layers this partition qualifies; both render the same MOD13A3 product. */
export const VEGETATION_INDEX_LAYER_IDS: readonly LayerId[] = ["ndvi", "evi"];

export type VegetationIndexSupportId =
  | "vegetated"
  | "mixed-water"
  | "mixed-built"
  | "sparsely-vegetated"
  | "non-vegetated";

export interface VegetationIndexSupportTier {
  id: VegetationIndexSupportId;
  label: string;
  /** Whole IGBP LC_Type1 class codes assigned to this tier. */
  classCodes: readonly IgbpLandCoverClassCode[];
  /**
   * True only where the class definition *requires* vegetation cover, so a
   * greenness value describes the class's own plants. False where vegetation
   * is capped, absent, or merely permitted alongside another surface.
   */
  requiresVegetationCover: boolean;
  /**
   * True where the definition allows a substantial vegetated fraction without
   * requiring it, so a greenness value mixes plants with another surface.
   */
  permitsVegetationCover: boolean;
  /** The MCD12Q1 v061 LC_Type1 cover thresholds this tier is decided by. */
  definitionalBasis: string;
}

/**
 * IGBP LC_Type1 informative classes 1..17 partitioned by whether their own
 * definition supports reading NDVI/EVI as plant greenness. Every informative
 * class code appears in exactly one tier; the unclassified code 255 carries no
 * class definition and therefore belongs to no tier.
 */
export const VEGETATION_INDEX_SUPPORT_TIERS: readonly VegetationIndexSupportTier[] =
  [
    {
      id: "vegetated",
      label: "Vegetated land cover",
      classCodes: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 12, 14],
      requiresVegetationCover: true,
      permitsVegetationCover: true,
      // Forests require >60% tree cover; closed shrubland >60% and open
      // shrubland 10-60% shrub cover; woody savanna 30-60% and savanna 10-30%
      // tree cover over herbaceous ground; grassland is herbaceous-dominated;
      // cropland is >=60% cultivated; the mosaic is 40-60% cultivation with
      // natural tree, shrub, or herbaceous vegetation.
      definitionalBasis:
        "the class definition requires vegetation cover (open shrubland and savanna as little as 10% woody cover over vegetated ground)",
    },
    {
      id: "mixed-water",
      label: "Permanent wetland",
      classCodes: [11],
      requiresVegetationCover: false,
      permitsVegetationCover: true,
      definitionalBasis:
        "permanently inundated land with 30-60% water cover and only >10% vegetated cover required",
    },
    {
      id: "mixed-built",
      label: "Urban & built-up",
      classCodes: [13],
      requiresVegetationCover: false,
      permitsVegetationCover: true,
      definitionalBasis:
        "at least 30% impervious surface, with the remaining fraction unconstrained and possibly vegetated",
    },
    {
      id: "sparsely-vegetated",
      label: "Barren",
      classCodes: [16],
      requiresVegetationCover: false,
      permitsVegetationCover: false,
      definitionalBasis:
        "at least 60% non-vegetated sand, rock, or soil, with vegetation capped below 10%",
    },
    {
      id: "non-vegetated",
      label: "Snow, ice & water",
      classCodes: [15, 17],
      requiresVegetationCover: false,
      permitsVegetationCover: false,
      definitionalBasis:
        "at least 60% permanent snow and ice, or at least 60% permanent water body",
    },
  ];

/**
 * The tiers whose class definitions neither require nor permit a substantial
 * plant canopy. MOD13A3 still retrieves NDVI and EVI over them, so a value
 * exists there that describes the background surface rather than plants.
 */
export const NON_VEGETATING_TIER_IDS: readonly VegetationIndexSupportId[] =
  VEGETATION_INDEX_SUPPORT_TIERS.filter(
    (tier) => !tier.permitsVegetationCover
  ).map((tier) => tier.id);

export const VEGETATION_INDEX_SUPPORT_LIMITATIONS = [
  "Tiers restate MCD12Q1 v061 IGBP class definitions; they report what a class permits or requires, not how much vegetation a sample holds.",
  "Land cover is an annual MCD12Q1 classification and the vegetation index is a monthly MOD13A3 composite: the two describe the same place at different times, from different products.",
  "A supported tier does not make a greenness value accurate; the rendered vegetation-index colours carry their own inversion error.",
  "Sample counts are counts of selected-boundary samples, not measured areas.",
] as const;

export interface VegetationIndexSupportCoverage {
  id: VegetationIndexSupportId;
  label: string;
  classCodes: readonly IgbpLandCoverClassCode[];
  requiresVegetationCover: boolean;
  permitsVegetationCover: boolean;
  definitionalBasis: string;
  sampleCount: number;
  /** Denominator is every counted sample, including no-data and unclassified. */
  fractionOfAllSamples: number;
  /** Denominator is samples carrying an informative IGBP class 1..17. */
  fractionOfKnownLandCover: number;
}

export interface PlantCanopyShare {
  /**
   * Share of informative land cover whose class definition requires vegetation
   * cover. Null when no informative land cover was observed.
   */
  lowerBound: number | null;
  /**
   * Lower bound plus the wetland and built-up classes, the largest the share
   * could be if every mixed sample were vegetated up to what its class allows.
   */
  upperBound: number | null;
  /** Informative samples in classes that permit but do not require vegetation. */
  mixedSampleCount: number;
  /**
   * Share of informative land cover in classes whose definition neither
   * requires nor permits a substantial plant canopy — barren, permanent snow
   * and ice, and permanent water. Null when no informative land cover was
   * observed.
   *
   * Summed from those tiers' own counts rather than taken as `1 - upperBound`:
   * an informative class carrying no tier lands in
   * `ungroupedKnownSampleCount`, and subtraction would silently relabel it as
   * one of these surfaces. The complete IGBP contract never produces one, but
   * an unmapped class code would.
   */
  nonVegetatedBound: number | null;
  /** Informative samples in classes that neither require nor permit vegetation. */
  nonVegetatedSampleCount: number;
}

export interface VegetationIndexLandCoverSupportSummary {
  kind: "observed-land-cover-vegetation-index-support";
  /** Explicitly prevents consumers from treating this as a temporal forecast. */
  isForecast: false;
  /** Mirrors whether the source-backed land-cover observation is usable. */
  status: LandCoverContextSummary["observationStatus"];
  /** Preserves the upstream reason when tier shares are withheld. */
  unavailableReason: LandCoverContextSummary["unavailableReason"];
  /** MCD12Q1 provenance for the classes, reused verbatim. */
  provenance: LandCoverProvenance;
  /** MOD13A3 provenance for the vegetation index the tiers qualify. */
  vegetationIndexSource: DatasetRef;
  /** The vegetation-index layers this partition speaks for. */
  vegetationIndexLayerIds: readonly LayerId[];
  tierCoverage: VegetationIndexSupportCoverage[];
  /** Bounded fraction of informative land cover that is a plant canopy. */
  plantCanopyShare: PlantCanopyShare;
  /**
   * Most sampled tier by count; null when no informative class was observed.
   * Ties resolve to the lowest first class code so the choice is deterministic.
   */
  dominantTier: VegetationIndexSupportCoverage | null;
  /** Whether the largest tier count is unique or shared with another tier. */
  dominantTierStatus: "unique" | "tied" | "no-data";
  /**
   * Informative-class samples not mapped to any tier. Zero for the complete
   * IGBP contract; a positive value flags an unmapped class code.
   */
  ungroupedKnownSampleCount: number;
  limitations: readonly string[];
}

/**
 * One-sentence probe-panel clause for how much of a region's classified land
 * cover is a surface a vegetation index can be read as plant greenness on.
 *
 * Reports the two bounds of {@link PlantCanopyShare} as separate rounded
 * shares rather than as a range: rounding a range collapses distinct bounds
 * into an identical pair ("72-72%"), which reads as a precision the sample
 * count does not carry. Both shares are shares of CLASSIFIED sampled image
 * pixels, never of ground area.
 *
 * The barren and snow/ice/water share is stated too, and it is the reason the
 * clause exists: MOD13A3 retrieves a value over those surfaces exactly as it
 * does over canopy, so a region's greenness there tracks the background
 * surface rather than plants. Naming only the required and mixed shares left
 * that case to subtraction — and subtraction gives a number, not the fact that
 * what it counts is a surface the index cannot be read as vegetation on at
 * all. The point reading already says this for a single class
 * ({@link vegetationIndexSupportClassNote}); this says it for a drawn region,
 * from the same definitional tiers, so the two surfaces do not disagree.
 *
 * Each share is rounded on its own and joined with "a further", which claims
 * no partition: three independently rounded shares need not total 100%, and
 * `shareText` deliberately reports a present share as "<1%" rather than "0%".
 * Only the surfaces actually sampled are named, so a snow-and-water region is
 * never told it contains barren ground.
 *
 * Returns null when no informative class was observed — the composition copy
 * already states that, and a second empty statement would only add width.
 */
export function vegetationIndexSupportNote(
  summary: VegetationIndexLandCoverSupportSummary
): string | null {
  const { lowerBound, upperBound, mixedSampleCount, nonVegetatedBound } =
    summary.plantCanopyShare;
  if (summary.status !== "available") return null;
  if (lowerBound === null || upperBound === null) return null;

  const source = `${summary.vegetationIndexSource.shortName} v${summary.vegetationIndexSource.version}`;
  const clauses = [
    `${source} NDVI/EVI reads as plant greenness on ${shareText(
      lowerBound
    )} of classified pixels, where the IGBP class definition requires vegetation cover`,
  ];
  if (mixedSampleCount > 0) {
    clauses.push(
      `a further ${shareText(
        upperBound - lowerBound
      )} is wetland or built-up, which permit vegetation without requiring it`
    );
  }
  const nonVegetatedSurfaces = sampledNonVegetatingSurfaces(summary);
  if (nonVegetatedBound !== null && nonVegetatedSurfaces) {
    clauses.push(
      `a further ${shareText(
        nonVegetatedBound
      )} is ${nonVegetatedSurfaces}, where NDVI/EVI still returns a value that is not plant greenness`
    );
  }
  return `${clauses.join("; ")}.`;
}

/** Prose for the non-vegetating tiers this sample actually holds; null for none. */
function sampledNonVegetatingSurfaces(
  summary: VegetationIndexLandCoverSupportSummary
): string | null {
  const sampled = new Set(
    summary.tierCoverage
      .filter((tier) => tier.sampleCount > 0)
      .map((tier) => tier.id)
  );
  const barren = sampled.has("sparsely-vegetated");
  const frozenOrWater = sampled.has("non-vegetated");
  if (barren && frozenOrWater) return "barren, snow, ice, or permanent water";
  if (barren) return "barren sand, rock, or soil";
  if (frozenOrWater) return "permanent snow, ice, or water";
  return null;
}

/**
 * A rounded percentage that never rounds a present share away to "0%" or a
 * partial share up to "100%" — either would state an absence or a totality the
 * samples do not show.
 */
function shareText(fraction: number): string {
  const percent = Math.round(fraction * 100);
  if (percent === 0 && fraction > 0) return "<1%";
  if (percent === 100 && fraction < 1) return ">99%";
  return `${percent}%`;
}

const TIER_BY_CLASS = new Map<
  IgbpLandCoverClassCode,
  VegetationIndexSupportTier
>(
  VEGETATION_INDEX_SUPPORT_TIERS.flatMap((tier) =>
    tier.classCodes.map((code) => [code, tier] as const)
  )
);

/** The support tier a single IGBP class falls in; null for 255 and non-IGBP codes. */
export function vegetationIndexSupportForClass(
  classCode: number
): VegetationIndexSupportTier | null {
  return TIER_BY_CLASS.get(classCode as IgbpLandCoverClassCode) ?? null;
}

/**
 * The same clause as {@link vegetationIndexSupportNote}, for a POINT sample
 * that has named its most frequent class or classes rather than a share.
 *
 * A point probe resolves to labels, not to a mix, so there is no share to
 * report: what a reader still cannot tell from "Permanent snow & ice (IGBP
 * class 15)" alone is that MOD13A3 retrieves NDVI and EVI there anyway, and
 * that the value is a background-surface signal rather than plant greenness.
 * The region copy states exactly that for a drawn box; this states it for the
 * point, from the same definitional tiers, so the two surfaces do not disagree.
 *
 * Phrased on the tier, never on the class count, so a tie whose classes share
 * one tier reads correctly without pluralising. A tie SPANNING tiers is
 * reported as unresolved rather than resolved to one tier's wording: the tied
 * classes carry no ordering, so picking either statement would invent one.
 *
 * Returns null when no informative class was named — the reading already says
 * so — and when any class carries no tier at all, which the complete IGBP
 * contract never produces but an unmapped code would.
 */
export function vegetationIndexSupportClassNote(
  classCodes: readonly number[]
): string | null {
  if (classCodes.length === 0) return null;
  const tiers: VegetationIndexSupportTier[] = [];
  for (const classCode of classCodes) {
    const tier = vegetationIndexSupportForClass(classCode);
    if (!tier) return null;
    tiers.push(tier);
  }

  const source = `${VEGETATION_INDEX_SOURCE.shortName} v${VEGETATION_INDEX_SOURCE.version}`;
  if (new Set(tiers.map((tier) => tier.id)).size > 1) {
    return `${source} NDVI/EVI is not read the same way on the tied classes — their IGBP definitions differ on whether vegetation cover is required.`;
  }

  const tier = tiers[0];
  if (tier.requiresVegetationCover) {
    return `${source} NDVI/EVI reads as plant greenness here — ${tier.definitionalBasis}.`;
  }
  if (tier.permitsVegetationCover) {
    return `${source} NDVI/EVI mixes plants with another surface here — ${tier.definitionalBasis}.`;
  }
  return `${source} still retrieves NDVI/EVI here, but it does not describe plant cover — ${tier.definitionalBasis}.`;
}

/**
 * Partition a class-coded land-cover summary by vegetation-index support.
 *
 * Reuses the already-validated coverage and provenance from
 * {@link summarizeLandCoverContext}: no dataset reference is dropped and no
 * class code is re-parsed. Fractions share the same denominators as the class,
 * formation, and human-use views so callers can mix them without rescaling.
 */
export function summarizeVegetationIndexLandCoverSupport(
  context: LandCoverContextSummary
): VegetationIndexLandCoverSupportSummary {
  if (context.observationStatus === "unavailable") {
    return {
      kind: "observed-land-cover-vegetation-index-support",
      isForecast: false,
      status: "unavailable",
      unavailableReason: context.unavailableReason,
      provenance: context.provenance,
      vegetationIndexSource: VEGETATION_INDEX_SOURCE,
      vegetationIndexLayerIds: VEGETATION_INDEX_LAYER_IDS,
      tierCoverage: [],
      plantCanopyShare: {
        lowerBound: null,
        upperBound: null,
        mixedSampleCount: 0,
        nonVegetatedBound: null,
        nonVegetatedSampleCount: 0,
      },
      dominantTier: null,
      dominantTierStatus: "no-data",
      ungroupedKnownSampleCount: 0,
      limitations: VEGETATION_INDEX_SUPPORT_LIMITATIONS,
    };
  }

  const tierCounts = new Map<VegetationIndexSupportId, number>();
  let ungroupedKnownSampleCount = 0;

  for (const entry of context.classCoverage) {
    if (!entry.isInformativeLandCover) continue;
    const tier = TIER_BY_CLASS.get(entry.classCode);
    if (!tier) {
      ungroupedKnownSampleCount += entry.sampleCount;
      continue;
    }
    tierCounts.set(tier.id, (tierCounts.get(tier.id) ?? 0) + entry.sampleCount);
  }

  const { totalSampleCount, knownLandCoverSampleCount } = context.coverage;
  const tierCoverage = VEGETATION_INDEX_SUPPORT_TIERS.filter((tier) =>
    tierCounts.has(tier.id)
  )
    .map((tier) => {
      const sampleCount = tierCounts.get(tier.id)!;
      return {
        id: tier.id,
        label: tier.label,
        classCodes: tier.classCodes,
        requiresVegetationCover: tier.requiresVegetationCover,
        permitsVegetationCover: tier.permitsVegetationCover,
        definitionalBasis: tier.definitionalBasis,
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

  const canopySampleCount = tierCounts.get("vegetated") ?? 0;
  const mixedSampleCount =
    (tierCounts.get("mixed-water") ?? 0) + (tierCounts.get("mixed-built") ?? 0);
  const nonVegetatedSampleCount = NON_VEGETATING_TIER_IDS.reduce(
    (total, id) => total + (tierCounts.get(id) ?? 0),
    0
  );
  const plantCanopyShare: PlantCanopyShare = {
    lowerBound:
      knownLandCoverSampleCount === 0
        ? null
        : canopySampleCount / knownLandCoverSampleCount,
    upperBound:
      knownLandCoverSampleCount === 0
        ? null
        : (canopySampleCount + mixedSampleCount) / knownLandCoverSampleCount,
    mixedSampleCount,
    nonVegetatedBound:
      knownLandCoverSampleCount === 0
        ? null
        : nonVegetatedSampleCount / knownLandCoverSampleCount,
    nonVegetatedSampleCount,
  };

  const dominantTier = tierCoverage[0] ?? null;
  const dominantTierStatus = !dominantTier
    ? "no-data"
    : tierCoverage.filter(
          (tier) => tier.sampleCount === dominantTier.sampleCount
        ).length > 1
      ? "tied"
      : "unique";

  return {
    kind: "observed-land-cover-vegetation-index-support",
    isForecast: false,
    status: "available",
    unavailableReason: null,
    provenance: context.provenance,
    vegetationIndexSource: VEGETATION_INDEX_SOURCE,
    vegetationIndexLayerIds: VEGETATION_INDEX_LAYER_IDS,
    tierCoverage,
    plantCanopyShare,
    dominantTier,
    dominantTierStatus,
    ungroupedKnownSampleCount,
    limitations: VEGETATION_INDEX_SUPPORT_LIMITATIONS,
  };
}
