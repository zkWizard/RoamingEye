import { describe, expect, it } from "vitest";
import { parseEarthquakeFeed, type Earthquake } from "./earthquakes";
import {
  EARTHQUAKE_PLACE_CONTEXT_UNITS,
  USGS_M45_MONTH_SOURCE,
  nearbyEarthquakeContext,
} from "./earthquakeContext";

const earthquake = (overrides: Partial<Earthquake> = {}): Earthquake => ({
  lat: 0,
  lon: 0,
  depthKm: 12,
  magnitude: 5.2,
  time: 1_750_000_000_000,
  place: "Test location",
  ...overrides,
});

describe("nearbyEarthquakeContext", () => {
  it("selects antimeridian-near epicentres, orders them by distance, and retains USGS provenance", () => {
    const context = nearbyEarthquakeContext(
      [
        earthquake({
          lon: -179.95,
          place: "West of the antimeridian",
          time: 1_000,
        }),
        earthquake({
          lon: 179.9,
          place: "East of the antimeridian",
          time: 2_000,
        }),
        earthquake({ lon: 170, place: "Outside radius", time: 3_000 }),
      ],
      { latitude: 0, longitude: 179.8, radiusKm: 40 }
    );

    expect(context).toMatchObject({
      kind: "usgs-nearby-earthquake-context",
      isForecast: false,
      coverage: {
        status: "available",
        suppliedEventCount: 3,
        validEventCount: 3,
        matchedEventCount: 2,
        matchedDistanceKm: {
          min: expect.closeTo(11.12, 2),
          max: expect.closeTo(27.8, 1),
        },
        sourceEventTime: { min: 1_000, max: 3_000 },
        invalidQueryFields: [],
      },
      summary: {
        eventCount: 2,
        magnitude: { min: 5.2, max: 5.2 },
        depthKm: { min: 12, max: 12 },
        time: { min: 1_000, max: 2_000 },
      },
      provenance: USGS_M45_MONTH_SOURCE,
      units: EARTHQUAKE_PLACE_CONTEXT_UNITS,
    });
    expect(context.observations.map(({ place }) => place)).toEqual([
      "East of the antimeridian",
      "West of the antimeridian",
    ]);
    expect(context.observations[0]).toMatchObject({
      depthClass: "shallow",
      distanceKm: expect.closeTo(11.12, 2),
    });
    expect(context.limitations.join(" ")).toContain(
      "not a complete earthquake catalog"
    );
  });

  it("uses an inclusive radius boundary and keeps a no-match result distinct from unusable source data", () => {
    const atQuery = earthquake({ lat: 10, lon: 20, place: "At query" });
    const boundary = nearbyEarthquakeContext([atQuery], {
      latitude: 10,
      longitude: 20,
      radiusKm: 0,
    });
    const noMatch = nearbyEarthquakeContext([atQuery], {
      latitude: -10,
      longitude: -20,
      radiusKm: 1,
    });
    const noUsableEvents = nearbyEarthquakeContext([], {
      latitude: -10,
      longitude: -20,
      radiusKm: 1,
    });

    expect(boundary.observations).toHaveLength(1);
    expect(boundary.observations[0].distanceKm).toBe(0);
    expect(noMatch).toMatchObject({
      observations: [],
      summary: {
        eventCount: 0,
        time: { min: null, max: null },
      },
      coverage: {
        status: "no-events-in-radius",
        suppliedEventCount: 1,
        validEventCount: 1,
        matchedEventCount: 0,
        matchedDistanceKm: { min: null, max: null },
        sourceEventTime: {
          min: 1_750_000_000_000,
          max: 1_750_000_000_000,
        },
      },
    });
    expect(noUsableEvents).toMatchObject({
      observations: [],
      coverage: {
        status: "no-usable-events",
        suppliedEventCount: 0,
        validEventCount: 0,
        matchedEventCount: 0,
        matchedDistanceKm: { min: null, max: null },
        sourceEventTime: { min: null, max: null },
      },
    });
  });

  it("counts malformed supplied events as unavailable rather than using them for local context", () => {
    const context = nearbyEarthquakeContext(
      [
        earthquake({ lat: Number.NaN }),
        earthquake({ lon: 181 }),
        earthquake({ time: Number.POSITIVE_INFINITY }),
        earthquake({ place: "Valid event" }),
      ],
      { latitude: 0, longitude: 0, radiusKm: 1 }
    );

    expect(context.coverage).toMatchObject({
      status: "available",
      suppliedEventCount: 4,
      validEventCount: 1,
      matchedEventCount: 1,
      sourceEventTime: {
        min: 1_750_000_000_000,
        max: 1_750_000_000_000,
      },
    });
    expect(context.observations.map(({ place }) => place)).toEqual([
      "Valid event",
    ]);
  });

  it("makes invalid place queries explicit without broadening the requested area", () => {
    const context = nearbyEarthquakeContext([earthquake()], {
      latitude: 91,
      longitude: Number.NaN,
      radiusKm: -1,
    });

    expect(context).toMatchObject({
      observations: [],
      coverage: {
        status: "invalid-query",
        suppliedEventCount: 1,
        validEventCount: 1,
        matchedEventCount: 0,
        matchedDistanceKm: { min: null, max: null },
        invalidQueryFields: ["latitude", "longitude", "radiusKm"],
      },
    });
  });

  it("accepts the existing USGS GeoJSON parser output without changing native event fields", () => {
    const earthquakes = parseEarthquakeFeed({
      features: [
        {
          geometry: { coordinates: [-122.42, 37.77, 8.4] },
          properties: {
            mag: 4.6,
            time: 1_750_000_000_000,
            place: "San Francisco Bay Area",
          },
        },
      ],
    });
    const context = nearbyEarthquakeContext(earthquakes, {
      latitude: 37.77,
      longitude: -122.42,
      radiusKm: 0,
    });

    expect(context.observations).toEqual([
      {
        lat: 37.77,
        lon: -122.42,
        depthKm: 8.4,
        magnitude: 4.6,
        time: 1_750_000_000_000,
        place: "San Francisco Bay Area",
        distanceKm: 0,
        depthClass: "shallow",
      },
    ]);
    expect(context.provenance).toMatchObject({
      feedWindow: "rolling past 30 days at source retrieval time",
      minimumMagnitude: 4.5,
    });
  });
});
