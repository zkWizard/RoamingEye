import { describe, expect, it } from "vitest";
import { greatCircleDistance } from "./geo";
import { parseEarthquakeFeed, type Earthquake } from "./earthquakes";
import {
  EARTHQUAKE_PLACE_CONTEXT_UNITS,
  USGS_M45_MONTH_SOURCE,
  comparedEventPopulationText,
  epicenterConstraintText,
  epicentralDistanceText,
  feedGenerationText,
  largestReportedMagnitudeObservation,
  listedSeismicityOrderNote,
  nearbyEarthquakeContext,
  reportedDepthBasisText,
  reportedMagnitudeText,
  searchExtentEarthquakeQuery,
  searchExtentScopeText,
} from "./earthquakeContext";
import { volcanoesInSearchExtent } from "./volcanoExtent";

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
    // The tally prints the feed's own codes; the glossary says what each one
    // measures, in the same order, so the two lists correspond term for term.
    expect(text).toContain(
      "Reported methods: mb is short-period body-wave magnitude; " +
        "Mww is moment magnitude (W-phase)."
    );
    // The value the feed reported is never presented as a size ranking.
    expect(text).toContain("not a ranking of earthquake size");
  });

  it("expands the sole reported code inline for a single-method set", () => {
    const text = reportedMagnitudeText(
      nearbyEarthquakeContext(
        [earthquake({ lat: 0.1, magnitude: 6.1, magnitudeType: "mww" })],
        query
      )
    );

    expect(text).toContain(
      "Every matched event was reported as mww, moment magnitude (W-phase)."
    );
    // A uniform set gains no mixing caveat and no separate glossary sentence.
    expect(text).not.toContain("Reported methods");
    expect(text).not.toContain("mix magnitude methods");
  });

  it("names a scale once when distinct feed spellings decode to it", () => {
    const text = reportedMagnitudeText(
      nearbyEarthquakeContext(
        [
          // USGS lists "ms" and "ms_20" as spellings of one method, so the
          // tally keeps both verbatim while the glossary names it once.
          earthquake({ lat: 0.1, magnitude: 6.2, magnitudeType: "ms" }),
          earthquake({ lat: 0.2, magnitude: 6.4, magnitudeType: "ms_20" }),
        ],
        query
      )
    );

    expect(text).toContain("ms ×1, ms_20 ×1");
    expect(text).toContain(
      "Reported methods: Ms_20 is 20-second surface-wave magnitude."
    );
    expect(text?.match(/Ms_20 is /g)).toHaveLength(1);
  });

  it("skips codes outside the published vocabulary rather than guessing", () => {
    const text = reportedMagnitudeText(
      nearbyEarthquakeContext(
        [
          earthquake({ lat: 0.1, magnitude: 5.2, magnitudeType: "mystery" }),
          earthquake({ lat: 0.2, magnitude: 6.1, magnitudeType: "mww" }),
        ],
        query
      )
    );

    // The unrecognized code stays in the tally verbatim...
    expect(text).toContain("mystery ×1");
    // ...but is never attributed to a method USGS did not publish.
    expect(text).toContain(
      "Reported methods: Mww is moment magnitude (W-phase)."
    );
    expect(text).not.toContain("mystery is");
  });

  it("drops the glossary when no reported code resolves to a scale", () => {
    const text = reportedMagnitudeText(
      nearbyEarthquakeContext(
        [
          earthquake({ lat: 0.1, magnitude: 5.2, magnitudeType: "mystery" }),
          earthquake({ lat: 0.2, magnitude: 6.1, magnitudeType: "odd" }),
        ],
        query
      )
    );

    expect(text).toContain("mystery ×1, odd ×1");
    expect(text).not.toContain("Reported methods");
  });

  it("leaves a lone reported code unexpanded when it is unrecognized", () => {
    const text = reportedMagnitudeText(
      nearbyEarthquakeContext(
        [earthquake({ lat: 0.1, magnitude: 6.1, magnitudeType: "mystery" })],
        query
      )
    );

    expect(text).toContain("Every matched event was reported as mystery.");
  });

  it("names all four methods when there are exactly four", () => {
    const text = reportedMagnitudeText(
      nearbyEarthquakeContext(
        [
          earthquake({ lat: 0.1, magnitude: 5.2, magnitudeType: "mb" }),
          earthquake({ lat: 0.2, magnitude: 6.1, magnitudeType: "mww" }),
          earthquake({ lat: 0.3, magnitude: 4.9, magnitudeType: "ml" }),
          earthquake({ lat: 0.4, magnitude: 5.5, magnitudeType: "mwr" }),
        ],
        query
      )
    );

    expect(text).toContain(
      "Reported methods: mb is short-period body-wave magnitude; " +
        "ml is local magnitude; Mwr is moment magnitude (regional); " +
        "Mww is moment magnitude (W-phase)."
    );
    expect(text).not.toContain("further methods");
  });

  it("counts the remainder when more than four methods are reported", () => {
    const text = reportedMagnitudeText(
      nearbyEarthquakeContext(
        [
          earthquake({ lat: 0.1, magnitude: 5.2, magnitudeType: "mb" }),
          earthquake({ lat: 0.2, magnitude: 6.1, magnitudeType: "mww" }),
          earthquake({ lat: 0.3, magnitude: 4.9, magnitudeType: "ml" }),
          earthquake({ lat: 0.4, magnitude: 5.5, magnitudeType: "mwr" }),
          earthquake({ lat: 0.5, magnitude: 5.0, magnitudeType: "mwp" }),
        ],
        query
      )
    );

    // Naming three of five leaves two unnamed: the cap can never leave exactly
    // one, so the plural reads correctly without a singular branch.
    expect(text).toContain("2 further methods not named.");
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

describe("epicenterConstraintText", () => {
  const query = { latitude: 0, longitude: 0, radiusKm: 500 };
  const withGap = (
    lat: number,
    azimuthalGapDeg: number | null
  ): Earthquake => ({
    ...earthquake({ lat }),
    sourceRecord: {
      id: null,
      url: null,
      updatedTime: null,
      magnitudeType: null,
      reviewStatus: null,
      horizontalErrorKm: null,
      depthErrorKm: null,
      stationCount: null,
      azimuthalGapDeg,
      nearestStationDeg: null,
      travelTimeResidualS: null,
    },
  });

  it("counts the matched events exceeding the documented gap and names the widest", () => {
    const text = epicenterConstraintText(
      nearbyEarthquakeContext(
        [
          withGap(0.1, 256),
          withGap(0.2, 90),
          withGap(0.3, 188),
          withGap(0.4, 120),
        ],
        query
      ),
      4
    );

    expect(text).toContain(
      "Azimuthal station gap exceeds 180° for 2 of 4 matched events that reported a gap"
    );
    // Largest first, so the worst-constrained location is the visible one.
    expect(text).toContain("(largest 256°, 188°)");
    expect(text).toContain("large location and depth uncertainties");
    // Never a hazard or quality rating, and never a claim about the rest.
    expect(text).toContain("not a certificate of accuracy");
  });

  it("names the reason this is the only location-quality signal available", () => {
    const text = epicenterConstraintText(
      nearbyEarthquakeContext([withGap(0.1, 200)], query),
      1
    );

    expect(text).toContain("for 1 of 1 matched event that reported a gap");
    expect(text).toContain("publishes no location-uncertainty values");
    // A lone value states no ordering: "largest 200°" would imply a comparison
    // against gaps this sentence never mentions.
    expect(text).toContain("(200°)");
    expect(text).not.toContain("largest");
  });

  it("caps the named gaps and counts the rest", () => {
    const text = epicenterConstraintText(
      nearbyEarthquakeContext(
        [
          withGap(0.1, 190),
          withGap(0.2, 280),
          withGap(0.3, 210),
          withGap(0.4, 260),
          withGap(0.5, 185),
        ],
        query
      ),
      5
    );

    expect(text).toContain("(largest 280°, 260°, 210° and 2 more)");
  });

  it("counts only events that reported a gap, so an absent gap is not coverage", () => {
    const text = epicenterConstraintText(
      nearbyEarthquakeContext(
        [withGap(0.1, 240), withGap(0.2, null), earthquake({ lat: 0.3 })],
        query
      ),
      3
    );

    expect(text).toContain("for 1 of 1 matched event that reported a gap");
  });

  it("stays silent when every reported gap is within the documented range", () => {
    expect(
      epicenterConstraintText(
        nearbyEarthquakeContext([withGap(0.1, 179), withGap(0.2, 90)], query),
        2
      )
    ).toBeNull();
  });

  it("treats a gap of exactly 180° as within the documented range", () => {
    expect(
      epicenterConstraintText(
        nearbyEarthquakeContext([withGap(0.1, 180)], query),
        1
      )
    ).toBeNull();
  });

  it("stays silent when nothing matched", () => {
    expect(
      epicenterConstraintText(nearbyEarthquakeContext([], query), 0)
    ).toBeNull();
  });

  // The list is ordered by distance and these events are singled out by
  // azimuthal gap, so the flagged set and the rendered rows come apart. The
  // three tests below pin one branch each, because the sentence used to claim
  // the first of them in all three cases.
  it("qualifies the listed rows only when every flagged event is on one", () => {
    const text = epicenterConstraintText(
      nearbyEarthquakeContext([withGap(0.1, 240), withGap(0.2, 90)], query),
      2
    );

    expect(text).toContain(
      "so the distance and depth listed for them are less resolved"
    );
    expect(text).not.toContain("shown below");
    expect(text).not.toContain("none of them");
  });

  it("says so when no flagged event reached the listed rows", () => {
    // Nearest first: the two within-range events take both rows, and the
    // flagged one sits third.
    const context = nearbyEarthquakeContext(
      [withGap(0.9, 240), withGap(0.1, 90), withGap(0.2, 120)],
      query
    );
    const text = epicenterConstraintText(context, 2);

    expect(context.observations[2].sourceRecord?.azimuthalGapDeg).toBe(240);
    expect(text).toContain("for 1 of 3 matched events that reported a gap");
    expect(text).toContain("none of them is among the events listed below");
    // The retraction that matters: no claim about the digits on screen, which
    // belong to events within the documented range.
    expect(text).not.toContain("listed for them");
    expect(text).not.toContain("less resolved");
  });

  it("counts how many flagged events reached the rows when only some did", () => {
    const context = nearbyEarthquakeContext(
      [withGap(0.1, 240), withGap(0.9, 220), withGap(0.2, 90)],
      query
    );
    const text = epicenterConstraintText(context, 2);

    expect(text).toContain("for 2 of 3 matched events that reported a gap");
    expect(text).toContain(
      "the distance and depth listed for the 1 of them shown below are less resolved"
    );
    // The tally still names both gaps: it reports the matched set, not the
    // rows, and the two counts are deliberately different populations.
    expect(text).toContain("(largest 240°, 220°)");
  });

  it("claims nothing about the rows when the caller renders none", () => {
    const text = epicenterConstraintText(
      nearbyEarthquakeContext([withGap(0.1, 240)], query),
      0
    );

    expect(text).toContain("none of them is among the events listed below");
  });
});

describe("epicentralDistanceText", () => {
  it("names the point the distance was measured from", () => {
    expect(epicentralDistanceText(143)).toBe(
      "143 km from the search-extent centre"
    );
  });

  it("uses the same anchor wording as the panel's scope sentence", () => {
    // The list sits under "Epicentres within N km of the search-extent centre";
    // reusing that exact term is what lets a reader see that a row's distance
    // and the stated radius are measured on the same axis.
    expect(epicentralDistanceText(12)).toContain("search-extent centre");
  });

  it("does not leave the distance unattributed", () => {
    // A bare "143 km away" is the defect this replaces: the feed's own place
    // string already states a distance from a settlement, so a second,
    // unlabelled figure beside it reads as the same quantity disagreeing with
    // itself.
    expect(epicentralDistanceText(143)).not.toContain("km away");
  });

  it("keeps the existing legibility rule on both sides of the threshold", () => {
    // Sub-10 km distances keep a decimal; larger ones round, so a whole-country
    // radius does not print spurious precision.
    expect(epicentralDistanceText(9.44)).toBe(
      "9.4 km from the search-extent centre"
    );
    expect(epicentralDistanceText(10)).toBe(
      "10 km from the search-extent centre"
    );
    expect(epicentralDistanceText(370.4)).toBe(
      "370 km from the search-extent centre"
    );
  });

  it("reports a coincident epicentre as zero rather than omitting it", () => {
    expect(epicentralDistanceText(0)).toBe(
      "0.0 km from the search-extent centre"
    );
  });

  it("names the anchor in the largest-reported-value sentence too", () => {
    // Both renderers of this distance in the seismicity section share one
    // formatter, so the rows and the summary sentence cannot drift apart.
    const text = reportedMagnitudeText(
      nearbyEarthquakeContext(
        [earthquake({ lat: 0.2, magnitude: 6.4, magnitudeType: "mww" })],
        { latitude: 0, longitude: 0, radiusKm: 500 }
      )
    );

    expect(text).toContain("km from the search-extent centre.");
    expect(text).not.toContain("km away");
  });
});

describe("searchExtentScopeText", () => {
  it("says the searched circle reaches outside the extent", () => {
    // searchExtentEarthquakeQuery circumscribes rather than inscribes, and its
    // doc comment makes saying so a caller obligation.
    expect(searchExtentScopeText(250)).toContain(
      "a circle circumscribing the extent, so it reaches past the boundary corners"
    );
  });

  it("says the extent is the geocoder's box, not the selected boundary", () => {
    // The defect this closes: the volcano and plate sections both end their
    // scope sentence with this clause and seismicity did not, so of the three
    // sections rendered in one panel the loosest fit read as the exact one.
    expect(searchExtentScopeText(250)).toContain(
      "the exact selected boundary is not tested"
    );
  });

  it("uses the sibling sections' wording verbatim", () => {
    // Three phrasings of one caveat would read as three different caveats.
    const volcano = volcanoesInSearchExtent(
      [],
      [0, 1, 0, 1]
    ).geographicCoverage;
    const clause = "the exact selected boundary is not tested";

    expect(volcano).toContain(clause);
    expect(searchExtentScopeText(250)).toContain(clause);
  });

  it("names the box before disclaiming the boundary", () => {
    // "The extent" is the term the first sentence and the row distances both
    // use; the clause has to say which thing that is before calling it inexact.
    const text = searchExtentScopeText(250);

    expect(text.indexOf("search result bounding box")).toBeLessThan(
      text.indexOf("the exact selected boundary is not tested")
    );
  });

  it("keeps the legibility rule on both sides of the radius threshold", () => {
    // Sub-100 km radii keep a decimal so a city-sized extent does not print as
    // a bare integer; larger ones round.
    expect(searchExtentScopeText(18.64)).toContain("Epicentres within 18.6 km");
    expect(searchExtentScopeText(250.4)).toContain("Epicentres within 250 km");
  });

  it("reports a bare-node radius as below the printed precision, not as zero", () => {
    // A place mapped as an OSM node with no extent gets a fixed 0.0001-degree
    // box from the geocoder, which circumscribes to roughly 7 m of radius.
    // One decimal printed "0.0 km", stating the search had no reach in the very
    // sentence that qualifies the empty result reported beside it.
    const query = searchExtentEarthquakeQuery([
      44.4604141, 44.4605141, -110.8281964, -110.8280964,
    ]);
    expect(query.radiusKm).toBeGreaterThan(0);
    expect(query.radiusKm).toBeLessThan(0.05);
    expect(searchExtentScopeText(query.radiusKm)).toContain(
      "Epicentres within <0.1 km"
    );
  });

  it("still prints 0.0 km for an exactly zero radius", () => {
    // A degenerate box really does circumscribe a point, and the query stays
    // valid, so the stronger claim is the true one.
    expect(searchExtentScopeText(0)).toContain("Epicentres within 0.0 km");
  });
});

describe("comparedEventPopulationText", () => {
  // A far-away query so the valid events supplied below never match, which is
  // the state the section's negative branch renders.
  const emptyResult = (events: readonly Earthquake[]) =>
    nearbyEarthquakeContext(events, {
      latitude: 0,
      longitude: 0,
      radiusKm: 50,
    });

  it("states how many valid events an empty result was compared against", () => {
    const context = emptyResult([
      earthquake({ lat: 40 }),
      earthquake({ lat: 41 }),
      earthquake({ lat: 42 }),
    ]);

    expect(context.coverage.matchedEventCount).toBe(0);
    expect(comparedEventPopulationText(context)).toBe(
      "Compared against 3 valid events in the global feed."
    );
  });

  it("names a lone event in the singular", () => {
    // The section's other counts already avoid "1 events"; a comparison
    // population of one is reachable from a sparse feed copy.
    expect(
      comparedEventPopulationText(emptyResult([earthquake({ lat: 40 })]))
    ).toBe("Compared against 1 valid event in the global feed.");
  });

  it("says the set was compared rather than counted", () => {
    // Nothing was counted in this branch. The verb follows the plate-boundary
    // section's "Compared against N usable supplied polylines", which is the
    // repo's existing wording for the size of a search that matched nothing.
    const text = comparedEventPopulationText(
      emptyResult([earthquake({ lat: 40 })])
    );
    expect(text).toContain("Compared against");
    expect(text).not.toContain("Counted from");
  });

  it("stays silent when no radial search was run", () => {
    // An invalid query is a separate state the section reports in its own
    // words; claiming a comparison population there would describe a search
    // that never happened.
    const context = nearbyEarthquakeContext([earthquake({ lat: 40 })], {
      latitude: NaN,
      longitude: NaN,
      radiusKm: NaN,
    });

    expect(context.coverage.status).toBe("invalid-query");
    expect(comparedEventPopulationText(context)).toBeNull();
  });

  it("stays silent when the feed copy held no valid events", () => {
    // The section already tells this reader that no comparison was made, so a
    // "compared against 0" line would contradict it.
    const context = nearbyEarthquakeContext([], {
      latitude: 0,
      longitude: 0,
      radiusKm: 50,
    });

    expect(context.coverage.status).toBe("no-usable-events");
    expect(comparedEventPopulationText(context)).toBeNull();
  });

  it("stays silent when events matched, because that branch states its own total", () => {
    // The matched branch prints "Counted from N valid events in the global
    // feed"; rendering both would say the same figure twice.
    const context = nearbyEarthquakeContext([earthquake()], {
      latitude: 0,
      longitude: 0,
      radiusKm: 50,
    });

    expect(context.coverage.status).toBe("available");
    expect(comparedEventPopulationText(context)).toBeNull();
  });

  it("reports the valid total, not the supplied total", () => {
    // Invalid records were never searched, so counting them would overstate
    // the set the negative result rests on.
    const context = emptyResult([
      earthquake({ lat: 40 }),
      earthquake({ lat: 41 }),
      earthquake({ lat: Number.NaN }),
    ]);

    expect(context.coverage.suppliedEventCount).toBe(3);
    expect(context.coverage.validEventCount).toBe(2);
    expect(comparedEventPopulationText(context)).toContain("2 valid events");
  });
});

describe("feedGenerationText", () => {
  it("dates the feed copy to the minute in UTC", () => {
    // 2026-08-14T04:13:14Z — a real metadata.generated value from the live
    // M4.5+ month summary.
    expect(feedGenerationText(1_786_680_794_000)).toBe(
      "USGS generated this feed copy 2026-08-14 04:13 UTC; its 30-day window " +
        "ends there and does not advance while this page stays open."
    );
  });

  it("says the window does not advance, because the page fetches the feed once", () => {
    // The point of the stamp: a reader must not take a 30-day window measured
    // at load time for one measured now.
    expect(feedGenerationText(1_786_680_794_000)).toContain(
      "does not advance while this page stays open"
    );
  });

  it("reports a missing generation time rather than skipping the disclosure", () => {
    // Mirrors the volcano section, which reports a missing retrieval month
    // instead of quietly dropping its snapshot sentence.
    expect(feedGenerationText(null)).toBe(
      "This feed copy published no generation time, so the end of its 30-day " +
        "window is unstated."
    );
  });

  it("treats a non-finite stamp as no stamp", () => {
    expect(feedGenerationText(Number.NaN)).toBe(feedGenerationText(null));
    expect(feedGenerationText(Number.POSITIVE_INFINITY)).toBe(
      feedGenerationText(null)
    );
  });

  it("treats a finite but unrepresentable stamp as no stamp instead of throwing", () => {
    // Date cannot represent this and toISOString would throw; the parser only
    // guarantees the value is finite, not that it is a plausible epoch.
    expect(feedGenerationText(1e20)).toBe(feedGenerationText(null));
  });

  it("never claims a currency finer than the feed's regeneration cadence", () => {
    // Seconds would imply the copy tracks the source more closely than it does.
    expect(feedGenerationText(1_786_680_794_000)).not.toMatch(/\d\d:\d\d:\d\d/);
  });
});
