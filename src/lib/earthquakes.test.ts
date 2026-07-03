import { describe, it, expect } from "vitest";
import { parseEarthquakeFeed, depthClass } from "./earthquakes";

const feature = (
  lon: number,
  lat: number,
  depth: number,
  mag: number,
  extra: object = {}
) => ({
  geometry: { coordinates: [lon, lat, depth] },
  properties: { mag, time: 1_750_000_000_000, place: "somewhere", ...extra },
});

describe("parseEarthquakeFeed", () => {
  it("extracts lat/lon/depth/magnitude from valid features", () => {
    const quakes = parseEarthquakeFeed({
      features: [feature(152.3, -4.2, 45, 6.1)],
    });
    expect(quakes).toHaveLength(1);
    expect(quakes[0]).toMatchObject({
      lon: 152.3,
      lat: -4.2,
      depthKm: 45,
      magnitude: 6.1,
      place: "somewhere",
    });
  });

  it("returns [] for non-feed input", () => {
    expect(parseEarthquakeFeed(null)).toEqual([]);
    expect(parseEarthquakeFeed("nope")).toEqual([]);
    expect(parseEarthquakeFeed({})).toEqual([]);
    expect(parseEarthquakeFeed({ features: "not-an-array" })).toEqual([]);
  });

  it("drops malformed features but keeps the rest", () => {
    const quakes = parseEarthquakeFeed({
      features: [
        feature(10, 20, 30, 5.0),
        { geometry: { coordinates: [1, 2] }, properties: { mag: 5 } }, // no depth
        { geometry: null, properties: { mag: 5, time: 1 } }, // no geometry
        feature(200, 20, 30, 5.0), // lon out of range
        feature(10, 20, 30, Number.NaN), // NaN magnitude
        feature(-70.5, -33.4, 105, 7.2),
      ],
    });
    expect(quakes).toHaveLength(2);
    expect(quakes[1].lat).toBe(-33.4);
  });

  it("tolerates a missing place", () => {
    const quakes = parseEarthquakeFeed({
      features: [feature(0, 0, 10, 5, { place: undefined })],
    });
    expect(quakes[0].place).toBe("");
  });
});

describe("depthClass", () => {
  it("classifies by seismological convention", () => {
    expect(depthClass(10)).toBe("shallow");
    expect(depthClass(69.9)).toBe("shallow");
    expect(depthClass(70)).toBe("intermediate");
    expect(depthClass(300)).toBe("intermediate");
    expect(depthClass(301)).toBe("deep");
    expect(depthClass(650)).toBe("deep");
  });
});
