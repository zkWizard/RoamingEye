import { describe, it, expect } from "vitest";
import {
  COLORMAP_DOCS,
  colormapUrl,
  parseColormapEntries,
} from "../src/lib/colormap";
import {
  SST_MAX_INVERSION_DISTANCE,
  SST_NO_DATA_RGB,
  SST_NO_DATA_TO_RAMP_DISTANCE,
  colorDistance,
} from "../src/lib/sstNoData";
import { NO_DATA_DISTANCE, invertColormapEntries } from "../src/lib/probe";

/**
 * SST no-data contract: the sea-surface-temperature ramp's coldest colour is
 * close to the black GIBS renders where the MODIS/Aqua L3 product carries no
 * SST, so the place card samples that layer with its own, tighter inversion
 * threshold (src/lib/sstNoData.ts). Re-measure that separation against the
 * live colormap; a GIBS re-render that moves the ramp's dark end must fail
 * here rather than quietly reintroduce land and sea ice as ~0 °C water.
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

describe("SST no-data ↔ live GIBS ramp", () => {
  it("keeps the committed black-to-ramp distance and threshold valid", async () => {
    const entries = parseColormapEntries(
      await fetchColormap(COLORMAP_DOCS.sst)
    );
    expect(entries.length, "SST ramp has continuous entries").toBeGreaterThan(
      10
    );

    const nearest = entries.reduce((best, entry) =>
      colorDistance(SST_NO_DATA_RGB, entry.rgb) <
      colorDistance(SST_NO_DATA_RGB, best.rgb)
        ? entry
        : best
    );
    const live = colorDistance(SST_NO_DATA_RGB, nearest.rgb);

    expect(
      live,
      `SST no-data black is ${live.toFixed(1)} from the live ramp (committed ${SST_NO_DATA_TO_RAMP_DISTANCE}); update src/lib/sstNoData.ts`
    ).toBeCloseTo(SST_NO_DATA_TO_RAMP_DISTANCE, 1);

    // Why the layer opts out of the app-wide threshold at all.
    expect(
      live,
      "SST separation still below the app-wide threshold"
    ).toBeLessThan(NO_DATA_DISTANCE);
    expect(
      invertColormapEntries(SST_NO_DATA_RGB, entries),
      "the default threshold still mis-reads no-data as a temperature"
    ).not.toBeNull();

    // ...and that the layer threshold keeps rejecting it, with margin.
    expect(
      invertColormapEntries(
        SST_NO_DATA_RGB,
        entries,
        SST_MAX_INVERSION_DISTANCE
      ),
      "SST no-data black must invert to no value"
    ).toBeNull();
    expect(SST_MAX_INVERSION_DISTANCE).toBeLessThan(live / 2);

    // Every published ramp colour must still survive the tighter threshold —
    // the fix may not cost the layer any of its real value range.
    for (const entry of entries) {
      expect(
        invertColormapEntries(entry.rgb, entries, SST_MAX_INVERSION_DISTANCE),
        `published ramp colour for ${entry.value} °C must stay usable`
      ).toBe(entry.value);
    }
  });
});
