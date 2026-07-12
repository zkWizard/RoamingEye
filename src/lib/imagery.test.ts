import { describe, it, expect } from "vitest";
import {
  regionAround,
  legalLonBounds,
  splitBoundsAtAntimeridian,
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

describe("splitBoundsAtAntimeridian", () => {
  it("returns a non-crossing box unchanged as one full-width piece", () => {
    const legal = { south: 40, north: 41, west: -4, east: -3 };
    expect(splitBoundsAtAntimeridian(legal)).toEqual([
      { bounds: legal, fraction: 1 },
    ]);
  });

  it("splits an east-overflowing box into two legal pieces, west→east", () => {
    // Taveuni-style box: 179 → 181 in continuous longitudes.
    const parts = splitBoundsAtAntimeridian({
      south: -17,
      north: -16,
      west: 179,
      east: 181,
    });
    expect(parts).toHaveLength(2);
    expect(parts[0].bounds).toEqual({
      south: -17,
      north: -16,
      west: 179,
      east: 180,
    });
    expect(parts[1].bounds).toEqual({
      south: -17,
      north: -16,
      west: -180,
      east: -179,
    });
    // Width is conserved and the fractions mirror the angular shares.
    expect(parts[0].fraction).toBeCloseTo(0.5);
    expect(parts[1].fraction).toBeCloseTo(0.5);
  });

  it("splits a west-overflowing box (Attu-style continuous frame)", () => {
    const parts = splitBoundsAtAntimeridian({
      south: 52,
      north: 53,
      west: -180.75,
      east: -178.25,
    });
    expect(parts).toHaveLength(2);
    expect(parts[0].bounds.west).toBeCloseTo(179.25);
    expect(parts[0].bounds.east).toBe(180);
    expect(parts[1].bounds.west).toBe(-180);
    expect(parts[1].bounds.east).toBeCloseTo(-178.25);
    expect(parts[0].fraction + parts[1].fraction).toBeCloseTo(1);
    expect(parts[0].fraction).toBeCloseTo(0.75 / 2.5);
  });

  it("every piece is a legal WMS BBOX with conserved total width", () => {
    for (const lon of [-180.6, -180, -179.99, 0, 179.99, 180, 180.6, 359]) {
      const box = { south: -1, north: 1, west: lon - 0.6, east: lon + 0.6 };
      const parts = splitBoundsAtAntimeridian(box);
      let width = 0;
      for (const p of parts) {
        expect(p.bounds.west).toBeGreaterThanOrEqual(-180);
        expect(p.bounds.east).toBeLessThanOrEqual(180);
        expect(p.bounds.east).toBeGreaterThan(p.bounds.west);
        width += p.bounds.east - p.bounds.west;
      }
      expect(width).toBeCloseTo(1.2);
      expect(parts.reduce((s, p) => s + p.fraction, 0)).toBeCloseTo(1);
    }
  });

  it("a box exactly touching the seam stays single", () => {
    const touching = { south: 0, north: 1, west: 178.8, east: 180 };
    expect(splitBoundsAtAntimeridian(touching)).toHaveLength(1);
  });

  it("caps a degenerate over-wide box at the full range", () => {
    expect(
      splitBoundsAtAntimeridian({ south: 0, north: 1, west: -200, east: 200 })
    ).toEqual([
      { bounds: { south: 0, north: 1, west: -180, east: 180 }, fraction: 1 },
    ]);
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
