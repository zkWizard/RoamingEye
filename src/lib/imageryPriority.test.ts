import { describe, expect, it } from "vitest";
import {
  imageryRequestPriority,
  slippyTileCenter,
  slippyTileFromUrl,
} from "./imageryPriority";

describe("slippy tile priority", () => {
  it("reads z/y/x from an Esri or GIBS url", () => {
    expect(
      slippyTileFromUrl(
        "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/12/1684/1064"
      )
    ).toEqual({ z: 12, x: 1064, y: 1684 });
    expect(
      slippyTileFromUrl(
        "https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/MODIS_Terra_NDVI_Monthly/default/2024-12-01/GoogleMapsCompatible_Level6/4/6/3.png"
      )
    ).toEqual({ z: 4, x: 3, y: 6 });
  });

  it("puts a tile's centre on the city it covers", () => {
    const houston = slippyTileCenter({ z: 10, x: 240, y: 423 });
    expect(houston.lat).toBeGreaterThan(29);
    expect(houston.lat).toBeLessThan(31);
    expect(houston.lon).toBeGreaterThan(-96);
    expect(houston.lon).toBeLessThan(-94);
  });

  it("loads the tile under the camera before one at the edge of the view", () => {
    const now = 10_000;
    // z14 tile that actually covers Houston, then one forty columns east.
    const center = imageryRequestPriority(
      "https://example.test/tile/14/6772/3851",
      29.76,
      -95.37,
      now
    );
    const edge = imageryRequestPriority(
      "https://example.test/tile/14/6772/3891",
      29.76,
      -95.37,
      now
    );
    expect(center).toBeLessThan(edge);
  });

  it("loads a finer tile before the parent covering the same point", () => {
    const now = 10_000;
    const fine = imageryRequestPriority(
      "https://example.test/tile/16/27088/15406",
      29.76,
      -95.37,
      now
    );
    const parent = imageryRequestPriority(
      "https://example.test/tile/12/1693/962",
      29.76,
      -95.37,
      now
    );
    expect(fine).toBeLessThan(parent);
  });

  it("lets a tile from the zoom just asked for jump the queue", () => {
    const older = imageryRequestPriority(
      "https://example.test/tile/12/1693/962",
      29.76,
      -95.37,
      5_000
    );
    const newer = imageryRequestPriority(
      "https://example.test/tile/16/27088/15406",
      29.76,
      -95.37,
      5_400
    );
    expect(newer).toBeLessThan(older);
  });
});
