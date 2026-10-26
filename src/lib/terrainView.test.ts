import { describe, expect, it } from "vitest";
import { scienceShouldDrape, type ScienceDrapeInput } from "./terrainView";

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
