import { describe, it, expect, beforeAll } from "vitest";
import { LAYERS } from "../src/lib/timeline";
import { HIRES_LAYER } from "../src/lib/imagery";
import { degreesPerPixel, tileGridSize, TILE_SIZE } from "../src/lib/tiles";

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
/** TileMatrixSet definition blocks, keyed by set name ("1km", …). */
let matrixSets: Map<string, string>;

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

  matrixSets = new Map();
  for (const block of xml.split("<TileMatrixSet>").slice(1)) {
    const body = block.split("</TileMatrixSet>")[0];
    const id = /<ows:Identifier>([^<]+)<\/ows:Identifier>/.exec(body)?.[1];
    if (id) matrixSets.set(id, body);
  }
}, 120_000);

/** WMTS standardized rendering pixel size: 0.28 mm at scale denominator 1. */
const METERS_PER_DEGREE = 111_319.490_793_273_57; // EPSG:4326 metersPerUnit

interface TileMatrixDef {
  id: string;
  degPerPixel: number;
  matrixWidth: number;
  matrixHeight: number;
  tileWidth: number;
}

function parseMatrixSet(body: string): TileMatrixDef[] {
  return [...body.matchAll(/<TileMatrix>[\s\S]*?<\/TileMatrix>/g)].map((m) => {
    const g = (re: RegExp): string => re.exec(m[0])?.[1] ?? "";
    return {
      id: g(/<ows:Identifier>([^<]+)/),
      degPerPixel:
        (Number(g(/<ScaleDenominator>([^<]+)/)) * 0.00028) / METERS_PER_DEGREE,
      matrixWidth: Number(g(/<MatrixWidth>([^<]+)/)),
      matrixHeight: Number(g(/<MatrixHeight>([^<]+)/)),
      tileWidth: Number(g(/<TileWidth>([^<]+)/)),
    };
  });
}

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

describe("tile-grid contract (regression #141 — the check that was missing)", () => {
  // Every matrix set our layers use, plus the level count we're configured
  // for. lib/tiles.ts derives the whole pyramid from LEVEL0_DEG_PER_PIXEL;
  // these assertions pin that derivation, level by level, to what GIBS
  // actually serves. The original tiler assumed a 180°-rooted power-of-two
  // quadtree and draped every tile with imagery from the wrong place.
  const SETS = [
    ...new Map(
      Object.values(LAYERS)
        .filter((l) => l.wmts)
        .map((l) => [l.wmts!.set, l.wmts!.maxLevel])
    ).entries(),
  ].map(([set, maxLevel]) => ({ set, maxLevel }));

  it.each(SETS)(
    "$set: our pyramid matches the live TileMatrixSet level-by-level",
    ({ set, maxLevel }) => {
      const body = matrixSets.get(set);
      expect(
        body,
        `TileMatrixSet "${set}" missing from capabilities`
      ).toBeDefined();
      const defs = parseMatrixSet(body!);
      expect(
        defs.length - 1,
        `set "${set}": our maxLevel ${maxLevel} exceeds the published levels`
      ).toBeGreaterThanOrEqual(maxLevel);
      for (const def of defs) {
        const level = Number(def.id);
        expect(def.tileWidth, `set "${set}" L${level} tile size`).toBe(
          TILE_SIZE
        );
        expect(
          def.degPerPixel,
          `set "${set}" L${level}: ground resolution drifted from our pyramid`
        ).toBeCloseTo(degreesPerPixel(level), 6);
        const grid = tileGridSize(level);
        expect(
          { width: def.matrixWidth, height: def.matrixHeight },
          `set "${set}" L${level}: matrix dimensions drifted from our ceil-cover`
        ).toEqual({ width: grid.cols, height: grid.rows });
      }
    }
  );
});
