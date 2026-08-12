import { describe, it, expect } from "vitest";
import {
  colormapUrl,
  linearityDeviation,
  parseColormap,
  parseColormapEntries,
} from "../src/lib/colormap";
import {
  buildColormapLut,
  invertColormap,
  PROBE_SCALES,
} from "../src/lib/probe";
import { LEGENDS, type GradientLegendSpec } from "../src/lib/legend";
import {
  MEASURED_VEGETATION_RAMP,
  VEGETATION_INDEX_COLORMAP_DOCS,
  type VegetationIndexId,
} from "../src/lib/vegetationIndexRamp";

/**
 * Vegetation-index ramp contract: re-measure NDVI and EVI against the live
 * GIBS colormaps and assert the committed fidelity figures still hold.
 *
 * The calibrated layers get this treatment already (inversion-validation,
 * probe-scales). The vegetation indices are deliberately *not* calibrated —
 * their ramps are non-linear — so they fall through both suites, and the
 * documented consequence of that non-linearity had nothing keeping it true.
 * This closes the gap: a GIBS palette re-render or a legend edit that changes
 * the deviation or the inversion bias fails CI naming the index, so
 * vegetationIndexRamp's pinned numbers get re-measured rather than rotting.
 *
 * Network-touching by design; runs weekly via catalog-check.yml with the other
 * contract suites.
 */

async function fetchColormap(doc: string): Promise<string> {
  const url = colormapUrl(doc);
  for (let attempt = 0; ; attempt++) {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
      return await res.text();
    } catch (err) {
      if (attempt >= 1) throw err;
      await new Promise((r) => setTimeout(r, 5000));
    }
  }
}

/**
 * The production inversion path for an uncalibrated gradient layer: legend LUT
 * → 0..1 position → linear map onto the layer's scale. Mirrors
 * validation.validateInversion, which is typed to the calibrated layers only.
 */
function measure(
  index: VegetationIndexId,
  xml: string
): { rmse: number; bias: number; recovered: number; total: number } {
  const entries = parseColormapEntries(xml);
  const spec = LEGENDS[index] as GradientLegendSpec;
  const lut = buildColormapLut(spec.stops);
  const scale = PROBE_SCALES[index];
  const span = scale.max - scale.min;

  const errors: number[] = [];
  for (const entry of entries) {
    const pos = invertColormap(entry.rgb, lut);
    if (pos === null) continue;
    errors.push(scale.min + pos * span - entry.value);
  }
  const n = errors.length;
  return {
    rmse: Math.sqrt(errors.reduce((s, e) => s + e * e, 0) / n),
    bias: errors.reduce((s, e) => s + e, 0) / n,
    recovered: n,
    total: entries.length,
  };
}

describe("vegetation-index legend ↔ GIBS ramp (live fidelity)", () => {
  for (const [index, doc] of Object.entries(VEGETATION_INDEX_COLORMAP_DOCS) as [
    VegetationIndexId,
    string,
  ][]) {
    it(`${index}: live ${doc} ramp still matches the committed fidelity`, async () => {
      const xml = await fetchColormap(doc);
      const ramp = parseColormap(xml);
      const ref = MEASURED_VEGETATION_RAMP[index];

      expect(ramp.bins.length, `${doc} has a continuous ramp`).toBe(
        ref.totalSteps
      );

      // The end labels the legend prints are only exact while the ramp spans
      // the pinned scale exactly.
      expect(ramp.bins[0].lo, `${index} ramp minimum`).toBeCloseTo(
        PROBE_SCALES[index].min,
        6
      );
      expect(
        ramp.bins[ramp.bins.length - 1].hi,
        `${index} ramp maximum`
      ).toBeCloseTo(PROBE_SCALES[index].max, 6);

      // Non-linearity is the whole reason these layers are uncalibrated. A
      // re-render that made the ramp linear would be good news — and would
      // still fail here, so the module's claims get revisited either way.
      expect(
        linearityDeviation(ramp.bins),
        `${index} ramp linearity drifted from ${ref.linearityDeviation} (update vegetationIndexRamp)`
      ).toBeCloseTo(ref.linearityDeviation, 2);

      const live = measure(index, xml);
      expect(live.total, `${index} entry count`).toBe(ref.totalSteps);
      expect(
        Math.abs(live.recovered - ref.recoveredSteps),
        `${index} recovery drifted: ${ref.recoveredSteps} → ${live.recovered}`
      ).toBeLessThanOrEqual(Math.max(3, ref.totalSteps * 0.05));

      // ±20% around the committed figures, matching the inversion-validation
      // contract's tolerance.
      expect(
        Math.abs(live.rmse - ref.rmse) / ref.rmse,
        `${index} inversion RMSE drifted: ${ref.rmse} → ${live.rmse.toFixed(3)}`
      ).toBeLessThan(0.2);
      expect(
        Math.abs(live.bias - ref.bias) / Math.abs(ref.bias),
        `${index} inversion bias drifted: ${ref.bias} → ${live.bias.toFixed(3)}`
      ).toBeLessThan(0.2);
      // The direction is the part the UI copy asserts.
      expect(
        Math.sign(live.bias),
        `${index} bias changed sign; the "reads greener" claim no longer holds`
      ).toBe(Math.sign(ref.bias));
    });
  }
});
