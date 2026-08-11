import { describe, it, expect } from "vitest";
import {
  COLORMAP_DOCS,
  colormapUrl,
  parseColormap,
  parseColormapEntries,
} from "../src/lib/colormap";
import {
  findInversionBlindSpots,
  MEASURED_BLIND_SPOTS,
} from "../src/lib/inversionBlindSpots";
import type { CalibratedLayerId } from "../src/lib/colormap";

/**
 * Inversion blind-spot contract: re-measure *where* the probe's colormap
 * inversion goes blind against the live GIBS colormaps, and assert the shape
 * still matches the committed figures (`MEASURED_BLIND_SPOTS`).
 *
 * The sibling inversion-validation contract already guards the accuracy
 * numbers. This one guards their scope: a palette re-render or a legend edit
 * that moves a blind span changes which values the probe can see at all, and
 * therefore which downstream statistics are conditioned on a censored sample.
 * That must not drift silently past the published figures.
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

describe("probe inversion blind spots ↔ GIBS colormap (live)", () => {
  for (const [layer, doc] of Object.entries(COLORMAP_DOCS) as [
    CalibratedLayerId,
    string,
  ][]) {
    it(`${layer}: live blind-spot shape still matches the committed figure`, async () => {
      const xml = await fetchColormap(doc);
      const entries = parseColormapEntries(xml);
      expect(
        entries.length,
        `${doc} has continuous legend entries`
      ).toBeGreaterThan(10);

      const live = findInversionBlindSpots(layer, entries, {
        unit: parseColormap(xml).units,
      });
      const ref = MEASURED_BLIND_SPOTS[layer];

      expect(live.total, `${layer} entry count`).toBe(ref.total);
      expect(
        live.shape,
        `${layer} blind-spot shape changed: ${ref.shape} → ${live.shape}. ${live.statement}`
      ).toBe(ref.shape);
      // The recovered count is the same quantity the accuracy contract tracks
      // as `nulls`; allow it the same small drift band before failing.
      expect(
        Math.abs(live.recovered - ref.recovered),
        `${layer} recovered count drifted: ${ref.recovered} → ${live.recovered} (update MEASURED_BLIND_SPOTS and MEASURED_INVERSION together)`
      ).toBeLessThanOrEqual(Math.max(3, ref.total * 0.05));

      if (ref.widest === null) {
        expect(live.widest, `${layer} gained a blind span`).toBeNull();
        return;
      }
      expect(live.widest, `${layer} lost its blind span`).not.toBeNull();
      const widest = live.widest!;
      expect(widest.lo, `${layer} widest span lower bound`).toBeCloseTo(
        ref.widest.lo,
        1
      );
      expect(widest.hi, `${layer} widest span upper bound`).toBeCloseTo(
        ref.widest.hi,
        1
      );
      // The unit the span is quoted in is part of the published figure: a
      // colormap that switched storage units would otherwise pass silently.
      expect(live.unit, `${layer} span unit`).toBe(ref.widest.unit);
    });
  }
});
