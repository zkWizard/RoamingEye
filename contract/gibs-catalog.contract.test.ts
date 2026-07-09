import { describe, it, expect, beforeAll } from "vitest";
import { LAYERS } from "../src/lib/timeline";
import { HIRES_LAYER } from "../src/lib/imagery";

/**
 * Catalog contract check: every layer RoamingEye hard-codes must still exist
 * in NASA GIBS's live WMTS capabilities, with the tile-matrix set we request
 * and a time dimension where we scrub one. NASA evolves its catalog —
 * identifiers get versioned, superseded, or retired — and this is how we
 * find out *before* a user gets a black globe.
 *
 * Network-touching by design, so it is NOT part of `npm run test`; it runs
 * weekly via .github/workflows/catalog-check.yml (and `npm run
 * test:contract` on demand). One in-run retry absorbs a transient blip; a
 * real failure names the layer and what's missing.
 */

const CAPS_URL =
  "https://gibs.earthdata.nasa.gov/wmts/epsg4326/best/1.0.0/WMTSCapabilities.xml";

/** Layer blocks from the capabilities document, keyed by identifier. */
let layerBlocks: Map<string, string>;

async function fetchCapabilities(): Promise<string> {
  for (let attempt = 0; ; attempt++) {
    try {
      const res = await fetch(CAPS_URL);
      if (!res.ok) throw new Error(`HTTP ${res.status} for GetCapabilities`);
      return await res.text();
    } catch (err) {
      if (attempt >= 1) throw err;
      await new Promise((r) => setTimeout(r, 5000));
    }
  }
}

beforeAll(async () => {
  const xml = await fetchCapabilities();
  layerBlocks = new Map();
  // <Layer> elements are attribute-less in GIBS capabilities; the first
  // <ows:Identifier> inside each block is the layer's own id (styles and
  // dimensions carry theirs deeper in).
  for (const block of xml.split("<Layer>").slice(1)) {
    const body = block.split("</Layer>")[0];
    const id = /<ows:Identifier>([^<]+)<\/ows:Identifier>/.exec(body)?.[1];
    if (id) layerBlocks.set(id, body);
  }
  expect(
    layerBlocks.size,
    "capabilities parsed into zero layers — format change?"
  ).toBeGreaterThan(100);
}, 120_000);

const CATALOG = [
  ...Object.values(LAYERS).map((layer) => ({
    id: layer.wmsLayer,
    label: layer.label,
    set: layer.wmts?.set,
    timed: !layer.static,
  })),
  // The high-res study patch layer is catalog too, WMS-only (no set check).
  {
    id: HIRES_LAYER.wmsLayer,
    label: HIRES_LAYER.label,
    set: undefined,
    timed: true,
  },
];

describe("GIBS catalog contract (live GetCapabilities)", () => {
  it.each(CATALOG)(
    "$id is published with our matrix set and time dimension",
    ({ id, label, set, timed }) => {
      const block = layerBlocks.get(id);
      expect(
        block,
        `layer "${id}" (${label}) is GONE from GIBS capabilities — renamed or retired upstream?`
      ).toBeDefined();
      if (set) {
        expect(
          block,
          `layer "${id}" no longer advertises TileMatrixSet "${set}" — HD tiles would 404`
        ).toContain(`<TileMatrixSet>${set}</TileMatrixSet>`);
      }
      if (timed) {
        expect(
          block,
          `layer "${id}" lost its Time dimension — the scrubber has nothing to address`
        ).toContain("<ows:Identifier>Time</ows:Identifier>");
      }
    }
  );
});
