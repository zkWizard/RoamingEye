import { describe, expect, it } from "vitest";
import type { Volcano } from "./volcanoes";
import {
  GVP_HOLOCENE_VOLCANO_SOURCE,
  NEAREST_VOLCANO_RADIUS_KM,
  VOLCANO_PROXIMITY_UNITS,
  nearbyVolcanoContext,
  nearestVolcanoStatement,
  placePointVolcanoQuery,
} from "./volcanoProximityContext";

const volcano = (overrides: Partial<Volcano> = {}): Volcano => ({
  name: "Test Volcano",
  lat: 0,
  lon: 0,
  type: "Stratovolcano",
  elevation: 1500,
  lastEruptionYear: 2000,
  country: "Testland",
  ...overrides,
});

describe("nearbyVolcanoContext", () => {
  it("selects antimeridian-near summits, orders them by distance, and retains GVP provenance", () => {
    const context = nearbyVolcanoContext(
      [
        volcano({ name: "West of line", lon: -179.95, lastEruptionYear: 1950 }),
        volcano({ name: "East of line", lon: 179.9, lastEruptionYear: 1800 }),
        volcano({ name: "Outside radius", lon: 170 }),
      ],
      { latitude: 0, longitude: 179.8, radiusKm: 40 }
    );

    expect(context).toMatchObject({
      kind: "gvp-nearby-volcano-context",
      isForecast: false,
      coverage: {
        status: "available",
        suppliedRecordCount: 3,
        validRecordCount: 3,
        matchedRecordCount: 2,
        invalidQueryFields: [],
      },
      provenance: GVP_HOLOCENE_VOLCANO_SOURCE,
      units: VOLCANO_PROXIMITY_UNITS,
    });
    expect(context.observations.map(({ name }) => name)).toEqual([
      "East of line",
      "West of line",
    ]);
    expect(context.nearest).toMatchObject({
      name: "East of line",
      eruptionClass: "historic",
      distanceKm: expect.closeTo(11.12, 2),
    });
    expect(context.limitations.join(" ")).toContain(
      "not a complete record of every volcanic feature"
    );
  });

  it("includes a summit exactly on the radius boundary", () => {
    const nearby = volcano({ name: "On boundary", lat: 0, lon: 0 });
    const query = { latitude: 0, longitude: 0, radiusKm: 0 };
    const context = nearbyVolcanoContext([nearby], query);

    expect(context.coverage.matchedRecordCount).toBe(1);
    expect(context.nearest).toMatchObject({
      name: "On boundary",
      distanceKm: 0,
    });
  });

  it("breaks distance ties by most recent eruption, then name", () => {
    const context = nearbyVolcanoContext(
      [
        volcano({ name: "Zulu", lastEruptionYear: 1500 }),
        volcano({ name: "Alpha", lastEruptionYear: null }),
        volcano({ name: "Mike", lastEruptionYear: 2010 }),
        volcano({ name: "Bravo", lastEruptionYear: null }),
      ],
      { latitude: 0, longitude: 0, radiusKm: 5 }
    );

    // All four sit at the query point (distance 0): most recent first, then
    // Holocene-only records (no dated eruption) last, alphabetized among ties.
    expect(context.observations.map(({ name }) => name)).toEqual([
      "Mike",
      "Zulu",
      "Alpha",
      "Bravo",
    ]);
  });

  it("classifies eruption recency and labels Holocene-only records honestly", () => {
    const context = nearbyVolcanoContext(
      [
        volcano({ name: "Recent", lastEruptionYear: 2021 }),
        volcano({ name: "Historic", lastEruptionYear: 79 }),
        volcano({ name: "Ancient", lastEruptionYear: -5000 }),
        volcano({ name: "Undated", lastEruptionYear: null }),
      ],
      { latitude: 0, longitude: 0, radiusKm: 5 }
    );

    const byName = new Map(context.observations.map((o) => [o.name, o]));
    expect(byName.get("Recent")).toMatchObject({
      eruptionClass: "recent",
      lastEruptionText: "last erupted 2021",
    });
    expect(byName.get("Historic")).toMatchObject({ eruptionClass: "historic" });
    expect(byName.get("Ancient")).toMatchObject({
      eruptionClass: "holocene",
      lastEruptionText: "last erupted 5000 BCE",
    });
    expect(byName.get("Undated")).toMatchObject({
      eruptionClass: "holocene",
      lastEruptionText: "Holocene evidence only",
    });
  });

  it("reports no-volcanoes-in-radius when valid records exist but none match", () => {
    const context = nearbyVolcanoContext(
      [volcano({ name: "Far", lat: 80, lon: 100 })],
      { latitude: 0, longitude: 0, radiusKm: 50 }
    );

    expect(context.coverage.status).toBe("no-volcanoes-in-radius");
    expect(context.nearest).toBeNull();
    expect(context.observations).toEqual([]);
  });

  it("reports no-usable-volcanoes when every supplied record is malformed", () => {
    const context = nearbyVolcanoContext(
      [
        volcano({ name: "", lat: 0, lon: 0 }),
        volcano({ name: "Bad lat", lat: 999, lon: 0 }),
        volcano({ name: "NaN lon", lon: Number.NaN }),
      ],
      { latitude: 0, longitude: 0, radiusKm: 100 }
    );

    expect(context.coverage).toMatchObject({
      status: "no-usable-volcanoes",
      suppliedRecordCount: 3,
      validRecordCount: 0,
      matchedRecordCount: 0,
    });
  });

  it("flags each invalid query field and returns no observations", () => {
    const context = nearbyVolcanoContext([volcano()], {
      latitude: 95,
      longitude: 400,
      radiusKm: -10,
    });

    expect(context.coverage.status).toBe("invalid-query");
    expect(context.coverage.invalidQueryFields).toEqual([
      "latitude",
      "longitude",
      "radiusKm",
    ]);
    expect(context.observations).toEqual([]);
    expect(context.nearest).toBeNull();
  });
});

