import { COLORMAP_DOCS, type ColormapEntry } from "./colormap";
import { NO_DATA_DISTANCE, type Rgb } from "./probe";

/**
 * Open-ended ramp ends on the two GLDAS water-cycle layers, and the
 * value-dependent missingness they cause (hydrology).
 *
 * The place panel reads rainfall and soil moisture through NASA's *own*
 * colormap document rather than the hand-drawn display legend: `loadPlaceColormap`
 * (placeInsights.ts) fetches the XML, `parseColormapEntries` (colormap.ts) pairs
 * each continuous-legend swatch with its value, and `invertColormapEntries`
 * (probe.ts) matches a sampled pixel to the nearest of those entries, rejecting
 * anything further than `NO_DATA_DISTANCE` as no-data.
 *
 * Both GLDAS documents publish 52 ramp swatches, but two of them are *open-ended*
 * catch-alls with no finite range — a sub-zero cap ("< 0") and a saturating top
 * cap ("≥ 5.0e-04", "≥ 50.0"). `parseColormapEntries` matches only the "lo – hi"
 * tooltip shape, so it retains 50 and drops both caps, by documented design.
 * Measured against the live documents (2026-08-11), each dropped cap colour then
 * sits *further* from every retained entry than the no-data cap allows — 83.2 for
 * the sub-zero cap and 76.9 for the top cap, against a cap of 60 — so a pixel
 * painted with either one inverts to `null`.
 *
 * For the sub-zero cap that outcome is right: negative precipitation and negative
 * column water are physically impossible, so such a pixel is model fill, not a
 * measurement. For the top cap it is a real defect, and the reason this module
 * exists. That cap is not a gap — it is a *lower bound*, and it sits at the wet
 * end of the ramp:
 *
 *  - precipitation, ≥ 5.0e-04 kg/m²/s ≡ ≥ 43.2 mm/day of monthly-mean rate,
 *    reachable in the wettest monsoon and tropical-orographic cells;
 *  - soil moisture, ≥ 50 kg/m² over the 0-10 cm layer GIBS's `ows:Title`
 *    names ≡ ≥ 0.50 m³/m³ volumetric, at or above the porosity of most mineral
 *    soils, so it is reached only in near-saturated, organic, or ponded cells.
 *
 * Discarding those pixels is therefore *value-dependent* missingness, not random
 * gap-filling: the samples removed from a footprint are exactly its wettest ones.
 * Every statistic built on the survivors — the area mean, and any percentile,
 * record margin, accumulation, or index computed downstream from it — is a lower
 * bound on wetness wherever the ramp saturates, and the reported `validFraction`
 * cannot distinguish saturation from cloud, ocean, or an unpublished month.
 *
 * This module is a descriptor, not a repair. It names which of the four things a
 * sampled colour is, and quantifies how much of a footprint saturated, so a
 * caller can say so instead of presenting a silently dry-biased mean. It never
 * invents a value for a saturated pixel, never estimates how far beyond the bound
 * the true value lies, and never infers a condition, drought or flood state,
 * runoff, water-balance closure, cause, or any future value. Restoring the caps
 * as explicit bounds in the inversion itself is the follow-up fix and needs a
 * ruling on how a one-sided reading should surface in the readout.
 *
 * Pure, render-free logic (see gldasRampSaturation.test.ts). Provenance is the
 * GIBS colormap document named per layer; the cited dataset is unchanged.
 */

/** The two Water-category layers this module characterizes. */
export type GldasRampLayerId = "precip" | "soil";

/** One open-ended catch-all swatch at an end of a GLDAS ramp. */
export interface GldasRampTerminal {
  /** The RGB GIBS paints this open-ended bin with. */
  rgb: Rgb;
  /** The bin's one finite edge, in the layer's native unit. */
  boundNative: number;
  /** The same edge in the unit the probe reports (`SCALE_CONVERSIONS`). */
  boundReported: number;
  /** The tooltip GIBS prints for the bin, verbatim after entity decoding. */
  publishedLabel: string;
}

