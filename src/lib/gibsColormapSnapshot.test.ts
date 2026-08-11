import { describe, it, expect } from "vitest";
import {
  snapshotColormapEntries,
  SNAPSHOT_PROVENANCE,
} from "./gibsColormapSnapshot";
import { validateInversion, MEASURED_INVERSION } from "./validation";
import { COLORMAP_DOCS, type CalibratedLayerId } from "./colormap";

const LAYERS = Object.keys(COLORMAP_DOCS) as CalibratedLayerId[];

/**
 * Offline re-measurement of the probe's inversion accuracy.
 *
 * MEASURED_INVERSION is the repository's published accuracy claim: it is
 * quoted in METHODS.md §3 and docs/validation.md, and it sets the ± band the
 * app shows on probe readings. It is *derived* — the residuals of inverting
 * the GIBS ramps through our legend gradients and probe scales.
 *
 * Until now the only thing re-deriving it was the weekly, network-touching
 * inversion contract. So editing a legend gradient (or a probe scale, or a
 * unit conversion) changed the true accuracy while every offline check stayed
 * green, and the published figures could be wrong on the live site for days.
 * Re-running the measurement against the pinned ramps closes that window: a
 * ramp edit now fails here, in the PR, naming the layer and printing the new
 * residual to commit.
 */
describe("inversion accuracy re-measured offline", () => {
  for (const layer of LAYERS) {
    it(`${layer}: MEASURED_INVERSION still matches the pinned ramp`, () => {
      const live = validateInversion(layer, snapshotColormapEntries(layer));
      const ref = MEASURED_INVERSION[layer];

      expect(live.total, `${layer}: snapshot entry count`).toBe(ref.total);
      expect(
        live.nulls,
        `${layer}: ${ref.nulls} of ${ref.total} colours were rejected as no-data when the figures were measured, now ${live.nulls} — a legend gradient or probe scale changed. Update MEASURED_INVERSION (src/lib/validation.ts), METHODS.md §3 and docs/validation.md.`
      ).toBe(ref.nulls);

      if (ref.rmse === null) {
        expect(
          live.rmse,
          `${layer} is published as inverting to no-data everywhere; it now recovers ${live.n} values`
        ).toBeNull();
        return;
      }
      expect(live.rmse, `${layer}: rmse`).not.toBeNull();
      // Exact re-derivation, so the tolerance only absorbs float noise. Any
      // real change to the legend, scale or conversion lands far outside it.
      expect(
        live.rmse!,
        `${layer}: published RMSE ${ref.rmse}, re-measured ${live.rmse} — commit the new figure to MEASURED_INVERSION (src/lib/validation.ts) and update METHODS.md §3 and docs/validation.md.`
      ).toBeCloseTo(ref.rmse, 2);
    });
  }
});

describe("pinned colormap snapshot", () => {
  it("covers every calibrated layer with a usable ramp", () => {
    for (const layer of LAYERS) {
      const entries = snapshotColormapEntries(layer);
      expect(entries.length, layer).toBeGreaterThan(10);
      for (const { rgb, value } of entries) {
        expect(Number.isFinite(value), `${layer}: finite value`).toBe(true);
        for (const c of [rgb.r, rgb.g, rgb.b]) {
          expect(c, `${layer}: channel in range`).toBeGreaterThanOrEqual(0);
          expect(c, `${layer}: channel in range`).toBeLessThanOrEqual(255);
        }
      }
    }
  });

  it("names the source document and retrieval date for every layer", () => {
    // Provenance-first: the cache is only defensible if it says what it
    // cached and when. The weekly contract re-checks it against the live doc.
    expect(SNAPSHOT_PROVENANCE.retrieved).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(SNAPSHOT_PROVENANCE.base).toContain(
      "gibs.earthdata.nasa.gov/colormaps"
    );
    for (const layer of LAYERS) {
      expect(SNAPSHOT_PROVENANCE.docs[layer], layer).toBe(COLORMAP_DOCS[layer]);
    }
  });

  it("ramps monotonically increase in value", () => {
    // The inversion maps a 0..1 gradient position onto [scale.min, scale.max]
    // linearly; that is only meaningful if the ramp's values ascend.
    for (const layer of LAYERS) {
      const values = snapshotColormapEntries(layer).map((e) => e.value);
      const ascending = values.every((v, i) => i === 0 || v > values[i - 1]);
      expect(ascending, `${layer}: ramp values ascend`).toBe(true);
    }
  });
});
