import { describe, it, expect } from "vitest";
import { regionAround, gibsRegionUrl, studyDate } from "./imagery";

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
