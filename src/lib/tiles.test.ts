import { describe, it, expect } from "vitest";
import {
  TILE_SIZE,
  tileGridSize,
  tileSpanDegrees,
  degreesPerPixel,
  tileBounds,
  wrapLon,
  tileForLatLon,
  levelForDegPerPixel,
  visibleArcDegrees,
  tilesInView,
  gibsWmtsTileUrl,
  centralAngleRad,
  angleToTileRad,
  selectLodTiles,
  type TileAddress,
} from "./tiles";

describe("tile grid", () => {
  it("level 0 is 2×1 tiles of 180° each; every level doubles", () => {
    expect(tileGridSize(0)).toEqual({ rows: 1, cols: 2 });
    expect(tileGridSize(1)).toEqual({ rows: 2, cols: 4 });
    expect(tileGridSize(6)).toEqual({ rows: 64, cols: 128 });
    expect(tileSpanDegrees(0)).toBe(180);
    expect(tileSpanDegrees(3)).toBe(22.5);
  });

  it("resolution halves per level", () => {
    expect(degreesPerPixel(0)).toBeCloseTo(180 / TILE_SIZE);
    expect(degreesPerPixel(5)).toBeCloseTo(180 / 32 / TILE_SIZE);
  });
});

describe("tileBounds", () => {
  it("level 0: the two root tiles split the map at the prime meridian", () => {
    expect(tileBounds({ level: 0, row: 0, col: 0 })).toEqual({
      north: 90,
      south: -90,
      west: -180,
      east: 0,
    });
    expect(tileBounds({ level: 0, row: 0, col: 1 })).toEqual({
      north: 90,
      south: -90,
      west: 0,
      east: 180,
    });
  });

  it("row 0 is the northernmost row (WMTS convention)", () => {
    const top = tileBounds({ level: 2, row: 0, col: 0 });
    expect(top.north).toBe(90);
    const bottom = tileBounds({ level: 2, row: 3, col: 0 });
    expect(bottom.south).toBe(-90);
  });
});

describe("tileForLatLon", () => {
  it("round-trips: the found tile's bounds contain the point", () => {
    for (const [lat, lon] of [
      [0, 0],
      [45.5, -122.6], // Portland
      [-33.9, 151.2], // Sydney
      [64.1, -21.9], // Reykjavík
    ] as const) {
      const tile = tileForLatLon(lat, lon, 5);
      const b = tileBounds(tile);
      expect(lat).toBeGreaterThanOrEqual(b.south);
      expect(lat).toBeLessThanOrEqual(b.north);
      expect(lon).toBeGreaterThanOrEqual(b.west);
      expect(lon).toBeLessThanOrEqual(b.east);
    }
  });

  it("clamps the poles and wraps the antimeridian", () => {
    const northPole = tileForLatLon(90, 0, 3);
    expect(northPole.row).toBe(0);
    const southPole = tileForLatLon(-90, 0, 3);
    expect(southPole.row).toBe(tileGridSize(3).rows - 1);
    // lon 190 ≡ -170
    expect(tileForLatLon(0, 190, 3)).toEqual(tileForLatLon(0, -170, 3));
  });

  it("wrapLon wraps into [-180, 180)", () => {
    expect(wrapLon(0)).toBe(0);
    expect(wrapLon(190)).toBe(-170);
    expect(wrapLon(-190)).toBe(170);
    expect(wrapLon(540)).toBe(-180);
  });
});

describe("levelForDegPerPixel", () => {
  it("picks the coarsest level meeting the target", () => {
    // Level 0 texel = 0.3516°: anything coarser needs level 0.
    expect(levelForDegPerPixel(1, 6)).toBe(0);
    expect(levelForDegPerPixel(degreesPerPixel(3), 6)).toBe(3);
    // Slightly finer than level 3 → level 4.
    expect(levelForDegPerPixel(degreesPerPixel(3) * 0.99, 6)).toBe(4);
  });

  it("clamps to the layer's max level", () => {
    expect(levelForDegPerPixel(1e-9, 6)).toBe(6);
  });
});

