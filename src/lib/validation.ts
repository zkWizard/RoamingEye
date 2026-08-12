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
 * colormaps; precipitation, air temperature, and SST re-measured 2026-08-11,
 * soil moisture 2026-08-12).
 * The contract test re-measures and asserts the live numbers still match these
 * within tolerance — so the published accuracy figures in docs/validation.md
 * and METHODS.md stay true, and any drift (a GIBS palette change, a legend
 * edit) fails CI naming the layer.
 *
 * These are sobering by design, and the spread tracks one thing: whether the
 * layer's legend was drawn from the colormap GIBS renders with. Every dynamic
 * layer's now is (precipitation, RMSE 0.27 mm/day over the whole ramp; 2 m air
 * temperature, 0.485 K; SST, 1.0 °C; soil moisture, 0.23 kg/m²; aerosol, 0.13);
 * only LST's gradient still misses GIBS's cold-end hues entirely (all-null).
 * Relative analysis (trends, anomalies, seasonality — scale-monotone-robust)
 * was reliable even before the recalibrations; rebuilding LST's gradient from
 * the real GIBS colormap is tracked as follow-up (#170).
 *
 * NDVI shows what a *banded* null-rate used to cost: its legend stops are now
 * sampled from MODIS_L3_NDVI instead of drawn by hand, and every one of GIBS's
 * 140 ramp colours inverts (RMSE 0.024 on a 0–1 index). The hand-drawn ramp
 * rejected 32 colours in three contiguous blocks (NDVI ≤ 0.09, 0.41–0.46,
 * ≥ 0.94), so sparse vegetation and closed canopy were dropped from every
 * mean, trend, and percentile rather than merely measured imprecisely.
 *
 * `total` is the number of ramp colours the layer's colormap actually offers,
 * so it is the denominator that makes `nulls` a coverage figure. Air
 * temperature's was re-measured 2026-08-11 at 180 (was 90): GIBS prints that
 * ramp's tooltips rounded to whole kelvin while the ramp itself steps 0.5 K,
 * and the parser had been discarding every entry whose printed range collapsed
 * to zero width — half the ramp had never been presented to the inversion at
 * all. See `parseColormapEntries`.
=======
 * These are sobering by design: inversion through our coarse legend gradients
 * recovers aerosol well (RMSE 0.13) but temperature, precipitation, and soil
 * only loosely, and LST's gradient misses GIBS's cold-end hues entirely
 * (all-null). The probe is reliable for *relative* analysis on these layers
 * (trends, anomalies, seasonality — scale-monotone-robust), not absolute
 * values. Tightening this by inverting against the real GIBS colormaps is
 * tracked as follow-up (#170).
 *
 * NDVI is the worked example of that follow-up: its legend stops are sampled
 * from MODIS_L3_NDVI instead of drawn by hand, and every one of GIBS's 140
 * ramp colours now inverts (RMSE 0.024 on a 0–1 index). Note what a *banded*
 * null-rate costs — the hand-drawn ramp rejected 32 colours in three
 * contiguous blocks (NDVI ≤ 0.09, 0.41–0.46, ≥ 0.94), so sparse vegetation
 * and closed canopy were dropped from every mean, trend, and percentile
 * rather than merely measured imprecisely.
>>>>>>> 274230125bcc4d4bb8b26137a76ef0a751aeaab7
 */
export const MEASURED_INVERSION: Record<
  CalibratedLayerId,
  { rmse: number | null; nulls: number; total: number }
> = {
  ndvi: { rmse: 0.0236, nulls: 0, total: 140 },
  lst: { rmse: null, nulls: 250, total: 250 },
  // Re-measured against the parser-restored 180-entry ramp with the legend
  // rebuilt from GIBS's own stops (#717 + #758 combined).
  airtemp: { rmse: 0.485, nulls: 0, total: 180 },
  sst: { rmse: 1.0, nulls: 0, total: 213 },
  // Re-measured 2026-08-11 after the precip legend was rebuilt from GIBS's own
  // ramp (was rmse 20.36 / nulls 23, when the hand-drawn tan → blue gradient
  // sent mid-range rates to the dry end).
  precip: { rmse: 0.27, nulls: 0, total: 50 },
  soil: { rmse: 0.23, nulls: 0, total: 50 },
  aerosol: { rmse: 0.13, nulls: 0, total: 180 },
};
