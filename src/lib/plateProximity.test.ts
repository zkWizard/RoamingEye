import { describe, expect, it } from "vitest";
import { parsePlateBoundaries, type PlateBoundary } from "./plates";
import { BIRD_2003_PLATE_BOUNDARY_SOURCE } from "./plateBoundaryContext";
import {
  nearestPlateBoundary,
  nearestPlateBoundaryStatement,
  placePointPlateQuery,
  PLATE_PROXIMITY_UNITS,
} from "./plateProximity";
import {
  plateBoundaryPairLabel,
  UNLABELED_PLATE_BOUNDARY_TEXT,
} from "./plateBoundaryHover";

const DEG_KM = (6_371 * Math.PI) / 180; // km per degree of great-circle arc

const boundary = (overrides: Partial<PlateBoundary> = {}): PlateBoundary => ({
  name: "PA-NA",
  points: [
    [0, 0],
    [10, 0],
  ],
  ...overrides,
});

describe("nearestPlateBoundary", () => {
  it("retains Bird provenance, native units, non-forecast framing, and limitations", () => {
    const context = nearestPlateBoundary([boundary()], {
      latitude: 0,
      longitude: 5,
    });

    expect(context.kind).toBe("bird-2003-nearest-plate-boundary");
    expect(context.isForecast).toBe(false);
    expect(context.provenance).toBe(BIRD_2003_PLATE_BOUNDARY_SOURCE);
    expect(context.units).toBe(PLATE_PROXIMITY_UNITS);
    expect(context.limitations.length).toBeGreaterThan(0);
    // Honesty guarantees: never a hazard/forecast claim, never a true margin.
    expect(context.limitations.join(" ")).toMatch(/does not/i);
    expect(context.limitations.join(" ")).toMatch(/nearest supplied/i);
  });

  it("measures the perpendicular great-circle distance to an equatorial segment", () => {
    // Segment runs along the equator lon 0→10; query sits 1° due north of it.
    const context = nearestPlateBoundary([boundary()], {
      latitude: 1,
      longitude: 5,
    });

    expect(context.coverage.status).toBe("available");
    expect(context.nearest).not.toBeNull();
    expect(context.nearest?.name).toBe("PA-NA");
    expect(context.nearest?.distanceKm).toBeCloseTo(DEG_KM, 2);
    // The foot of the perpendicular is the point directly below the query.
    expect(context.nearest?.nearestPoint.latitude).toBeCloseTo(0, 6);
    expect(context.nearest?.nearestPoint.longitude).toBeCloseTo(5, 6);
    expect(context.coverage.evaluatedSegmentCount).toBe(1);
  });

  it("reports zero distance when the query lies on a boundary vertex", () => {
    const context = nearestPlateBoundary(
      [
        boundary({
          points: [
            [0, 0],
            [0, 10],
          ],
        }),
      ],
      { latitude: 5, longitude: 0 }
    );

    expect(context.nearest?.distanceKm).toBeCloseTo(0, 6);
    expect(context.nearest?.nearestPoint.latitude).toBeCloseTo(5, 6);
    expect(context.nearest?.nearestPoint.longitude).toBeCloseTo(0, 6);
  });

  it("clamps to the nearest endpoint when the foot falls beyond the segment", () => {
    // Query is 10° east of the segment's eastern end, off the arc entirely.
    const context = nearestPlateBoundary([boundary()], {
      latitude: 0,
      longitude: 20,
    });

    expect(context.nearest?.distanceKm).toBeCloseTo(10 * DEG_KM, 2);
    expect(context.nearest?.nearestPoint.latitude).toBeCloseTo(0, 6);
    expect(context.nearest?.nearestPoint.longitude).toBeCloseTo(10, 6);
  });

  it("returns the closest of several boundaries", () => {
    const near = boundary({ name: "AF-EU" }); // equatorial, 1° from the query
    const far = boundary({
      name: "SA-AF",
      points: [
        [0, 40],
        [10, 40],
      ],
    });
    const context = nearestPlateBoundary([far, near], {
      latitude: 1,
      longitude: 5,
    });

    expect(context.nearest?.name).toBe("AF-EU");
    expect(context.nearest?.distanceKm).toBeCloseTo(DEG_KM, 2);
    expect(context.coverage.evaluatedSegmentCount).toBe(2);
  });

  it("resolves ties to the earliest-supplied boundary", () => {
    const first = boundary({ name: "FIRST" });
    const second = boundary({ name: "SECOND" }); // identical geometry
    const context = nearestPlateBoundary([first, second], {
      latitude: 1,
      longitude: 5,
    });

    expect(context.nearest?.name).toBe("FIRST");
  });

  it("surfaces an unlabeled boundary as a null name rather than dropping it", () => {
    const context = nearestPlateBoundary([boundary({ name: "   " })], {
      latitude: 0,
      longitude: 5,
    });

    expect(context.coverage.status).toBe("available");
    expect(context.nearest?.name).toBeNull();
  });

  it("flags an invalid query and computes no distance", () => {
    const context = nearestPlateBoundary([boundary()], {
      latitude: 200,
      longitude: 400,
    });

    expect(context.coverage.status).toBe("invalid-query");
    expect(context.coverage.invalidQueryFields).toEqual([
      "latitude",
      "longitude",
    ]);
    expect(context.nearest).toBeNull();
    expect(context.coverage.evaluatedSegmentCount).toBe(0);
  });

  it("reports no usable boundaries when every supplied polyline is malformed", () => {
    const context = nearestPlateBoundary(
      [
        boundary({ points: [[0, 0]] }), // too few points
        boundary({
          points: [
            [0, 0],
            [200, 0],
          ],
        }), // out-of-range vertex
      ],
      { latitude: 0, longitude: 5 }
    );

    expect(context.coverage.status).toBe("no-usable-boundaries");
    expect(context.coverage.suppliedBoundaryCount).toBe(2);
    expect(context.coverage.usableBoundaryCount).toBe(0);
    expect(context.nearest).toBeNull();
  });

  it("works on boundaries parsed from a GeoJSON FeatureCollection", () => {
    const boundaries = parsePlateBoundaries({
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          properties: { name: "AN-AU" },
          geometry: {
            type: "LineString",
            coordinates: [
              [0, 0],
              [10, 0],
            ],
          },
        },
      ],
    });

    const context = nearestPlateBoundary(boundaries, {
      latitude: 1,
      longitude: 5,
    });

    expect(context.nearest?.name).toBe("AN-AU");
    expect(context.nearest?.distanceKm).toBeCloseTo(DEG_KM, 2);
  });
});