describe("visibleArcDegrees", () => {
  it("is horizon-limited from far away (always < 180°)", () => {
    const far = visibleArcDegrees(50, 45);
    expect(far).toBeLessThan(180);
    expect(far).toBeGreaterThan(150);
  });

  it("is FOV-limited near the surface and shrinks with altitude", () => {
    const low = visibleArcDegrees(1.05, 45);
    const high = visibleArcDegrees(1.5, 45);
    expect(low).toBeLessThan(high);
    expect(low).toBeGreaterThan(0);
    expect(low).toBeLessThan(10); // a close camera sees a few degrees
  });
});

describe("tilesInView", () => {
  it("returns the containing tile plus its neighborhood", () => {
    const tiles = tilesInView(45, -120, 20, 30, 5);
    const center = tileForLatLon(45, -120, 5);
    expect(
      tiles.some((t) => t.row === center.row && t.col === center.col)
    ).toBe(true);
    expect(tiles.length).toBeGreaterThan(4);
    // All tiles intersect the requested window (loosely).
    for (const t of tiles) {
      const b = tileBounds(t);
      expect(b.north).toBeGreaterThan(45 - 11 - tileSpanDegrees(5));
      expect(b.south).toBeLessThan(45 + 11 + tileSpanDegrees(5));
    }
  });

  it("wraps across the antimeridian", () => {
    const tiles = tilesInView(0, 179, 10, 20, 4);
    const cols = tiles.map((t) => t.col);
    const { cols: totalCols } = tileGridSize(4);
    expect(cols).toContain(totalCols - 1); // west of the antimeridian
    expect(cols).toContain(0); // east of it
  });

  it("covers the full ring when the window spans 360°", () => {
    const tiles = tilesInView(85, 0, 5, 360, 2, 1000);
    const rows = new Set(tiles.map((t) => t.row));
    expect(rows.size).toBeGreaterThanOrEqual(1);
    const topRowTiles = tiles.filter((t) => t.row === 0);
    expect(topRowTiles).toHaveLength(tileGridSize(2).cols);
  });

  it("caps the tile count keeping the central tiles", () => {
    const tiles = tilesInView(0, 0, 60, 120, 6, 10);
    expect(tiles).toHaveLength(10);
    const center = tileForLatLon(0, 0, 6);
    expect(
      tiles.some((t) => t.row === center.row && t.col === center.col)
    ).toBe(true);
  });

  it("never repeats a tile", () => {
    const tiles = tilesInView(0, 0, 40, 80, 4);
    const keys = tiles.map((t) => `${t.row}:${t.col}`);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe("centralAngleRad / angleToTileRad", () => {
  it("computes great-circle central angles", () => {
    expect(centralAngleRad(0, 0, 0, 0)).toBe(0);
    expect(centralAngleRad(90, 0, -90, 0)).toBeCloseTo(Math.PI);
    expect(centralAngleRad(0, 0, 0, 90)).toBeCloseTo(Math.PI / 2);
  });

  it("is zero for a point inside the tile", () => {
    const tile = tileForLatLon(45, -120, 5);
    expect(angleToTileRad(45, -120, tile)).toBe(0);
  });

  it("measures across the antimeridian, not the long way round", () => {
    // Tile hugging the antimeridian from the east; point just west of it.
    const tile = tileForLatLon(0, -179, 5);
    const angle = angleToTileRad(0, 179, tile);
    expect(angle).toBeLessThan(3 * (Math.PI / 180)); // a couple of degrees
  });
});

describe("selectLodTiles", () => {
  const view = (distance: number, lat = 36, lon = -112) => ({
    lat,
    lon,
    distance,
    fovDeg: 45,
    aspect: 1.56,
    viewportHeightPx: 900,
  });

  /** True when `a` is an ancestor of `b` in the quadtree. */
  const isAncestor = (a: TileAddress, b: TileAddress): boolean => {
    if (a.level >= b.level) return false;
    const shift = b.level - a.level;
    return b.row >> shift === a.row && b.col >> shift === a.col;
  };

  it("returns nothing from far away (base texture is already as sharp)", () => {
    expect(selectLodTiles(view(4.5), 3, 11)).toEqual([]);
  });

  it("subdivides adaptively: nadir finer than the view edge", () => {
    // Mid-height view: the FOV window is wide enough that the edge tiles sit
    // meaningfully farther from the camera than the nadir tiles.
    const tiles = selectLodTiles(view(1.3), 3, 11);
    expect(tiles.length).toBeGreaterThan(4);
    // Sorted nearest-first: the subpoint tile leads and is the finest.
    const nadirLevel = tiles[0].level;
    const coarsest = Math.min(...tiles.map((t) => t.level));
    expect(angleToTileRad(36, -112, tiles[0])).toBe(0);
    expect(coarsest).toBeLessThan(nadirLevel); // mixed levels = adaptive
    for (const t of tiles) expect(t.level).toBeLessThanOrEqual(nadirLevel);
  });

  it("culls to the FOV cone: a low camera loads far fewer tiles than the horizon cap", () => {
    // At d = 1.08 the horizon cap is ~22° wide but the 45° FOV shows only a
    // few degrees — frustum culling must keep the selection tight.
    const tiles = selectLodTiles(view(1.08), 3, 11);
    expect(tiles.length).toBeGreaterThan(4);
    expect(tiles.length).toBeLessThan(100);
    const maxGamma = Math.max(...tiles.map((t) => angleToTileRad(36, -112, t)));
    expect(maxGamma).toBeLessThan(10 * (Math.PI / 180));
  });

  it("emits a non-overlapping leaf set", () => {
    const tiles = selectLodTiles(view(1.15), 3, 11);
    for (const a of tiles) {
      for (const b of tiles) {
        if (a === b) continue;
        expect(isAncestor(a, b)).toBe(false);
      }
    }
  });

  it("never selects past the horizon, even with FOV headroom", () => {
    const d = 1.3;
    const horizon = Math.acos(1 / d) + tileSpanDegrees(11) * (Math.PI / 180);
    for (const t of selectLodTiles(view(d), 3, 11)) {
      expect(angleToTileRad(36, -112, t)).toBeLessThanOrEqual(horizon);
    }
  });

  it("respects the cap, keeping the tiles nearest the subpoint", () => {
    const tiles = selectLodTiles(view(1.08), 3, 11, 5);
    expect(tiles).toHaveLength(5);
    expect(angleToTileRad(36, -112, tiles[0])).toBe(0);
  });

  it("clamps to the layer's max level", () => {
    const tiles = selectLodTiles(view(1.02), 3, 5);
    expect(tiles.length).toBeGreaterThan(0);
    for (const t of tiles) expect(t.level).toBeLessThanOrEqual(5);
  });
});

describe("gibsWmtsTileUrl", () => {
  const wmts = { set: "1km", maxLevel: 6, ext: "png" as const };

  it("builds the timed REST URL", () => {
    expect(
      gibsWmtsTileUrl("MODIS_Terra_L3_NDVI_Monthly", "2024-06-01", wmts, {
        level: 4,
        row: 3,
        col: 17,
      })
    ).toBe(
      "https://gibs.earthdata.nasa.gov/wmts/epsg4326/best/MODIS_Terra_L3_NDVI_Monthly/default/2024-06-01/1km/4/3/17.png"
    );
  });

  it("omits the time segment for static layers", () => {
    expect(
      gibsWmtsTileUrl(
        "ASTER_GDEM_Color_Shaded_Relief",
        null,
        { set: "31.25m", maxLevel: 11, ext: "jpg" },
        { level: 2, row: 1, col: 2 }
      )
    ).toBe(
      "https://gibs.earthdata.nasa.gov/wmts/epsg4326/best/ASTER_GDEM_Color_Shaded_Relief/default/31.25m/2/1/2.jpg"
    );
  });
});
