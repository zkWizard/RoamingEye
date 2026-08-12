import { LAYERS, type DatasetRef } from "./timeline";

/**
 * What the rendered MODIS vegetation-index layers leave undrawn.
 *
 * NDVI and EVI are defined on [-1, 1], and MOD13A3 itself reports values down
 * to -0.2. GIBS renders only the non-negative part of that range. In both
 * MODIS_L3_NDVI and MODIS_L3_EVI the same three colormap entries are marked
 * `transparent="true"` — the product fill band [-0.3, -0.2) plus the two bands
 * covering [-0.2, 0.0001) — and the drawn ramp starts at the first bin above
 * zero. The transparent entries are excluded from the `<Legend
 * type="continuous">` block that {@link parseColormapEntries} reads, so nothing
 * downstream can recover a negative index from the imagery: it was never drawn.
 *
 * That matters for how a *gap* in these layers reads. A negative vegetation
 * index is what open water, snow and ice, and cloud produce — near-infrared
 * reflectance falls below red, so the ratio goes negative — and all three land
 * in the transparent bands alongside genuine fill. A blank pixel in the NDVI
 * layer is therefore not "very little greenness"; it is a value the layer
 * declines to draw, and the four causes are not separable from the rendered
 * tile alone.
 *
 * Scientific honesty (kept in code because callers surface it):
 *  - These bounds describe the *rendered* GIBS layer, not the MOD13A3 product.
 *    A sample recovered from imagery is truncated at the rendered floor; the
 *    underlying product may well hold a negative value there.
 *  - A mean taken over a boundary in these layers is a mean over drawn pixels
 *    only. For a coastal, high-latitude, or persistently cloudy place that is a
 *    mean over part of the boundary, and the undrawn share must not be folded
 *    in as low greenness.
 *  - Naming water, snow/ice, and cloud states which surfaces produce a negative
 *    index. It does not identify the surface at any particular pixel, and none
 *    of this infers cover, biomass, condition, a cause, or a forecast.
 *
 * Ranges measured 2026-08-11 from the live colormap documents.
 */

export type RenderedVegetationIndexId = "ndvi" | "evi";

export interface RenderedVegetationIndexRange {
  /** GIBS colormap document the imagery is rendered with. */
  colormapDoc: string;
  /**
   * Exclusive lower bound of the transparent bands: the first value GIBS
   * draws. Below it the tile carries no colour at all.
   */
  renderedMinimum: number;
  /** Highest value the drawn ramp reaches. */
  renderedMaximum: number;
  /** Drawn bins in the document's continuous legend. */
  renderedBinCount: number;
  /** Lowest value any transparent band covers — the product fill floor. */
  transparentFloor: number;
  /** Retained MOD13A3 provenance; these are rendering facts about that product. */
  source: DatasetRef;
}

const NDVI_DATASET = LAYERS.ndvi.dataset;
const EVI_DATASET = LAYERS.evi.dataset;
if (!NDVI_DATASET || !EVI_DATASET) {
  throw new Error(
    "RoamingEye: the vegetation-index layers must retain a cited dataset"
  );
}

export const RENDERED_VEGETATION_INDEX_RANGE: Record<
  RenderedVegetationIndexId,
  RenderedVegetationIndexRange
> = {
  ndvi: {
    colormapDoc: "MODIS_L3_NDVI",
    renderedMinimum: 0.0001,
    renderedMaximum: 1,
    renderedBinCount: 140,
    transparentFloor: -0.3,
    source: NDVI_DATASET,
  },
  evi: {
    colormapDoc: "MODIS_L3_EVI",
    renderedMinimum: 0.0001,
    renderedMaximum: 1,
    renderedBinCount: 132,
    transparentFloor: -0.3,
    source: EVI_DATASET,
  },
};

/** Bounds of the index definition itself, independent of any rendering. */
export const VEGETATION_INDEX_DEFINITION = { minimum: -1, maximum: 1 } as const;

export type RenderedVegetationIndexStatus =
  /** Inside the drawn ramp: the imagery carries a colour for this value. */
  | "rendered"
  /** Valid index value, but in the transparent bands — never drawn. */
  | "below-rendered-minimum"
  /** Valid index value above the drawn ramp's ceiling. */
  | "above-rendered-maximum"
  /** Outside [-1, 1]: not a vegetation index value at all. */
  | "outside-index-definition";

/**
 * Say whether a vegetation-index value is one the GIBS layer draws.
 *
 * `below-rendered-minimum` is the case that matters: those values exist in the
 * product and are legitimate observations, but no sample taken from the
 * rendered imagery can report them, so a reader must not treat their absence
 * as an absence of the surface.
 */
export function classifyRenderedVegetationIndex(
  index: RenderedVegetationIndexId,
  value: number
): RenderedVegetationIndexStatus {
  const range = RENDERED_VEGETATION_INDEX_RANGE[index];
  if (
    !Number.isFinite(value) ||
    value < VEGETATION_INDEX_DEFINITION.minimum ||
    value > VEGETATION_INDEX_DEFINITION.maximum
  ) {
    return "outside-index-definition";
  }
  if (value < range.renderedMinimum) return "below-rendered-minimum";
  if (value > range.renderedMaximum) return "above-rendered-maximum";
  return "rendered";
}

/**
 * The legend's guardrail for a vegetation-index layer.
 *
 * Built from {@link RENDERED_VEGETATION_INDEX_RANGE} rather than written out,
 * so the sentence the user reads cannot drift from the measured ramp. The
 * existing caveat is kept: the colour is an index, not a cover or condition
 * measurement.
 */
export function vegetationIndexLegendNote(
  index: RenderedVegetationIndexId
): string {
  const label = index.toUpperCase();
  return (
    `${label} is a unitless vegetation index; color does not measure vegetation cover, biomass, or condition. ` +
    "Only values above zero are drawn — water, snow, ice, and cloud are transparent gaps here, not low greenness."
  );
}