describe("nearestPlateBoundaryStatement", () => {
  it("names the boundary exactly as the globe tooltip does, with a distance", () => {
    const context = nearestPlateBoundary([boundary()], {
      latitude: 1,
      longitude: 5,
    });

    const statement = nearestPlateBoundaryStatement(context);
    // One boundary must read identically wherever it appears, so the sentence
    // is built from the same decoder the hover label uses.
    expect(statement).toContain(plateBoundaryPairLabel("PA-NA"));
    // The anchor phrase is pinned in full by the dedicated test below; here it
    // only has to show that a distance is quoted at all.
    expect(statement).toContain(
      `${Math.round(DEG_KM)} km from the geocoded place point`
    );
  });

  it("reads the nearest label's delimiter back as a descent", () => {
    // The panel's polarity paragraph only describes boundaries that intersect
    // the extent, so it is silent whenever this sentence renders. Without this
    // clause the glyph in "CO\NA" reaches the reader undecoded.
    const context = nearestPlateBoundary([boundary({ name: "CO\\NA" })], {
      latitude: 1,
      longitude: 5,
    });

    expect(nearestPlateBoundaryStatement(context)).toContain(
      "That label's delimiter records which plate descends: Cocos subducts beneath North America, read back as the model wrote it rather than measured."
    );
  });

  it("says nothing about descent when the label records no subduction", () => {
    // "PA-NA" is a non-subducting step; reporting an absence would read as a
    // finding that the boundary does not subduct, which PB2002 never states.
    const statement = nearestPlateBoundaryStatement(
      nearestPlateBoundary([boundary()], { latitude: 1, longitude: 5 })
    );

    expect(statement).not.toContain("descends");
    expect(statement).not.toContain("subducts beneath");
  });

  it("says the distance is to digitized linework, not a mapped margin", () => {
    const statement = nearestPlateBoundaryStatement(
      nearestPlateBoundary([boundary()], { latitude: 1, longitude: 5 })
    );

    expect(statement).toContain("digitized linework");
    expect(statement).toContain("not to a mapped plate margin");
    // Never a hazard, activity, or boundary-type claim.
    expect(statement).toMatch(/no boundary type, motion, activity, or hazard/);
  });

  it("reports an unlabeled supplied boundary as unlabeled rather than guessing", () => {
    const context = nearestPlateBoundary([boundary({ name: "  " })], {
      latitude: 1,
      longitude: 5,
    });

    expect(nearestPlateBoundaryStatement(context)).toContain(
      UNLABELED_PLATE_BOUNDARY_TEXT
    );
  });

  it("keeps one decimal under 10 km and whole kilometres above it", () => {
    // 0.05° north of the equatorial segment ≈ 5.6 km.
    const close = nearestPlateBoundary([boundary()], {
      latitude: 0.05,
      longitude: 5,
    });
    expect(nearestPlateBoundaryStatement(close)).toContain(
      `${(DEG_KM * 0.05).toFixed(1)} km`
    );

    const far = nearestPlateBoundary([boundary()], {
      latitude: 5,
      longitude: 5,
    });
    expect(nearestPlateBoundaryStatement(far)).toContain(
      `${Math.round(DEG_KM * 5)} km`
    );
  });

  it("returns null when no distance was measured", () => {
    // An unusable query and an empty overlay are both "not measured"; the
    // caller keeps its own wording instead of printing a fabricated distance.
    expect(
      nearestPlateBoundaryStatement(
        nearestPlateBoundary([boundary()], { latitude: 91, longitude: 5 })
      )
    ).toBeNull();
    expect(
      nearestPlateBoundaryStatement(
        nearestPlateBoundary([], { latitude: 1, longitude: 5 })
      )
    ).toBeNull();
  });

  it("names the point the distance is measured from, never as a search centre", () => {
    // The same panel prints seismicity distances "from the search-extent
    // centre" (a bounding-box midpoint). This one is measured from the
    // geocoder's own point for the place, and the two are routinely tens to
    // hundreds of km apart, so this sentence must not borrow that wording.
    const statement = nearestPlateBoundaryStatement(
      nearestPlateBoundary([boundary()], placePointPlateQuery(1, 5))
    );

    expect(statement).toContain("km from the geocoded place point.");
    expect(statement).toContain(
      "measured from the coordinates the geocoder returned for this place rather than from the centre of its bounding box"
    );
    expect(statement).not.toContain("search centre");
  });

  it("says the search has no distance limit, and still reports a very distant nearest", () => {
    // The sibling proximity readout in the same panel caps its search at a
    // stated 100 km radius. This one does not cap at all, and it renders only
    // when nothing crosses the extent — the case where the global minimum is
    // routinely four digits — so a reader must be able to tell that a large
    // figure is the model's true nearest, not a near miss inside some radius.
    const remote = nearestPlateBoundaryStatement(
      nearestPlateBoundary([boundary()], placePointPlateQuery(24, 5))
    );

    expect(remote).toContain("The search applies no distance limit");
    expect(remote).toContain(
      "the closest polyline anywhere in the supplied model rather than one found within a set radius"
    );
    // Reported, not suppressed: ~24° from the equatorial segment.
    expect(remote).toContain(`${Math.round(DEG_KM * 24)} km`);
  });
});

describe("placePointPlateQuery", () => {
  it("carries the geocoded place coordinates through unchanged", () => {
    // The constructor exists so this module owns the meaning of its anchor;
    // it must not adjust the point it is given.
    expect(placePointPlateQuery(-33.45, -70.67)).toEqual({
      latitude: -33.45,
      longitude: -70.67,
    });
  });
});
