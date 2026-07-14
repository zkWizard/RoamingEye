import { describe, expect, it } from "vitest";
import type { Volcano } from "./volcanoes";
import {
  GVP_HOLOCENE_VOLCANO_SOURCE,
  VOLCANO_PROXIMITY_UNITS,
  nearbyVolcanoContext,
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