/** Verified structure of one GLDAS ramp's ends. */
export interface GldasRampSaturationFacts {
  layerId: GldasRampLayerId;
  /** GIBS colormap document the facts were read from. */
  colormapDocument: string;
  nativeUnit: string;
  reportedUnit: string;
  /** Swatches the document publishes on the continuous legend. */
  publishedSwatchCount: number;
  /** Swatches `parseColormapEntries` retains (the finite "lo – hi" ones). */
  retainedSwatchCount: number;
  /**
   * Outer edges of the retained, closed part of the ramp in the reported unit —
   * the representable window `PROBE_SCALES` pins for this layer.
   */
  closedSpanReported: { min: number; max: number };
  /** The "< 0" cap: physically impossible for either quantity, so model fill. */
  belowZeroFill: GldasRampTerminal;
  /** The saturating top cap: a lower bound on the value, never a measurement. */
  ceiling: GldasRampTerminal;
}

/**
 * Read from the live GIBS colormap documents on 2026-08-11. Both water-cycle
 * ramps share a palette, so the two cap colours are identical across layers;
 * only the bounds differ. The contract check re-derives these from the live XML.
 */
export const GLDAS_RAMP_SATURATION: Record<
  GldasRampLayerId,
  GldasRampSaturationFacts
> = {
  precip: {
    layerId: "precip",
    colormapDocument: COLORMAP_DOCS.precip,
    nativeUnit: "kg/m²/s",
    reportedUnit: "mm/day",
    publishedSwatchCount: 52,
    retainedSwatchCount: 50,
    closedSpanReported: { min: 0, max: 43.2 },
    belowZeroFill: {
      rgb: { r: 158, g: 1, b: 66 },
      boundNative: 0,
      boundReported: 0,
      publishedLabel: "< 0.0e+00",
    },
    ceiling: {
      rgb: { r: 94, g: 79, b: 162 },
      boundNative: 5.0e-4,
      boundReported: 43.2,
      publishedLabel: "≥ 5.0e-04",
    },
  },
  soil: {
    layerId: "soil",
    colormapDocument: COLORMAP_DOCS.soil,
    nativeUnit: "kg/m²",
    reportedUnit: "kg/m²",
    publishedSwatchCount: 52,
    retainedSwatchCount: 50,
    closedSpanReported: { min: 0, max: 50 },
    belowZeroFill: {
      rgb: { r: 158, g: 1, b: 66 },
      boundNative: 0,
      boundReported: 0,
      publishedLabel: "< 0.0",
    },
    ceiling: {
      rgb: { r: 94, g: 79, b: 162 },
      boundNative: 50,
      boundReported: 50,
      publishedLabel: "≥ 50.0",
    },
  },
};

/**
 * What a sampled colour is, on a GLDAS water-cycle ramp.
 *
 * `invertColormapEntries` collapses the last three of these into one `null`,
 * which is what makes a saturated footprint indistinguishable from a cloudy one.
 */
export type GldasRampSamplePosition =
  /** Matched a retained, finite bin: a two-sided measurement. */
  | "interior"
  /** The saturating top cap: the value is at or above `ceiling.bound*`. */
  | "at-or-above-ceiling"
  /** The "< 0" cap: physically impossible, so model fill, not a measurement. */
  | "below-zero-fill"
  /** Off the ramp entirely: ocean, background, an unpublished month, a gap. */
  | "off-ramp";

export const GLDAS_RAMP_SATURATION_LIMITATIONS = [
  "Positions are read from NASA's own GIBS colormap document for the layer, not from the display legend; the cited dataset is unchanged.",
  "A ceiling sample is a one-sided lower bound — the value is at or above the bound, by an amount the rendered image cannot resolve. It is never reported as a measurement and never extrapolated.",
  "A below-zero sample is model fill: negative precipitation rate and negative column water are physically impossible, so it carries no value.",
  "Because the discarded cap sits at the wet end of the ramp, dropping ceiling samples removes a footprint's wettest pixels; a mean over the survivors is a lower bound on wetness, not an unbiased estimate.",
  "validFraction alone cannot separate ramp saturation from cloud, ocean, or an unpublished month; this descriptor is what distinguishes them.",
  "The descriptor reports representability structure only; it never infers a condition, drought or flood state, runoff, recharge, water-balance closure, cause, or any future value.",
] as const;

