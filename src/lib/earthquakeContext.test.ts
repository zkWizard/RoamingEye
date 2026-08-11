import { describe, expect, it } from "vitest";
import { greatCircleDistance } from "./geo";
import { parseEarthquakeFeed, type Earthquake } from "./earthquakes";
import {
  EARTHQUAKE_PLACE_CONTEXT_UNITS,
  USGS_M45_MONTH_SOURCE,
  nearbyEarthquakeContext,
  searchExtentEarthquakeQuery,
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
          geometry: {
            type: "Point",
            coordinates: [-122.42, 37.77, 8.4],
          },
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
        // A feed that omits magType reports the type as explicitly unavailable
        // rather than inventing one.
        magnitudeType: null,
        time: 1_750_000_000_000,
        place: "San Francisco Bay Area",
        // Native USGS record provenance travels with the event; a minimal
        // feed carries it with every field explicitly null.
        sourceRecord: {
          id: null,
          magnitudeType: null,
          reviewStatus: null,
          updatedTime: null,
          url: null,
          horizontalErrorKm: null,
          depthErrorKm: null,
        },
        distanceKm: 0,
        depthClass: "shallow",
      },
    ]);
    expect(context.provenance).toMatchObject({
      feedWindow: "rolling past 30 days at source retrieval time",
      minimumMagnitude: 4.5,
    });
  });

  it("orders unavailable source places after named events when other sort keys tie", () => {
    const context = nearbyEarthquakeContext(
      [
        earthquake({ place: null }),
        earthquake({ place: "Named event" }),
        earthquake({ place: "" }),
      ],
      { latitude: 0, longitude: 0, radiusKm: 0 }
    );

    expect(context.observations.map(({ place }) => place)).toEqual([
      "",
      "Named event",
      null,
    ]);
  });
});

describe("searchExtentEarthquakeQuery", () => {
  it("centres the query on the extent and circumscribes its corners", () => {
    const query = searchExtentEarthquakeQuery([-1, 1, -2, 2]);

    expect(query.latitude).toBeCloseTo(0, 10);
    expect(query.longitude).toBeCloseTo(0, 10);

    // The corner is the farthest point of the extent, so the radius must reach
    // it exactly — not the nearer edge midpoint.
    const cornerKm = greatCircleDistance(0, 0, 1, 2, 6_371);
    const edgeKm = greatCircleDistance(0, 0, 1, 0, 6_371);
    expect(query.radiusKm).toBeCloseTo(cornerKm, 6);
    expect(query.radiusKm).toBeGreaterThan(edgeKm);
  });

  it("measures an antimeridian-crossing extent across the seam, not around the globe", () => {
    const query = searchExtentEarthquakeQuery([-1, 1, 179, -179]);

    expect(query.longitude).toBeCloseTo(180, 10);
    // Crossing the seam the extent spans 2° of longitude; going the long way
    // would span 358° and put the radius in the thousands of kilometres.
    expect(query.radiusKm).toBeCloseTo(
      greatCircleDistance(0, 180, 1, 179, 6_371),
      6
    );
    expect(query.radiusKm).toBeLessThan(200);
  });

  it("keeps every event inside the extent within the circumscribed radius", () => {
    const boundingBox: [number, number, number, number] = [34, 36, 138, 141];
    const query = searchExtentEarthquakeQuery(boundingBox);
    const [south, north, west, east] = boundingBox;
    const insideExtent = [
      earthquake({ lat: south, lon: west, place: "SW corner" }),
      earthquake({ lat: north, lon: east, place: "NE corner" }),
      earthquake({ lat: 35, lon: 139.5, place: "Interior" }),
    ];

    const context = nearbyEarthquakeContext(insideExtent, query);

    expect(context.coverage.matchedEventCount).toBe(insideExtent.length);
  });

  it("reports missing or unusable bounds as an invalid query rather than an empty result", () => {
    const cases: (readonly [number, number, number, number] | null)[] = [
      null,
      [Number.NaN, 1, -2, 2],
      [1, -1, -2, 2], // south above north
      [-1, 1, -2, 190], // longitude out of range
      [-95, 95, -2, 2], // latitude out of range
    ];

    for (const boundingBox of cases) {
      const context = nearbyEarthquakeContext(
        [earthquake()],
        searchExtentEarthquakeQuery(boundingBox)
      );

      expect(context.coverage.status).toBe("invalid-query");
      expect(context.observations).toEqual([]);
      // An invalid extent must not be reported as "nothing happened here".
      expect(context.coverage.invalidQueryFields.length).toBeGreaterThan(0);
    }
  });

  it("still produces a valid zero-radius query for a degenerate point extent", () => {
    const query = searchExtentEarthquakeQuery([12, 12, 34, 34]);

    expect(query).toEqual({ latitude: 12, longitude: 34, radiusKm: 0 });
    expect(
      nearbyEarthquakeContext([earthquake({ lat: 12, lon: 34 })], query)
        .coverage.status
    ).toBe("available");
  });
});
