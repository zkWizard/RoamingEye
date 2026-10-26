import { describe, expect, it } from "vitest";
import {
  scienceOverlayOpacity,
  scienceShouldDrape,
  type ScienceDrapeInput,
} from "./terrainView";

const ready: ScienceDrapeInput = {
  distance: 1.2,
  lat: 46,
  comparing: false,
  scienceReady: true,
  draped: false,
};

describe("scienceShouldDrape", () => {
  it("drapes a settled close view over mid-latitude land", () => {
    expect(scienceShouldDrape(ready)).toBe(true);
  });

  it("keeps the whole-planet sphere from orbit", () => {
    expect(scienceShouldDrape({ ...ready, distance: 2.4 })).toBe(false);
  });

  it("stays on the sphere near the poles, where Mercator tiles stop", () => {
    expect(scienceShouldDrape({ ...ready, lat: 80 })).toBe(false);
  });

  it("holds the drape across the boundary so the camera does not flicker", () => {
    expect(scienceShouldDrape({ ...ready, distance: 1.8 })).toBe(false);
    expect(scienceShouldDrape({ ...ready, distance: 1.8, draped: true })).toBe(
      true
    );
    expect(scienceShouldDrape({ ...ready, distance: 1.95, draped: true })).toBe(
      false
    );
  });

  it("defers to the sphere while a comparison is showing or the drape is not ready", () => {
    expect(scienceShouldDrape({ ...ready, comparing: true })).toBe(false);
    expect(scienceShouldDrape({ ...ready, scienceReady: false })).toBe(false);
  });
});

describe("scienceOverlayOpacity", () => {
  const ndvi = {
    nativeMetresPerPixel: 978,
    viewportHeightPx: 900,
    fovDeg: 45,
  };

  it("stays opaque from orbit and gone at city scale", () => {
    expect(scienceOverlayOpacity({ ...ndvi, altitudeMetres: 2_000_000 })).toBe(
      1
    );
    expect(scienceOverlayOpacity({ ...ndvi, altitudeMetres: 150_000 })).toBe(0);
  });

  it("fades between native resolution and a quarter of it", () => {
    const mid = scienceOverlayOpacity({ ...ndvi, altitudeMetres: 500_000 });
    expect(mid).toBeGreaterThan(0);
    expect(mid).toBeLessThan(1);
  });

  it("stays on when the visitor has asked to hold the data layer", () => {
    expect(
      scienceOverlayOpacity({ ...ndvi, altitudeMetres: 1_000, hold: true })
    ).toBe(1);
  });

  it("keeps a sharper layer visible further in", () => {
    const relief = scienceOverlayOpacity({
      nativeMetresPerPixel: 31,
      viewportHeightPx: 900,
      fovDeg: 45,
      altitudeMetres: 80_000,
    });
    const coarse = scienceOverlayOpacity({
      ...ndvi,
      altitudeMetres: 80_000,
    });
    expect(relief).toBeGreaterThan(coarse);
  });
});
