import { describe, it, expect } from "vitest";
import {
  COLORMAP_DOCS,
  colormapUrl,
  parseColormap,
  linearityDeviation,
  SCALE_CONVERSIONS,
  MAX_LINEARITY_DEVIATION,
  type CalibratedLayerId,
} from "../src/lib/colormap";
import { PROBE_SCALES } from "../src/lib/probe";
import { MEASURED_VEGETATION_RAMP } from "../src/lib/vegetationIndexRamp";

/**
 * Probe-scale contract check: the physical ranges PROBE_SCALES pins were
 * derived from GIBS's live colormap documents (2026-07-09). GIBS can
 * re-render a palette — new range, new units, a non-linear ramp — and every
 * probe value would silently mis-scale. This re-derives each calibrated
 * layer's scale from the live XML and fails naming the layer and the drift.
 *
 * NDVI is the exception to the linear-ramp ceiling. GIBS spaces
 * MODIS_L3_NDVI unevenly (0.005-wide bins below 0.3, then 0.0075, then
 * 0.01), a deviation of 0.129 of span. The legend stops sit on that ramp's
 * value fractions, so the linear position-to-value step still recovers all
 * 140 published colours (RMSE 0.024). Requiring deviation under 0.02 here
 * rejects that real shape. This check pins NDVI to the deviation
 * vegetationIndexRamp already commits, and the vegetation-index contract
 * re-measures the inversion. A palette that actually moved still fails.
 *
 * Network-touching by design; runs weekly via catalog-check.yml alongside
 * the catalog contract (same npm run test:contract).
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

describe("GIBS colormap ↔ PROBE_SCALES contract", () => {
  for (const [id, doc] of Object.entries(COLORMAP_DOCS) as [
    CalibratedLayerId,
    string,
  ][]) {
    it(`${id}: live ${doc} colormap still matches the pinned scale`, async () => {
      const ramp = parseColormap(await fetchColormap(doc));
      expect(ramp.bins.length, `${doc} has a continuous ramp`).toBeGreaterThan(
        10
      );

      const conv = SCALE_CONVERSIONS[id];
      const factor = conv?.factor ?? 1;
      const liveMin = ramp.bins[0].lo * factor;
      const liveMax = ramp.bins[ramp.bins.length - 1].hi * factor;
      const scale = PROBE_SCALES[id];

      // Range: exact at the precision the legend prints.
      expect(liveMin, `${id} scale minimum`).toBeCloseTo(scale.min, 6);
      expect(liveMax, `${id} scale maximum`).toBeCloseTo(scale.max, 6);

      // Units: what we display must be GIBS's declaration (or our pinned
      // conversion of it).
      if (conv) {
        expect(scale.unit).toBe(conv.unit);
      } else {
        expect(scale.unit, `${id} unit`).toBe(ramp.units);
      }

      // Linearity: the probe maps ramp position to value linearly. That is
      // honest for a uniform ramp, and for NDVI because its stops are placed
      // at the ramp's value fractions rather than at uniform bin indexes.
      const deviation = linearityDeviation(ramp.bins);
      if (id === "ndvi") {
        const pinned = MEASURED_VEGETATION_RAMP.ndvi.linearityDeviation;
        expect(
          deviation,
          `${id} ramp linearity drifted from the value-fraction legend pin ` +
            `${pinned} (update the NDVI legend and vegetationIndexRamp)`
        ).toBeCloseTo(pinned, 2);
      } else {
        expect(deviation, `${id} ramp linear-in-value`).toBeLessThan(
          MAX_LINEARITY_DEVIATION
        );
      }
    });
  }
});
