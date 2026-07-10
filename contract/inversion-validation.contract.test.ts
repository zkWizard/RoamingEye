import { describe, it, expect } from "vitest";
import {
  COLORMAP_DOCS,
  colormapUrl,
  parseColormapEntries,
} from "../src/lib/colormap";
import { validateInversion, MEASURED_INVERSION } from "../src/lib/validation";
import type { CalibratedLayerId } from "../src/lib/colormap";

/**
 * Inversion-validation contract: re-measure the probe's colormap-inversion
 * accuracy against the live GIBS colormaps and assert the numbers still match
 * the committed figures (validation.MEASURED_INVERSION, published in
 * docs/validation.md and METHODS.md) within tolerance. This keeps the tool's
 * stated accuracy honest over time — a GIBS palette re-render or a legend
 * edit that changes the residuals fails CI, naming the layer, so the docs get
 * updated rather than silently going stale.
 *
 * Network-touching; runs weekly via catalog-check.yml.
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

describe("probe inversion ↔ GIBS colormap (live accuracy)", () => {
  for (const [layer, doc] of Object.entries(COLORMAP_DOCS) as [
    CalibratedLayerId,
    string,
  ][]) {
    it(`${layer}: live inversion accuracy still matches the committed figure`, async () => {
      const entries = parseColormapEntries(await fetchColormap(doc));
      expect(
        entries.length,
        `${doc} has continuous legend entries`
      ).toBeGreaterThan(10);
      const live = validateInversion(layer, entries);
      const ref = MEASURED_INVERSION[layer];

      // Entry count and null-rate are stable properties of the palette vs our
      // gradient; a big move means the colormap changed shape.
      expect(live.total, `${layer} entry count`).toBe(ref.total);
      expect(
        Math.abs(live.nulls - ref.nulls),
        `${layer} null-rate drifted: ${ref.nulls} → ${live.nulls}`
      ).toBeLessThanOrEqual(Math.max(3, ref.total * 0.05));

      if (ref.rmse === null) {
        expect(
          live.rmse,
          `${layer} was all-null; now recovers values`
        ).toBeNull();
      } else {
        expect(live.rmse, `${layer} RMSE regressed to no-data`).not.toBeNull();
        // ±20% band around the committed RMSE: catches a real accuracy shift
        // without flaking on floating-point noise.
        expect(
          Math.abs(live.rmse! - ref.rmse) / ref.rmse,
          `${layer} inversion RMSE drifted: ${ref.rmse} → ${live.rmse?.toFixed(2)} (update docs/validation.md)`
        ).toBeLessThan(0.2);
      }
    });
  }
});
