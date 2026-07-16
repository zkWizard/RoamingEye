import { describe, it, expect } from "vitest";
import {
  filterEarthquakes,
  parseEarthquakeFeed,
  depthClass,
  earthquakeHoverLabel,
  magnitudeClass,
  MAGNITUDE_CLASS_ORDER,
  summarizeEarthquakes,
} from "./earthquakes";

describe("earthquakeHoverLabel", () => {
  it("preserves the reported place, magnitude, depth, and UTC event time", () => {
    expect(
      earthquakeHoverLabel({
        lat: 35.2,
        lon: -117.4,
        depthKm: 8.4,
        magnitude: 4.6,
        place: "12 km NE of Example",
        time: Date.UTC(2026, 6, 16, 12, 34, 56),
      })
    ).toBe(
      "12 km NE of Example · M 4.6 · 8.4 km depth · 2026-07-16T12:34:56.000Z"
    );
  });
});

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

describe("magnitudeClass", () => {
  it("bins magnitudes into USGS descriptor classes at inclusive lower bounds", () => {
    expect(magnitudeClass(8)).toBe("great");
    expect(magnitudeClass(7.9)).toBe("major");
    expect(magnitudeClass(7)).toBe("major");
    expect(magnitudeClass(6.5)).toBe("strong");
    expect(magnitudeClass(5)).toBe("moderate");
    expect(magnitudeClass(4.5)).toBe("light");
    expect(magnitudeClass(3)).toBe("minor");
    expect(magnitudeClass(2.9)).toBe("micro");
    expect(magnitudeClass(0)).toBe("micro");
    expect(magnitudeClass(-1)).toBe("micro");
  });

  it("returns null for non-finite magnitudes rather than mislabeling them", () => {
    expect(magnitudeClass(Number.NaN)).toBeNull();
    expect(magnitudeClass(Number.POSITIVE_INFINITY)).toBeNull();
  });

  it("orders classes weakest to strongest", () => {
    expect(MAGNITUDE_CLASS_ORDER).toEqual([
      "micro",
      "minor",
      "light",
      "moderate",
      "strong",
      "major",
      "great",
    ]);
  });
});

describe("filterEarthquakes", () => {
  const earthquakes = [
    {
      lat: 1,
      lon: 2,
      depthKm: 10,
      magnitude: 4.5,
      time: 1_000,
      place: "A",
    },
    {
      lat: 3,
      lon: 4,
      depthKm: 70,
      magnitude: 5.5,
      time: 2_000,
      place: "B",
    },
    {
      lat: 5,
      lon: 6,
      depthKm: 301,
      magnitude: 6.5,
      time: 3_000,
      place: "C",
    },
  ];

  it("applies inclusive magnitude, depth, and time bounds without reordering", () => {
    expect(
      filterEarthquakes(earthquakes, {
        minMagnitude: 5.5,
        maxMagnitude: 6.5,
        minDepthKm: 70,
        endTime: 3_000,
      })
    ).toEqual([earthquakes[1], earthquakes[2]]);
  });

  it("returns no events for inverted or non-finite bounds", () => {
    expect(
      filterEarthquakes(earthquakes, { minMagnitude: 6, maxMagnitude: 5 })
    ).toEqual([]);
    expect(filterEarthquakes(earthquakes, { startTime: Number.NaN })).toEqual(
      []
    );
  });
});

describe("summarizeEarthquakes", () => {
  it("retains native units and USGS provenance in a descriptive summary", () => {
    const summary = summarizeEarthquakes([
      {
        lat: 1,
        lon: 2,
        depthKm: 10,
        magnitude: 4.5,
        time: 1_000,
        place: "A",
      },
      {
        lat: 3,
        lon: 4,
        depthKm: 70,
        magnitude: 6.5,
        time: 3_000,
        place: "B",
      },
      {
        lat: 5,
        lon: 6,
        depthKm: 301,
        magnitude: 5.5,
        time: 2_000,
        place: "C",
      },
    ]);

    expect(summary).toMatchObject({
      eventCount: 3,
      magnitude: { min: 4.5, max: 6.5 },
      depthKm: { min: 10, max: 301 },
      time: { min: 1_000, max: 3_000 },
      depthClassCounts: { shallow: 1, intermediate: 1, deep: 1 },
      magnitudeClassCounts: {
        micro: 0,
        minor: 0,
        light: 1,
        moderate: 1,
        strong: 1,
        major: 0,
        great: 0,
      },
      source: { name: "USGS Earthquake Hazards Program GeoJSON summary feed" },
      units: { magnitude: "M", depth: "km", time: "epoch milliseconds (UTC)" },
    });
  });

  it("makes empty coverage explicit instead of manufacturing a range", () => {
    expect(summarizeEarthquakes([])).toMatchObject({
      eventCount: 0,
      magnitude: { min: null, max: null },
      depthKm: { min: null, max: null },
      time: { min: null, max: null },
      depthClassCounts: { shallow: 0, intermediate: 0, deep: 0 },
      magnitudeClassCounts: {
        micro: 0,
        minor: 0,
        light: 0,
        moderate: 0,
        strong: 0,
        major: 0,
        great: 0,
      },
    });
  });
});
