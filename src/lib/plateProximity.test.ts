import { describe, expect, it } from "vitest";
import { parsePlateBoundaries, type PlateBoundary } from "./plates";
import { BIRD_2003_PLATE_BOUNDARY_SOURCE } from "./plateBoundaryContext";
import { nearestPlateBoundary, PLATE_PROXIMITY_UNITS } from "./plateProximity";

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
