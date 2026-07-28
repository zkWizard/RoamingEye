import { describe, it, expect } from "vitest";
import {
  filterEarthquakes,
  parseEarthquakeFeed,
  parseEarthquakeFeedWithCoverage,
  depthClass,
  earthquakeHoverLabel,
  magnitudeClass,
  MAGNITUDE_CLASS_ORDER,
  summarizeEarthquakes,
  isValidEarthquakeObservation,
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
  extra: object = {},
  id?: string
) => ({
  id,
  geometry: { coordinates: [lon, lat, depth] },
  properties: { mag, time: 1_750_000_000_000, place: "somewhere", ...extra },
});

describe("parseEarthquakeFeed", () => {
  it("extracts coordinates and preserves the reported magnitude type", () => {
    const quakes = parseEarthquakeFeed({
      features: [feature(152.3, -4.2, 45, 6.1, { magType: "mww" })],
    });
    expect(quakes).toHaveLength(1);
    expect(quakes[0]).toMatchObject({
      lon: 152.3,
      lat: -4.2,
      depthKm: 45,
      magnitude: 6.1,
      magnitudeType: "mww",
      place: "somewhere",
    });
  });

  it("retains USGS event identity, review metadata, and location uncertainty", () => {
    const quakes = parseEarthquakeFeed({
      features: [
        feature(
          -122.1,
          38.2,
          8.4,
          4.8,
          {
            url: "https://earthquake.usgs.gov/earthquakes/eventpage/us7000test",
            updated: 1_750_000_123_456,
            magType: "mw",
            status: "reviewed",
            horizontalError: 4.2,
            depthError: 1.7,
          },
          "us7000test"
        ),
      ],
    });

    expect(quakes[0].sourceRecord).toEqual({
      id: "us7000test",
      url: "https://earthquake.usgs.gov/earthquakes/eventpage/us7000test",
      updatedTime: 1_750_000_123_456,
      magnitudeType: "mw",
      reviewStatus: "reviewed",
      horizontalErrorKm: 4.2,
      depthErrorKm: 1.7,
    });
  });

  it("makes unavailable source-record metadata explicit without dropping the event", () => {
    const quakes = parseEarthquakeFeed({
      features: [
        feature(10, 20, 30, 5, {
          url: null,
          updated: "not-a-time",
          magType: undefined,
          status: 2,
          horizontalError: undefined,
          depthError: "not-a-number",
        }),
      ],
    });

    expect(quakes[0].sourceRecord).toEqual({
      id: null,
      url: null,
      updatedTime: null,
      magnitudeType: null,
      reviewStatus: null,
      horizontalErrorKm: null,
      depthErrorKm: null,
    });
  });

  it("preserves zero uncertainty and rejects negative uncertainty", () => {
    const quakes = parseEarthquakeFeed({
      features: [
        feature(10, 20, 30, 5, {
          horizontalError: 0,
          depthError: -1,
        }),
      ],
    });

    expect(quakes[0].sourceRecord).toMatchObject({
      horizontalErrorKm: 0,
      depthErrorKm: null,
    });
  });

  it("makes an omitted or blank magnitude type explicitly unavailable", () => {
    const quakes = parseEarthquakeFeed({
      features: [
        feature(0, 0, 10, 5),
        feature(1, 1, 20, 5.1, { magType: "   " }),
        feature(2, 2, 30, 5.2, { magType: 12 }),
      ],
    });

    expect(quakes.map(({ magnitudeType }) => magnitudeType)).toEqual([
      null,
      null,
      null,
    ]);
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

  it("preserves an unavailable place without inventing an empty label", () => {
    const quakes = parseEarthquakeFeed({
      features: [feature(0, 0, 10, 5, { place: undefined })],
    });
    expect(quakes[0].place).toBeNull();
  });

  it("retains a source-supplied empty place distinctly from unavailable", () => {
    const quakes = parseEarthquakeFeed({
      features: [feature(0, 0, 10, 5, { place: "" })],
    });
    expect(quakes[0].place).toBe("");
  });
});

describe("parseEarthquakeFeedWithCoverage", () => {
  it("reports usable and rejected feature coverage with one reason per rejection", () => {
    const result = parseEarthquakeFeedWithCoverage({
      features: [
        feature(152.3, -4.2, 45, 6.1),
        { geometry: null, properties: {} },
        feature(181, 0, 10, 5),
        { geometry: { coordinates: [1, 2, 3] }, properties: null },
        feature(1, 2, Number.NaN, 5),
      ],
    });

    expect(result.earthquakes).toHaveLength(1);
    expect(result.coverage).toEqual({
      status: "available",
      suppliedFeatureCount: 5,
      usableEventCount: 1,
      rejectedFeatureCount: 4,
      rejectedByReason: {
        "invalid-geometry": 1,
        "invalid-coordinates": 1,
        "invalid-properties": 1,
        "invalid-measurements": 1,
      },
    });
    expect(result.source.name).toContain("USGS");
    expect(result.units).toEqual({
      magnitude: "M",
      depth: "km",
      time: "epoch milliseconds (UTC)",
    });
  });

  it("distinguishes an invalid payload from a valid feed with no usable events", () => {
    const invalid = parseEarthquakeFeedWithCoverage({ features: null });
    const unusable = parseEarthquakeFeedWithCoverage({
      features: [feature(0, 91, 10, 5)],
    });
    const empty = parseEarthquakeFeedWithCoverage({ features: [] });

    expect(invalid.coverage).toMatchObject({
      status: "invalid-feed",
      suppliedFeatureCount: 0,
      usableEventCount: 0,
      rejectedFeatureCount: 0,
    });
    expect(unusable.coverage).toMatchObject({
      status: "no-usable-events",
      suppliedFeatureCount: 1,
      usableEventCount: 0,
      rejectedFeatureCount: 1,
      rejectedByReason: { "invalid-coordinates": 1 },
    });
    expect(empty.coverage).toMatchObject({
      status: "no-usable-events",
      suppliedFeatureCount: 0,
      usableEventCount: 0,
      rejectedFeatureCount: 0,
    });
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

  it("excludes events outside valid geographic coverage", () => {
    expect(
      filterEarthquakes([
        earthquakes[0],
        { ...earthquakes[1], lat: 91 },
        { ...earthquakes[2], lon: -181 },
      ])
    ).toEqual([earthquakes[0]]);
  });
});

describe("isValidEarthquakeObservation", () => {
  const earthquake = {
    lat: 90,
    lon: -180,
    depthKm: -1,
    magnitude: 4.5,
    time: 1_000,
    place: "A",
  };

  it("accepts finite native measurements at inclusive geographic bounds", () => {
    expect(isValidEarthquakeObservation(earthquake)).toBe(true);
    expect(
      isValidEarthquakeObservation({ ...earthquake, lat: -90, lon: 180 })
    ).toBe(true);
  });

  it("rejects non-finite measurements and impossible coordinates", () => {
    expect(isValidEarthquakeObservation({ ...earthquake, lat: 90.1 })).toBe(
      false
    );
    expect(
      isValidEarthquakeObservation({ ...earthquake, lon: Number.NaN })
    ).toBe(false);
    expect(
      isValidEarthquakeObservation({ ...earthquake, depthKm: Infinity })
    ).toBe(false);
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
        magnitudeType: "mb",
        time: 1_000,
        place: "A",
      },
      {
        lat: 3,
        lon: 4,
        depthKm: 70,
        magnitude: 6.5,
        magnitudeType: "mww",
        time: 3_000,
        place: "B",
      },
      {
        lat: 5,
        lon: 6,
        depthKm: 301,
        magnitude: 5.5,
        magnitudeType: "mb",
        time: 2_000,
        place: "C",
      },
    ]);

    expect(summary).toMatchObject({
      eventCount: 3,
      magnitude: { min: 4.5, max: 6.5 },
      magnitudeTypes: {
        reportedCounts: { mb: 2, mww: 1 },
        unavailableCount: 0,
      },
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
      magnitudeTypes: { reportedCounts: {}, unavailableCount: 0 },
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

  it("counts omitted magnitude types as unavailable without homogenizing labels", () => {
    const summary = summarizeEarthquakes([
      {
        lat: 1,
        lon: 2,
        depthKm: 10,
        magnitude: 5,
        magnitudeType: "ML",
        time: 1_000,
        place: "A",
      },
      {
        lat: 3,
        lon: 4,
        depthKm: 20,
        magnitude: 5.1,
        magnitudeType: "ml",
        time: 2_000,
        place: "B",
      },
      {
        lat: 5,
        lon: 6,
        depthKm: 30,
        magnitude: 5.2,
        magnitudeType: null,
        time: 3_000,
        place: "C",
      },
    ]);

    expect(summary.magnitudeTypes).toEqual({
      reportedCounts: { ML: 1, ml: 1 },
      unavailableCount: 1,
    });
  });

  it("does not report ranges or classes for invalid geography", () => {
    const summary = summarizeEarthquakes([
      {
        lat: 95,
        lon: 2,
        depthKm: 301,
        magnitude: 7,
        time: 1_000,
        place: "Outside latitude coverage",
      },
    ]);

    expect(summary).toMatchObject({
      eventCount: 0,
      magnitude: { min: null, max: null },
      depthKm: { min: null, max: null },
      depthClassCounts: { shallow: 0, intermediate: 0, deep: 0 },
    });
  });
});
