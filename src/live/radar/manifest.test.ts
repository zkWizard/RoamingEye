import { describe, expect, it } from "vitest";
import {
  RADAR_MAX_ZOOM,
  clampRadarZoom,
  latestFrame,
  latestFrameIsFresh,
  parseRainViewerMaps,
  radarTileAt,
  radarTileBounds,
  radarTileUrl,
  radarTilesForView,
  radarZoomForDistance,
} from "./manifest";
import { startRadarPlay, stepRadarPlay, toggleRadarPlay } from "./loop";

const FIXTURE = {
  host: "https://tilecache.rainviewer.com",
  generated: 1_700_000_000,
  radar: {
    past: [
      { time: 1_700_000_000 - 3 * 60 * 60, path: "/v2/radar/old" },
      { time: 1_700_000_000 - 30 * 60, path: "/v2/radar/recent" },
      { time: 1_700_000_000, path: "/v2/radar/newest" },
    ],
    nowcast: [{ time: 1_700_000_000 + 10 * 60, path: "/v2/radar/now" }],
  },
};

describe("RainViewer manifest", () => {
  it("keeps the last two hours and the nowcast, and shows the newest frame", () => {
    const manifest = parseRainViewerMaps(FIXTURE);
    expect(manifest.frames.map((frame) => frame.path)).toEqual([
      "/v2/radar/recent",
      "/v2/radar/newest",
      "/v2/radar/now",
    ]);
    expect(manifest.newest).toBe(1_700_000_000 + 10 * 60);
    expect(latestFrame(manifest).path).toBe("/v2/radar/now");
    expect(latestFrameIsFresh(manifest)).toBe(true);
    expect(manifest.newest - latestFrame(manifest).time).toBeLessThanOrEqual(
      20 * 60
    );
  });

  it("still accepts a feed whose newest frame is 20 minutes behind the stamp", () => {
    const manifest = parseRainViewerMaps({
      host: "https://tilecache.rainviewer.com",
      radar: {
        past: [{ time: 1_000, path: "/v2/radar/a" }],
        nowcast: [],
      },
    });
    expect(latestFrameIsFresh(manifest)).toBe(true);
  });
});

describe("radar tiles", () => {
  it("never asks for a zoom above RainViewer's maximum", () => {
    expect(clampRadarZoom(12)).toBe(RADAR_MAX_ZOOM);
    expect(radarZoomForDistance(1)).toBe(RADAR_MAX_ZOOM);
    const url = radarTileUrl(
      "https://tilecache.rainviewer.com",
      "/v2/radar/abc",
      12,
      3,
      4
    );
    expect(url).toBe(
      "https://tilecache.rainviewer.com/v2/radar/abc/256/7/3/4/2/1_1.png"
    );
    expect(url).not.toContain("/256/12/");
  });

  it("covers the world at a far zoom and a neighbourhood up close", () => {
    expect(radarTilesForView(0, 0, 1)).toHaveLength(4);
    const close = radarTilesForView(40, -74, 6);
    expect(close.every((tile) => tile.z === 6)).toBe(true);
    expect(close.length).toBeGreaterThan(9);
    expect(close.length).toBeLessThan(60);
    const tile = radarTileAt(51.5, -0.1, 3);
    const bounds = radarTileBounds(tile.z, tile.x, tile.y);
    expect(bounds.west).toBeLessThanOrEqual(-0.1);
    expect(bounds.east).toBeGreaterThanOrEqual(-0.1);
    expect(bounds.south).toBeLessThanOrEqual(51.5);
    expect(bounds.north).toBeGreaterThanOrEqual(51.5);
  });
});

describe("radar playhead", () => {
  it("loops frames without any monthly timeline state", () => {
    const play = startRadarPlay(3);
    expect(play).toEqual({ index: 2, playing: true });
    expect(stepRadarPlay(play, 3).index).toBe(0);
    const paused = toggleRadarPlay(play);
    expect(stepRadarPlay(paused, 3)).toEqual(paused);
  });
});
