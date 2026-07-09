import { describe, it, expect } from "vitest";
import {
  regionAround,
  legalLonBounds,
  gibsRegionUrl,
  studyDate,
} from "./imagery";

describe("regionAround", () => {
  it("centres a span on the point", () => {
    const b = regionAround(40, -3, 1.0);
    expect((b.south + b.north) / 2).toBeCloseTo(40);
    expect(b.north - b.south).toBeCloseTo(1.0);
  });

  it("widens longitude with latitude to stay roughly square on the ground", () => {
    const equator = regionAround(0, 0, 1.0);
    const high = regionAround(60, 0, 1.0);
    const eqLon = equator.east - equator.west;
    const hiLon = high.east - high.west;
    expect(hiLon).toBeGreaterThan(eqLon);
  });

  it("clamps near the poles", () => {
    const b = regionAround(89, 0, 4);
    expect(b.north).toBeLessThanOrEqual(85);
  });

  it("stays centred across the antimeridian (continuous longitudes)", () => {
    // Taveuni, Fiji sits at ~179.9°E: the box must straddle the seam, not
    // stop at it.
    const b = regionAround(-16.8, 179.9, 1.2);
    expect((b.west + b.east) / 2).toBeCloseTo(179.9);
    expect(b.east).toBeGreaterThan(180);
  });
});

describe("legalLonBounds", () => {
  it("slides an east-overflowing box to abut the seam, same size", () => {
    const b = legalLonBounds({
      south: -17,
      north: -16,
      west: 179.5,
      east: 180.5,
    });
    expect(b).toEqual({ south: -17, north: -16, west: 179, east: 180 });
  });

  it("slides a west-overflowing box to abut the seam, same size", () => {
    const b = legalLonBounds({
      south: 51,
      north: 53,
      west: -180.7,
      east: -178.7,
    });
    expect(b.west).toBe(-180);
    expect(b.east).toBeCloseTo(-178);
  });

  it("leaves legal boxes untouched", () => {
    const legal = { south: 40, north: 41, west: -4, east: -3 };
    expect(legalLonBounds(legal)).toEqual(legal);
  });

  it("caps a degenerate over-wide box at the full range", () => {
    expect(
      legalLonBounds({ south: 0, north: 1, west: -200, east: 200 })
    ).toEqual({ south: 0, north: 1, west: -180, east: 180 });
  });
});

describe("gibsRegionUrl", () => {
  it("emits BBOX as minLat,minLon,maxLat,maxLon", () => {
    const url = gibsRegionUrl(
      "HLS_S30_Nadir_BRDF_Adjusted_Reflectance",
      { south: 40, north: 41, west: -4, east: -3 },
      "2023-08-15"
    );
    expect(url).toContain("BBOX=40%2C-4%2C41%2C-3");
    expect(url).toContain("LAYERS=HLS_S30_Nadir_BRDF_Adjusted_Reflectance");
    expect(url).toContain("TIME=2023-08-15");
  });
});

describe("studyDate", () => {
  it("samples mid-month, zero-padded", () => {
    expect(studyDate({ year: 2024, month: 3 })).toBe("2024-03-15");
  });
});
