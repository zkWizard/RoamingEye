import { describe, it, expect } from "vitest";
import { LAYERS, LAYER_ORDER } from "../src/lib/timeline";
import { HIRES_LAYER } from "../src/lib/imagery";
import { citedDatasets } from "../src/lib/providers";

/**
 * Data-citation contract: the dataset references pinned in the LAYERS config
 * (short name, version, DOI — resolved 2026-07-09 via GIBS layer-metadata →
 * CMR) must stay true. Two things drift in the wild:
 *
 *  - GIBS re-points a layer at a newer product version (061 → 062): the
 *    layer-metadata check below catches it, and the pinned citation must be
 *    re-resolved — otherwise every CSV credits the wrong version.
 *  - A DOI stops resolving (rare, but a dead citation in a research export
 *    is the worst kind of link rot).
 *
 * Network-touching by design; runs weekly via catalog-check.yml.
 */

const LAYER_METADATA = (layer: string): string =>
  `https://gibs.earthdata.nasa.gov/layer-metadata/v1.0/${layer}.json`;

async function fetchWithRetry(
  url: string,
  init?: RequestInit
): Promise<Response> {
  for (let attempt = 0; ; attempt++) {
    try {
      const res = await fetch(url, init);
      // Retry server-side blips; 4xx is a real answer.
      if (res.status >= 500) throw new Error(`HTTP ${res.status}`);
      return res;
    } catch (err) {
      if (attempt >= 1) throw err;
      await new Promise((r) => setTimeout(r, 5000));
    }
  }
}

describe("GIBS layer-metadata ↔ pinned dataset contract", () => {
  const entries = [
    ...LAYER_ORDER.map((id) => ({
      wmsLayer: LAYERS[id].wmsLayer,
      dataset: LAYERS[id].dataset!,
    })),
    { wmsLayer: HIRES_LAYER.wmsLayer, dataset: HIRES_LAYER.dataset },
  ];

  for (const { wmsLayer, dataset } of entries) {
    it(`${wmsLayer} still derives from ${dataset.shortName} v${dataset.version}`, async () => {
      const res = await fetchWithRetry(LAYER_METADATA(wmsLayer));
      expect(res.ok, `layer-metadata exists for ${wmsLayer}`).toBe(true);
      const meta = (await res.json()) as {
        conceptIds?: { shortName?: string; version?: string }[];
      };
      const concepts = meta.conceptIds ?? [];
      expect(
        concepts.length,
        `${wmsLayer} lists source concepts`
      ).toBeGreaterThan(0);
      // The pinned product must still be among the layer's source concepts;
      // a version we don't know about is drift worth a look (GIBS may have
      // re-pointed "best" at a newer collection).
      const known = concepts.some((c) => c.shortName === dataset.shortName);
      expect(
        known,
        `${wmsLayer} still names ${dataset.shortName} (got: ${concepts
          .map((c) => `${c.shortName} v${c.version}`)
          .join(", ")})`
      ).toBe(true);
    });
  }
});

describe("DOI resolution contract", () => {
  for (const { dataset } of citedDatasets()) {
    it(`${dataset.doi} resolves at doi.org`, async () => {
      const res = await fetchWithRetry(`https://doi.org/${dataset.doi}`, {
        method: "HEAD",
        redirect: "manual",
      });
      // A registered DOI answers with a redirect to its landing page.
      expect(
        [301, 302, 303, 307, 308].includes(res.status),
        `expected a redirect for ${dataset.doi}, got HTTP ${res.status}`
      ).toBe(true);
    });
  }
});