/**
 * Classify one sampled colour against a GLDAS water-cycle ramp.
 *
 * `entries` are the retained, finite swatches the caller already loaded for this
 * layer (`loadPlaceColormap(...).entries`), so the classification matches the
 * exact table the inversion uses. A cap is reported only when its colour is
 * strictly nearer than every retained swatch *and* within `maxDistance` — the
 * same tolerance the inversion applies — so ordinary JPEG noise on a neighbouring
 * swatch is never promoted to a saturation claim.
 */
export function classifyGldasRampSample(
  layerId: GldasRampLayerId,
  rgb: Rgb,
  entries: readonly ColormapEntry[],
  maxDistance: number = NO_DATA_DISTANCE
): GldasRampSamplePosition {
  const facts = GLDAS_RAMP_SATURATION[layerId];
  const nearestRetained = entries.reduce(
    (best, entry) => Math.min(best, rgbDistance(rgb, entry.rgb)),
    Infinity
  );
  const toCeiling = rgbDistance(rgb, facts.ceiling.rgb);
  const toFill = rgbDistance(rgb, facts.belowZeroFill.rgb);

  if (toCeiling <= maxDistance && toCeiling < nearestRetained) {
    return "at-or-above-ceiling";
  }
  if (toFill <= maxDistance && toFill < nearestRetained) {
    return "below-zero-fill";
  }
  return nearestRetained <= maxDistance ? "interior" : "off-ramp";
}

/** Euclidean RGB distance — the metric `invertColormapEntries` matches on. */
function rgbDistance(a: Rgb, b: Rgb): number {
  return Math.hypot(a.r - b.r, a.g - b.g, a.b - b.b);
}

export interface GldasRampSaturationSummary {
  kind: "gldas-ramp-saturation";
  /** Explicitly prevents consumers from treating this as a forecast. */
  isForecast: false;
  layerId: GldasRampLayerId;
  /** Samples supplied, whatever their position. */
  consideredSamples: number;
  interiorCount: number;
  ceilingCount: number;
  belowZeroFillCount: number;
  offRampCount: number;
  /**
   * Share of the *valued* samples (interior + ceiling) that saturated at the top
   * cap. Null when no sample carried a value at all, which is not zero
   * saturation — it is no basis to state a share.
   */
  saturatedFraction: number | null;
  /**
   * True when at least one ceiling sample was dropped, so a mean over the
   * interior samples understates the footprint's wetness by an unstated amount.
   */
  meanIsDryBiased: boolean;
  /** The bound saturated samples are at or above, in the reported unit. */
  ceilingBoundReported: number;
  reportedUnit: string;
  /** GIBS colormap document the ramp structure came from. */
  colormapDocument: string;
  /** Honest one-line statement; carries no condition or value claim. */
  statement: string;
  limits: readonly string[];
}

/**
 * Tally classified samples from one footprint into an honest saturation summary.
 *
 * The input is the per-sample positions, in any order — this reduces them, it
 * does not re-sample. `meanIsDryBiased` is the load-bearing output: it is the
 * one bit a caller needs before presenting an area mean as a measurement.
 */
export function summarizeGldasRampSaturation(
  layerId: GldasRampLayerId,
  positions: readonly GldasRampSamplePosition[]
): GldasRampSaturationSummary {
  const facts = GLDAS_RAMP_SATURATION[layerId];
  const count = (want: GldasRampSamplePosition) =>
    positions.reduce((n, position) => (position === want ? n + 1 : n), 0);

  const interiorCount = count("interior");
  const ceilingCount = count("at-or-above-ceiling");
  const belowZeroFillCount = count("below-zero-fill");
  const offRampCount = count("off-ramp");
  const valued = interiorCount + ceilingCount;

  return {
    kind: "gldas-ramp-saturation",
    isForecast: false,
    layerId,
    consideredSamples: positions.length,
    interiorCount,
    ceilingCount,
    belowZeroFillCount,
    offRampCount,
    saturatedFraction: valued === 0 ? null : ceilingCount / valued,
    meanIsDryBiased: ceilingCount > 0,
    ceilingBoundReported: facts.ceiling.boundReported,
    reportedUnit: facts.reportedUnit,
    colormapDocument: facts.colormapDocument,
    statement: saturationStatement(
      facts,
      positions.length,
      interiorCount,
      ceilingCount,
      belowZeroFillCount
    ),
    limits: GLDAS_RAMP_SATURATION_LIMITATIONS,
  };
}

