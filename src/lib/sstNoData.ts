import { NO_DATA_DISTANCE, type Rgb } from "./probe";

/**
 * How a rendered MODIS/Aqua SST image encodes "no sea-surface temperature
 * here", and the colour distance that separates that from a real observation.
 *
 * GIBS serves the SST layer as JPEG, so every pixel the L3 product leaves
 * empty — land, sea ice, persistent cloud, missing swath — arrives as black
 * rather than as a transparent or sentinel value. The published ramp
 * (MODIS_Sea_Surface_Temperature) starts at a very dark maroon, so black sits
 * only ~53 RGB units from the ramp's coldest colour: inside the app-wide
 * `NO_DATA_DISTANCE` of 60. Nearest-entry inversion therefore accepts empty
 * pixels as a valid ~0.08 °C reading instead of rejecting them.
 *
 * This is an SST rendering/decoding concern only. Nothing here describes
 * marine organisms, habitat, ecosystem state, causes, or future conditions,
 * and a rejected pixel means "this product reports no SST for that pixel" —
 * not "this location is land" and not "the water is cold".
 */

/**
 * Colour GIBS renders where the SST product carries no value. Published by
 * the colormap document itself as its `nodata` entry (rgb 0,0,0); JPEG
 * encoding smears it a little, which is what the distance below absorbs.
 */
export const SST_NO_DATA_RGB: Rgb = { r: 0, g: 0, b: 0 };

/**
 * Distance from SST no-data black to the nearest colour on the published
 * ramp, measured against the live colormap on 2026-08-11: the ramp's coldest
 * retained entry is rgb(45,0,28), giving hypot(45,0,28) = 53.0. Committed so
 * the accompanying test fails if a re-rendered ramp ever moves the two
 * closer together than the threshold below assumes.
 */
export const SST_NO_DATA_TO_RAMP_DISTANCE = 53.0;

/**
 * Maximum colour distance an SST pixel may sit from the published ramp and
 * still count as an observation.
 *
 * Derived, not tuned to taste: sampling five 512x512 GIBS scenes for
 * 2026-03 (open Pacific, Iceland shelf, Gulf coast, Weddell Sea, landlocked
 * Kansas) put every genuine open-ocean pixel within 8.1 units of a ramp
 * colour, while no-data pixels never came closer than 46.3. 24 is ~3x the
 * worst observed open-ocean deviation — ample room for JPEG noise of about
 * ±10 per channel — and less than half the 53.0 separation above, so black
 * cannot be mistaken for near-freezing water.
 *
 * Coastline pixels that genuinely blend water and land colours remain
 * ambiguous at any threshold; they are excluded here rather than averaged in,
 * which is the conservative direction for a boundary mean.
 */
export const SST_MAX_INVERSION_DISTANCE = 24;

/**
 * The default threshold is unsafe for this layer specifically. Kept as an
 * assertion for the test suite and as documentation of why SST opts out.
 */
export const SST_DEFAULT_DISTANCE_IS_UNSAFE =
  SST_NO_DATA_TO_RAMP_DISTANCE < NO_DATA_DISTANCE;

/**
 * Whether a sampled colour is close enough to SST no-data black that it must
 * not be inverted into a temperature. Reported for provenance and testing;
 * the sampler enforces the same separation through the distance above.
 */
export function isSstNoDataColor(rgb: Rgb): boolean {
  return (
    colorDistance(rgb, SST_NO_DATA_RGB) <=
    SST_NO_DATA_TO_RAMP_DISTANCE - SST_MAX_INVERSION_DISTANCE
  );
}

/** Euclidean RGB distance, matching the sampler's own inversion metric. */
export function colorDistance(a: Rgb, b: Rgb): number {
  return Math.hypot(a.r - b.r, a.g - b.g, a.b - b.b);
}
