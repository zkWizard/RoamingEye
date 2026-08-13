import { describe, expect, it } from "vitest";
import { greatCircleDistance } from "./geo";
import { parseEarthquakeFeed, type Earthquake } from "./earthquakes";
import {
  EARTHQUAKE_PLACE_CONTEXT_UNITS,
  USGS_M45_MONTH_SOURCE,
  largestReportedMagnitudeObservation,
  listedSeismicityOrderNote,
  nearbyEarthquakeContext,
  reportedDepthBasisText,
  reportedMagnitudeText,
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
          stationCount: null,
          azimuthalGapDeg: null,
          nearestStationDeg: null,
          travelTimeResidualS: null,
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

describe("largestReportedMagnitudeObservation", () => {
  // Reported magnitudes are quantised to a tenth, so two matched events sharing
  // a maximum is ordinary; the pick must not depend on which order the caller
  // supplied them in.
  const tied = [
    earthquake({ lat: 1, magnitude: 6.1, place: "Farther", time: 5_000 }),
    earthquake({ lat: 0.1, magnitude: 6.1, place: "Nearer", time: 1_000 }),
    earthquake({ lat: 0.2, magnitude: 5.4, place: "Smaller", time: 9_000 }),
  ];

  it("picks the same tied event whichever order the events arrive in", () => {
    const query = { latitude: 0, longitude: 0, radiusKm: 500 };
    const forward = largestReportedMagnitudeObservation(
      nearbyEarthquakeContext(tied, query).observations
    );
    const reversed = largestReportedMagnitudeObservation(
      nearbyEarthquakeContext([...tied].reverse(), query).observations
    );

    expect(forward?.place).toBe("Nearer");
    expect(reversed?.place).toBe("Nearer");
  });

  it("reports no observation for an empty matched set", () => {
    expect(largestReportedMagnitudeObservation([])).toBeNull();
  });
});

describe("reportedMagnitudeText", () => {
  const query = { latitude: 0, longitude: 0, radiusKm: 500 };

  it("names the largest reported value, its method, and the mix behind the set", () => {
    const text = reportedMagnitudeText(
      nearbyEarthquakeContext(
        [
          earthquake({ lat: 0.1, magnitude: 4.8, magnitudeType: "mb" }),
          earthquake({ lat: 0.2, magnitude: 6.4, magnitudeType: "mww" }),
          earthquake({ lat: 0.3, magnitude: 5.1, magnitudeType: "mb" }),
        ],
        query
      )
    );

    expect(text).toContain(
      "Largest reported value across all 3 matched events"
    );
    expect(text).toContain("M 6.4 (Mww, reported)");
    expect(text).toContain("mb ×2, mww ×1");
    expect(text).toContain("not directly comparable");
    // The value the feed reported is never presented as a size ranking.
    expect(text).toContain("not a ranking of earthquake size");
  });

  it("carries the saturation caveat when the largest value came from a saturating scale", () => {
    const text = reportedMagnitudeText(
      nearbyEarthquakeContext(
        [earthquake({ lat: 0.1, magnitude: 6.9, magnitudeType: "mb" })],
        query
      )
    );

    expect(text).toContain("saturates at this size");
    // A single-method set states the method plainly and gains no mixing caveat.
    expect(text).toContain("Every matched event was reported as mb");
    expect(text).not.toContain("mix magnitude methods");
  });

  it("says so plainly when no matched event carried a reported method", () => {
    const text = reportedMagnitudeText(
      nearbyEarthquakeContext(
        [earthquake({ lat: 0.1, magnitude: 5.5, magnitudeType: null })],
        query
      )
    );

    expect(text).toContain("M 5.5 (reported)");
    expect(text).toContain(
      "No matched event carried a reported magnitude method"
    );
  });

  it("stays silent when nothing matched", () => {
    expect(
      reportedMagnitudeText(nearbyEarthquakeContext([], query))
    ).toBeNull();
  });
});

describe("reportedDepthBasisText", () => {
  const query = { latitude: 0, longitude: 0, radiusKm: 500 };

  it("counts the matched depths sitting on a conventional default and names the values", () => {
    const text = reportedDepthBasisText(
      nearbyEarthquakeContext(
        [
          earthquake({ lat: 0.1, depthKm: 10 }),
          earthquake({ lat: 0.2, depthKm: 35 }),
          earthquake({ lat: 0.3, depthKm: 10 }),
          earthquake({ lat: 0.4, depthKm: 12.4 }),
        ],
        query
      )
    );

    expect(text).toContain(
      "Reported depth sits exactly on a conventional default value for 3 of 4 matched events"
    );
    // Ascending by depth, so a reader can match the values against the rows.
    expect(text).toContain("(10 km ×2, 35 km ×1)");
    // A quantization tell is never presented as a location-quality rating.
    expect(text).toContain("no fixed-depth flag");
    expect(text).toContain("it does not rate the locations");
  });

  it("agrees in number when a single matched event carries a default depth", () => {
    const text = reportedDepthBasisText(
      nearbyEarthquakeContext([earthquake({ lat: 0.1, depthKm: 0 })], query)
    );

    expect(text).toContain("for 1 of 1 matched event (0 km ×1)");
  });

  it("stays silent when every matched depth is a free value", () => {
    expect(
      reportedDepthBasisText(
        nearbyEarthquakeContext(
          [
            earthquake({ lat: 0.1, depthKm: 9.9 }),
            earthquake({ lat: 0.2, depthKm: 34.8 }),
          ],
          query
        )
      )
    ).toBeNull();
  });

  it("stays silent when nothing matched", () => {
    expect(
      reportedDepthBasisText(nearbyEarthquakeContext([], query))
    ).toBeNull();
  });
});

describe("listedSeismicityOrderNote", () => {
  const query = { latitude: 0, longitude: 0, radiusKm: 500 };
  const spread = (count: number): Earthquake[] =>
    Array.from({ length: count }, (_, index) =>
      earthquake({ lat: 0.1 * (index + 1), place: `Event ${index + 1}` })
    );

  it("counts the hidden events and names the ordering the rows were cut by", () => {
    expect(
      listedSeismicityOrderNote(nearbyEarthquakeContext(spread(8), query), 5)
    ).toBe(
      "3 additional events not listed; the list is ordered nearest first, not by magnitude"
    );
  });

  it("agrees in number when a single event is hidden", () => {
    expect(
      listedSeismicityOrderNote(nearbyEarthquakeContext(spread(6), query), 5)
    ).toBe(
      "1 additional event not listed; the list is ordered nearest first, not by magnitude"
    );
  });

  it("stays silent when every matched event is on screen", () => {
    const context = nearbyEarthquakeContext(spread(5), query);
    expect(listedSeismicityOrderNote(context, 5)).toBeNull();
    // A limit above the matched count must not report a negative remainder.
    expect(listedSeismicityOrderNote(context, 20)).toBeNull();
  });

  it("stays silent when nothing matched", () => {
    expect(
      listedSeismicityOrderNote(nearbyEarthquakeContext([], query), 5)
    ).toBeNull();
  });

  it("reports the hidden count against the rows actually shown, not a fixed limit", () => {
    // The disclosure is derived from the caller's row count, so a UI that shows
    // a different number of rows cannot silently misstate how many are hidden.
    const context = nearbyEarthquakeContext(spread(8), query);
    expect(listedSeismicityOrderNote(context, 2)).toContain(
      "6 additional events not listed"
    );
    expect(listedSeismicityOrderNote(context, 0)).toContain(
      "8 additional events not listed"
    );
  });

  it("refuses an unusable row count rather than inventing a remainder", () => {
    const context = nearbyEarthquakeContext(spread(8), query);
    expect(listedSeismicityOrderNote(context, -1)).toBeNull();
    expect(listedSeismicityOrderNote(context, Number.NaN)).toBeNull();
  });

  it("names an ordering that matches how the context actually orders events", () => {
    // Guards the sentence against the contract drifting: the first observation
    // must really be the nearest, not the largest.
    const context = nearbyEarthquakeContext(
      [
        earthquake({ lat: 0.8, magnitude: 7.4, place: "Far but largest" }),
        earthquake({ lat: 0.05, magnitude: 4.6, place: "Nearest" }),
        ...spread(6),
      ],
      query
    );

    expect(context.observations[0].place).toBe("Nearest");
    expect(listedSeismicityOrderNote(context, 5)).toContain(
      "ordered nearest first, not by magnitude"
    );
  });
});
