import { NO_DATA_DISTANCE, type Rgb } from "./probe";

/**
 * How a rendered MODIS vegetation-index image encodes "no index here", and
 * whether that can be told apart from a real observation at all.
 *
 * GIBS marks every value below the ramp's start transparent in the
 * MODIS_L3_NDVI and MODIS_L3_EVI colormaps — the Fill band plus both negative
 * bands, which is what open water, snow, ice, cloud, and negative-index barren
 * surface produce — and the continuous legend the app parses therefore starts
 * just above zero. Those pixels are undrawn, not low.
 *
 * The app fetches these composites as JPEG (lib/imagery.ts), a format with no
 * alpha channel, so "undrawn" arrives as **black** rather than as a flagged or
 * transparent value. The sampler reads only R, G and B, so black is offered to
 * the colormap inversion as though it were a rendered colour.
 *
 * That is harmless for most layers, whose ramps sit far outside the app-wide
 * 60-unit no-data distance. Both vegetation ramps are exceptions, because both
 * run to near-black at their dense-canopy end — where a mis-read lands on the
 * *highest* value the index can take:
 *
 *  - NDVI's darkest published colour is rgb(0,24,0) at 0.985, only **24.0**
 *    units from black. Under the default threshold black inverts to NDVI
 *    0.985, so every undrawn pixel inside a searched boundary is averaged into
 *    the place panel's vegetation mean as near-maximum greenness.
 *  - EVI's darkest published colour *is* black — rgb(0,0,0) at 0.9625, a
 *    separation of **0.0**. Peak EVI and no EVI are the same colour, so no
 *    colour-distance rule can separate them (see EVI_NO_DATA_SEPARABILITY).
 *
 * The hand-drawn display legends in lib/legend.ts are not affected: their dark
 * ends (#1a6b1a, #125e12) are 113 and 97 units from black, so the point/area
 * probe and the display-ramp place fallback already reject it. This module
 * concerns the authoritative-colormap path only.
 *
 * Nothing here interprets the index. A rejected pixel means the product drew
 * no vegetation index there — not that the surface is bare, not that it is
 * water, and not that greenness is low.
 */

export type VegetationIndexId = "ndvi" | "evi";

/** What an undrawn vegetation-index pixel becomes after the JPEG transport. */
export const VEGETATION_INDEX_NO_DATA_RGB: Rgb = { r: 0, g: 0, b: 0 };

/** Euclidean RGB distance — the metric the probe's inversion already uses. */
export function colorDistance(a: Rgb, b: Rgb): number {
  return Math.hypot(a.r - b.r, a.g - b.g, a.b - b.b);
}

/**
 * Measured distance from the no-data black to each ramp's nearest published
 * colour, against the live GIBS colormaps on 2026-08-11. Re-checked weekly by
 * contract/vegetation-index-no-data.contract.test.ts; a GIBS re-render that
 * moves either dark end must fail there rather than quietly change what an
 * undrawn pixel reads as.
 */
export const VEGETATION_INDEX_NO_DATA_SEPARATION: Record<
  VegetationIndexId,
  number
> = {
  ndvi: 24.0,
  evi: 0,
};

/**
 * Whether an undrawn pixel can be told from a published ramp colour by colour
 * distance. "inseparable" means the ramp contains the no-data colour itself,
 * so *no* threshold works and the layer must not be decoded through this path.
 */
export type NoDataSeparability = "separable" | "inseparable";

export function vegetationIndexNoDataSeparability(
  index: VegetationIndexId
): NoDataSeparability {
  return VEGETATION_INDEX_NO_DATA_SEPARATION[index] > 0
    ? "separable"
    : "inseparable";
}

/**
 * The inversion threshold the NDVI place card samples with, replacing the
 * app-wide 60. Below half the measured 24.0 separation, so black is rejected
 * with margin on both sides of the midpoint.
 *
 * It costs the layer nothing: the published ramp is a dense polyline with a
 * uniform 1.0-unit step between neighbouring colours, so all 140 published
 * colours still invert to their own value at this threshold (asserted in the
 * unit and contract tests). A genuine dense-canopy pixel that JPEG has shifted
 * stays nearer some ramp colour than the 11-unit bound; only pixels stranded
 * between the ramp and black are dropped, which lowers the reported coverage
 * fraction instead of biasing the mean.
 */
export const NDVI_MAX_INVERSION_DISTANCE = 11;

/**
 * Guard for the authoritative-colormap place path. EVI has no usable
 * threshold, so wiring it into that path would report undrawn water and cloud
 * as EVI 0.9625 with no way to detect it; it must stay on the display-ramp
 * path (whose legend does reject black) until GIBS publishes a ramp that does
 * not end in the no-data colour, or the app fetches a format carrying alpha.
 */
export function placeInversionDistanceFor(
  index: VegetationIndexId
): number | null {
  return index === "ndvi" ? NDVI_MAX_INVERSION_DISTANCE : null;
}

/** True while the app-wide default would still mis-read black as a value. */
export function defaultThresholdMisreadsNoData(
  index: VegetationIndexId
): boolean {
  return VEGETATION_INDEX_NO_DATA_SEPARATION[index] < NO_DATA_DISTANCE;
}
