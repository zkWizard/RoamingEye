import { COLORMAP_DOCS } from "./colormap";

/**
 * How NASA's published land-surface-temperature colormap bounds a decoded
 * value, for every surface that renders one.
 *
 * This is the LST counterpart of `sstRampCensoring` and exists for the same
 * reason: the ramp's terminal bins are the app's, not the product's, and two
 * separate surfaces — the place panel's LST card and the probe's status line —
 * must classify a decoded kelvin identically or they will disagree about the
 * same pixel. It is a leaf: it knows the published ramp and nothing about
 * either surface.
 */

/** Native product unit. Kelvin is what MOD11C3 stores and what is exported. */
export const LAND_SURFACE_TEMPERATURE_NATIVE_UNIT = "K";

/**
 * The published LST ramp's terminal bins, read from the live
 * `MODIS_Land_Surface_Temp` document on 2026-08-15.
 *
 * GIBS renders the layer on a closed 200.0–350.0 K legend and then closes it at
 * *both* ends with an open catch-all: one colour for every land surface below
 * 200.0 K, one for every surface at or above 350.0 K. Unlike the MERRA-2
 * air-temperature caps — which sit 74–77 RGB units from the ramp and are
 * therefore rejected outright, emptying a record (see atmosphereProbeDomain) —
 * these two cap colours sit just 4 and 3 RGB units from their adjacent finite
 * bins. They are inside the 60-unit `NO_DATA_DISTANCE`, so a capped pixel does
 * not empty a record: it *decodes*, into the terminal bin next to it. That is a
 * censoring, exactly as `sstRampCensoring` describes for the marine ramp, and
 * it is why no surface may treat a terminal-bin value as a plain measurement.
 *
 * The consequence is a genuine ambiguity, not added doubt: a decoded 349.7 K is
 * indistinguishable from a true 349.7 K surface and from any surface at or
 * above 350.0 K, because the ramp paints them the same colour. Such a value is
 * reported as a one-sided bound. Values inside the finite ramp are returned
 * unqualified.
 *
 * Both caps are physically reachable for a monthly clear-sky daytime composite
 * — East Antarctic plateau winter runs below 200 K (−73.15 °C), and the hottest
 * desert surfaces approach the upper cap at midday — so neither end is treated
 * as model fill and neither is assumed to be the one a given record hit.
 */
export const LST_PUBLISHED_RAMP = {
  colormapDoc: COLORMAP_DOCS.lst,
  unit: LAND_SURFACE_TEMPERATURE_NATIVE_UNIT,
  /** Lowest finite bin: [200.00, 200.60). Anything colder shares one colour. */
  floorBin: { lo: 200, hi: 200.6 },
  /** Highest finite bin: [349.40, 350.00). Anything hotter shares one colour. */
  ceilingBin: { lo: 349.4, hi: 350 },
} as const;

/**
 * Which way a censored land-surface temperature can be wrong. "upper" means the
 * true surface is at or below the decoded value; "lower" means at or above it.
 * Null when the decoded value sits inside the finite ramp.
 */
export type LstBoundDirection = "upper" | "lower" | null;

/**
 * Classify a decoded native-kelvin LST against the published ramp's terminal
 * bins.
 *
 * The direction is safe for a boundary MEAN as well as a single pixel: a capped
 * cold pixel always decodes warmer than it truly was, so a boundary mean
 * sitting in the floor bin can only overstate the true mean, and symmetrically
 * at the ceiling. This never estimates the value behind a cap — that
 * information is gone from the imagery — it only names which side of the
 * decoded number the truth lies on.
 */
export function lstRampBoundDirection(
  kelvin: number | null
): LstBoundDirection {
  if (kelvin === null || !Number.isFinite(kelvin)) return null;
  if (kelvin <= LST_PUBLISHED_RAMP.floorBin.hi) return "upper";
  if (kelvin >= LST_PUBLISHED_RAMP.ceilingBin.lo) return "lower";
  return null;
}

/** "≤ " / "≥ " / "" — the prefix a bounded reading is rendered with. */
export function lstBoundPrefix(direction: LstBoundDirection): string {
  return direction === "upper" ? "≤ " : direction === "lower" ? "≥ " : "";
}
