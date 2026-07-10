import { buildColormapLut, invertColormap } from "./probe";
import { LEGENDS, type GradientLegendSpec } from "./legend";
import { PROBE_SCALES } from "./probe";
import { SCALE_CONVERSIONS, type CalibratedLayerId } from "./colormap";
import type { ColormapEntry } from "./colormap";

/**
 * End-to-end validation of the probe's colormap inversion against GIBS's
 * authoritative colormap.
 *
 * The probe reconstructs a physical value by inverting a sampled RGB through
 * our *approximate* legend gradient (a handful of stops) and mapping the
 * position onto the layer's scale. GIBS's colormap document is the ground
 * truth for "what value does this color mean". So: feed each GIBS ramp
 * colour through our production inversion and compare the recovered value to
 * the true one. The residuals are the real accuracy of the probe pipeline.
 *
 * This validates *inversion vs the colormap*, the tightest reference available
 * client-side. It does NOT validate GIBS's underlying L3 product against
 * in-situ measurements — that is the product teams' published validation,
 * which we cite. See METHODS.md and docs/validation.md.
 *
 * Pure and offline-testable; the live-XML run is the weekly contract test.
 */

export interface InversionStats {
  /** RMSE of recovered − true, in the layer's physical units (null if n=0). */
  rmse: number | null;
  /** Mean signed error (bias), same units (null if n=0). */
  bias: number | null;
  /** 95th percentile of |error| (null if n=0). */
  p95: number | null;
  /** Colours that inverted to a value. */
  n: number;
  /** Colours our gradient rejected as no-data (distance > threshold). */
  nulls: number;
  /** Total colormap entries considered. */
  total: number;
}

/**
 * Inversion error stats for one layer: run GIBS's colormap entries through
 * our legend LUT and the layer's scale, compare to truth (with the layer's
 * unit conversion applied so both sides are in the reported units).
 */
export function validateInversion(
  layer: CalibratedLayerId,
  entries: ColormapEntry[]
): InversionStats {
  const spec = LEGENDS[layer];
  if (spec.kind === "classes") {
    return { rmse: null, bias: null, p95: null, n: 0, nulls: 0, total: 0 };
  }
  const lut = buildColormapLut((spec as GradientLegendSpec).stops);
  const scale = PROBE_SCALES[layer];
  const span = scale.max - scale.min;
  const factor = SCALE_CONVERSIONS[layer]?.factor ?? 1;

  const errors: number[] = [];
  let nulls = 0;
  for (const entry of entries) {
    const truth = entry.value * factor;
    const pos = invertColormap(entry.rgb, lut);
    if (pos === null) {
      nulls++;
      continue;
    }
    errors.push(scale.min + pos * span - truth);
  }
  const n = errors.length;
  if (n === 0) {
    return {
      rmse: null,
      bias: null,
      p95: null,
      n: 0,
      nulls,
      total: entries.length,
    };
  }
  const rmse = Math.sqrt(errors.reduce((s, e) => s + e * e, 0) / n);
  const bias = errors.reduce((s, e) => s + e, 0) / n;
  const absSorted = errors.map((e) => Math.abs(e)).sort((a, b) => a - b);
  const p95 = absSorted[Math.min(n - 1, Math.floor(0.95 * n))];
  return { rmse, bias, p95, n, nulls, total: entries.length };
}

/**
 * The committed validation figures (measured 2026-07-09 against the live
 * colormaps). The contract test re-measures and asserts the live numbers
 * still match these within tolerance — so the published accuracy figures in
 * docs/validation.md and METHODS.md stay true, and any drift (a GIBS palette
 * change, a legend edit) fails CI naming the layer.
 *
 * These are sobering by design: inversion through our coarse legend gradients
 * recovers aerosol well (RMSE 0.13) but temperature, precipitation, and soil
 * only loosely, and LST's gradient misses GIBS's cold-end hues entirely
 * (all-null). The probe is reliable for *relative* analysis on these layers
 * (trends, anomalies, seasonality — scale-monotone-robust), not absolute
 * values. Tightening this by inverting against the real GIBS colormaps is
 * tracked as follow-up (#170).
 */
export const MEASURED_INVERSION: Record<
  CalibratedLayerId,
  { rmse: number | null; nulls: number; total: number }
> = {
  lst: { rmse: null, nulls: 250, total: 250 },
  airtemp: { rmse: 18.95, nulls: 44, total: 90 },
  sst: { rmse: 5.11, nulls: 85, total: 213 },
  precip: { rmse: 20.36, nulls: 23, total: 50 },
  soil: { rmse: 8.23, nulls: 29, total: 50 },
  aerosol: { rmse: 0.13, nulls: 0, total: 180 },
};
