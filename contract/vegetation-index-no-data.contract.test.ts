import { describe, expect, it } from "vitest";
import { colormapUrl, parseColormapEntries } from "../src/lib/colormap";
import { NO_DATA_DISTANCE, invertColormapEntries } from "../src/lib/probe";
import {
  NDVI_MAX_INVERSION_DISTANCE,
  VEGETATION_INDEX_NO_DATA_RGB,
  VEGETATION_INDEX_NO_DATA_SEPARATION,
  colorDistance,
  vegetationIndexNoDataSeparability,
} from "../src/lib/vegetationIndexNoData";

/**
 * Vegetation-index no-data contract: both MODIS vegetation ramps run into
 * near-black at their dense-canopy end, close to the black GIBS renders where
 * the composite draws no index (see src/lib/vegetationIndexNoData.ts). Re-
 * measure that separation against the live colormaps; a GIBS re-render that
 * moves either dark end must fail here rather than quietly change what an
 * undrawn water, snow, or cloud pixel reads as.
 *
 * Network-touching; runs weekly via catalog-check.yml.
 */

const DOCS = {
  ndvi: "MODIS_L3_NDVI",
  evi: "MODIS_L3_EVI",
} as const;

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

describe("vegetation-index no-data ↔ live GIBS ramps", () => {
  it("keeps the committed NDVI separation and threshold valid", async () => {
    const entries = parseColormapEntries(await fetchColormap(DOCS.ndvi));
    expect(entries.length, "NDVI ramp has continuous entries").toBeGreaterThan(
      10
    );

    const nearest = entries.reduce((best, entry) =>
      colorDistance(VEGETATION_INDEX_NO_DATA_RGB, entry.rgb) <
      colorDistance(VEGETATION_INDEX_NO_DATA_RGB, best.rgb)
        ? entry
        : best
    );
    const live = colorDistance(VEGETATION_INDEX_NO_DATA_RGB, nearest.rgb);

    expect(
      live,
      `NDVI no-data black is ${live.toFixed(1)} from the live ramp (committed ${VEGETATION_INDEX_NO_DATA_SEPARATION.ndvi}); update src/lib/vegetationIndexNoData.ts`
    ).toBeCloseTo(VEGETATION_INDEX_NO_DATA_SEPARATION.ndvi, 1);

    // Why the layer opts out of the app-wide threshold at all: the default
    // still turns undrawn pixels into near-maximum greenness.
    expect(
      live,
      "NDVI separation still below the app-wide threshold"
    ).toBeLessThan(NO_DATA_DISTANCE);
    const misread = invertColormapEntries(
      VEGETATION_INDEX_NO_DATA_RGB,
      entries
    );
    expect(
      misread,
      "the default threshold still mis-reads no-data as an index value"
    ).not.toBeNull();
    expect(
      misread!,
      "and the mis-read lands at the top of the index"
    ).toBeGreaterThan(0.9);

    // ...and that the layer threshold keeps rejecting it, with margin.
    expect(
      invertColormapEntries(
        VEGETATION_INDEX_NO_DATA_RGB,
        entries,
        NDVI_MAX_INVERSION_DISTANCE
      ),
      "NDVI no-data black must invert to no value"
    ).toBeNull();
    expect(NDVI_MAX_INVERSION_DISTANCE).toBeLessThan(live / 2);

    // The fix may not cost the layer any of its real value range.
    for (const entry of entries) {
      expect(
        invertColormapEntries(entry.rgb, entries, NDVI_MAX_INVERSION_DISTANCE),
        `published NDVI colour for ${entry.value} must stay usable`
      ).toBe(entry.value);
    }
  });

  it("confirms EVI's ramp still contains the no-data colour itself", async () => {
    const entries = parseColormapEntries(await fetchColormap(DOCS.evi));
    expect(entries.length, "EVI ramp has continuous entries").toBeGreaterThan(
      10
    );

    const live = entries.reduce(
      (best, entry) =>
        Math.min(best, colorDistance(VEGETATION_INDEX_NO_DATA_RGB, entry.rgb)),
      Infinity
    );

    expect(
      live,
      `EVI no-data black is ${live.toFixed(1)} from the live ramp (committed ${VEGETATION_INDEX_NO_DATA_SEPARATION.evi}); update src/lib/vegetationIndexNoData.ts`
    ).toBeCloseTo(VEGETATION_INDEX_NO_DATA_SEPARATION.evi, 1);

    // Should GIBS ever re-render EVI clear of black, this flips to "separable"
    // and the layer becomes eligible for a threshold like NDVI's.
    expect(vegetationIndexNoDataSeparability("evi")).toBe("inseparable");
  });
});