describe("nearestVolcanoStatement", () => {
  const query = { latitude: 0, longitude: 0, radiusKm: 100 };

  it("names the nearest volcano with its distance, type, and eruption text", () => {
    const context = nearbyVolcanoContext(
      [
        volcano({ name: "Far", lon: 0.8 }),
        volcano({ name: "Near", lon: 0.5, type: "Caldera" }),
      ],
      query
    );

    expect(nearestVolcanoStatement(context)).toBe(
      "Nearest catalogued Holocene volcano within 100 km: Near, 56 km from the geocoded place point (Caldera; last erupted 2000). Summit great-circle distance, measured from the coordinates the geocoder returned for this place rather than from the centre of its bounding box, and not a hazard footprint."
    );
  });

  it("keeps a missing GVP primary type explicit rather than guessing one", () => {
    const context = nearbyVolcanoContext(
      [volcano({ name: "Untyped", lon: 0.5, type: null })],
      query
    );

    expect(nearestVolcanoStatement(context)).toContain(
      "(primary type not supplied; last erupted 2000)"
    );
  });

  it("spells out a GVP type qualifier instead of printing its punctuation", () => {
    // 221 of the 1196 bundled records carry "(s)"/"(es)"; leaving the marker
    // raw here contradicted the same volcano's hover label on the globe.
    const multiple = nearbyVolcanoContext(
      [volcano({ name: "Cones", lon: 0.5, type: "Pyroclastic cone(s)" })],
      query
    );
    expect(nearestVolcanoStatement(multiple)).toContain(
      "(Pyroclastic cone (multiple landforms); last erupted 2000)"
    );

    const uncertain = nearbyVolcanoContext(
      [volcano({ name: "Maybe", lon: 0.5, type: "Stratovolcano?" })],
      query
    );
    expect(nearestVolcanoStatement(uncertain)).toContain(
      "(Stratovolcano (type uncertain); last erupted 2000)"
    );
  });

  it("reports sub-10 km distances to one decimal", () => {
    const context = nearbyVolcanoContext(
      [volcano({ name: "Close", lon: 0.05 })],
      query
    );

    expect(nearestVolcanoStatement(context)).toContain("Close, 5.6 km");
  });

  it("states an empty radius as absence from the inventory, not inactivity", () => {
    const context = nearbyVolcanoContext([volcano({ lon: 5 })], query);

    expect(context.coverage.status).toBe("no-volcanoes-in-radius");
    expect(nearestVolcanoStatement(context)).toBe(
      "No catalogued Holocene volcano lies within 100 km of the geocoded place point — the coordinates the geocoder returned for this place, not the centre of its bounding box; absence from the GVP inventory does not establish that a place is volcanically inactive."
    );
  });

  it("names the point both branches measure from, never as the extent centre", () => {
    // The same panel prints seismicity distances "from the search-extent
    // centre" (a bounding-box midpoint). These two are measured from the
    // geocoder's own point for the place instead, and the two points are
    // routinely tens to hundreds of km apart, so neither sentence may call
    // itself "the search centre".
    const found = nearbyVolcanoContext(
      [volcano({ name: "Near", lon: 0.5 })],
      query
    );
    const empty = nearbyVolcanoContext([volcano({ lon: 5 })], query);

    for (const statement of [
      nearestVolcanoStatement(found),
      nearestVolcanoStatement(empty),
    ]) {
      expect(statement).toContain("the geocoded place point");
      expect(statement).toContain("the centre of its bounding box");
      expect(statement).not.toContain("search centre");
    }
  });

  it("declines to speak when the query or the supplied records are unusable", () => {
    const invalidQuery = nearbyVolcanoContext([volcano()], {
      latitude: 95,
      longitude: 0,
      radiusKm: 100,
    });
    const noRecords = nearbyVolcanoContext(
      [volcano({ lat: Number.NaN })],
      query
    );

    expect(invalidQuery.coverage.status).toBe("invalid-query");
    expect(nearestVolcanoStatement(invalidQuery)).toBeNull();
    expect(noRecords.coverage.status).toBe("no-usable-volcanoes");
    expect(nearestVolcanoStatement(noRecords)).toBeNull();
  });

  it("quotes whatever radius the caller queried, including the shared default", () => {
    const context = nearbyVolcanoContext([volcano({ lon: 0.5 })], {
      ...query,
      radiusKm: NEAREST_VOLCANO_RADIUS_KM,
    });

    expect(NEAREST_VOLCANO_RADIUS_KM).toBe(100);
    expect(nearestVolcanoStatement(context)).toContain("within 100 km");
  });
});

describe("placePointVolcanoQuery", () => {
  it("fixes the declared radius and carries the place point through unchanged", () => {
    // The radius lived at the call site before; keeping it here puts the
    // declared cutoff with the reasoning that chose it, and leaves the caller
    // supplying only the geocoded point.
    expect(placePointVolcanoQuery(-33.45, -70.67)).toEqual({
      latitude: -33.45,
      longitude: -70.67,
      radiusKm: NEAREST_VOLCANO_RADIUS_KM,
    });
  });

  it("drives the same statement the panel renders", () => {
    const context = nearbyVolcanoContext(
      [volcano({ name: "Near", lat: 0, lon: 0.5 })],
      placePointVolcanoQuery(0, 0)
    );

    expect(nearestVolcanoStatement(context)).toContain(
      "Nearest catalogued Holocene volcano within 100 km: Near, 56 km from the geocoded place point"
    );
  });
});