/**
 * The place panel's clause for a saturated footprint — silent by default.
 *
 * Returns "" whenever nothing saturated, so an ordinary reading is unchanged
 * and the card gains a sentence only where one is load-bearing. Where the cap
 * did take samples it states the three things the card cannot otherwise carry:
 * how many cells were dropped, that the cap is a one-sided bound, and that the
 * mean shown is therefore a floor rather than an estimate. It names no
 * condition — a saturated cell is ground wetter than the ramp can resolve, not
 * a flood, and this never says otherwise.
 *
 * `null`/`undefined` means the caller had no colours to classify at all (a
 * month whose imagery never loaded), which is not "nothing saturated"; it gets
 * no clause rather than a reassuring one.
 */
export function gldasRampSaturationNote(
  summary: GldasRampSaturationSummary | null | undefined
): string {
  if (!summary || summary.ceilingCount === 0) return "";
  const bound = `${summary.ceilingBoundReported} ${summary.reportedUnit}`;
  const mean =
    summary.interiorCount === 0
      ? "no unsaturated cell remained to average"
      : `the mean over the remaining ${summary.interiorCount} is a lower bound, not an estimate`;
  return `; ${summary.ceilingCount} of ${summary.consideredSamples} sampled cells sat at the ${bound} legend cap, where the value is known only to be at or above the cap, so ${mean}`;
}

/**
 * How a saturated month's recorded value must be read in the downloaded record.
 *
 * The place export already carries a per-observation `valueBound`, and its own
 * limitations define an absent one as an observation that was *not assessed*
 * for a bound — deliberately not as one whose value resolved. For the two GLDAS
 * water-cycle layers that statement was untrue: the panel classifies both
 * sampled months against the published colormap (it must, because the censored
 * *difference* clause needs each endpoint), so every exported month had been
 * assessed, on these exact values, for the card — and still left the file with
 * `valueBound: null`. The layer-level `legendCapCensoring` tally names a single
 * `assessedDataMonth`, so it can only ever speak for the month the card leads
 * with; the earlier month's mean travelled as a plain number with nothing
 * marking it at all. SST and column AOD already mark their capped months this
 * way (`sstPlaceObservationFromSample`, `aerosolPlaceObservationFromSample`);
 * these two did not.
 *
 * Only the top cap censors these ramps. Their low end is closed at 0 and the
 * "< 0" bin is model fill rather than a measurement (see the module comment),
 * so the one direction a capped month can be wrong in is upward.
 *
 * The number is unchanged. This marks how to read it, never re-estimates it,
 * never guesses how far past the cap the true value lies, and names no
 * condition — a saturated cell is ground wetter than the ramp can resolve, not
 * a flood or a drought. `null` is returned when nothing saturated, when the
 * caller had no colours to classify, and when the month carries no value at
 * all: the export forbids bounding an absent value, and a bound on nothing
 * would imply a number the file does not hold.
 */
export function gldasCensoredObservationBound(
  summary: GldasRampSaturationSummary | null | undefined,
  value: number | null | undefined
): "at-or-above" | null {
  if (!summary || summary.ceilingCount === 0) return null;
  return value === null || value === undefined ? null : "at-or-above";
}

function saturationStatement(
  facts: GldasRampSaturationFacts,
  considered: number,
  interiorCount: number,
  ceilingCount: number,
  belowZeroFillCount: number
): string {
  if (considered === 0) {
    return `No ${facts.layerId} samples supplied; ramp saturation cannot be assessed.`;
  }
  const bound = `${facts.ceiling.boundReported} ${facts.reportedUnit}`;
  const fill = belowZeroFillCount
    ? ` ${belowZeroFillCount} sat on the sub-zero fill cap, which carries no value.`
    : "";
  if (ceilingCount === 0) {
    return `${interiorCount} of ${considered} ${facts.layerId} samples resolved inside the legend's representable range and none saturated at the ${bound} cap.${fill}`;
  }
  return `${ceilingCount} of ${considered} ${facts.layerId} samples saturated at the legend's ${bound} cap, where the value is a lower bound rather than a measurement; a mean over the remaining ${interiorCount} understates the footprint's wetness by an unstated amount.${fill}`;
}
