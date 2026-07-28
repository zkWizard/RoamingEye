import { describe, expect, it } from "vitest";
import type { Volcano } from "./volcanoes";
import { gvpVolcanoUrl, volcanoesInSearchExtent } from "./volcanoExtent";

const volcano = (overrides: Partial<Volcano> = {}): Volcano => ({
  name: "Etna",
  lat: 37.75,
  lon: 15,
  type: "Stratovolcano",
  elevation: 3357,
  lastEruptionYear: 2025,
  country: "Italy",
  ...overrides,
});

describe("volcanoesInSearchExtent", () => {
  it("returns descriptive GVP records inside inclusive search bounds", () => {
    const context = volcanoesInSearchExtent(
      [
        volcano({ name: "Vesuvius", lat: 40.82, lon: 14.43 }),
        volcano({ name: "Etna", lat: 37.75, lon: 15 }),
        volcano({ name: "Hekla", lat: 63.98, lon: -19.7 }),
      ],
      [37.75, 41, 14.43, 15]
    );

    expect(context).toMatchObject({
      kind: "gvp-search-extent-context",
      status: "available",
      suppliedRecordCount: 3,
      matchedRecordCount: 2,
      geographicCoverage:
        "Coordinates inside the search result bounding box; the exact selected boundary is not tested.",
      provenance: { org: "Smithsonian Institution Global Volcanism Program" },
      units: { elevation: "metres relative to sea level" },
    });
    expect(context.records).toEqual([
      expect.objectContaining({
        name: "Etna",
        lastEruptionText: "last erupted 2025",
        volcanoNumber: null,
        sourceUrl: null,
      }),
      expect.objectContaining({ name: "Vesuvius" }),
    ]);
  });

  it("retains source catalog context and links records by stable GVP number", () => {
    const context = volcanoesInSearchExtent(
      [
        volcano({
          sourceRecord: {
            volcanoNumber: 211060,
            region: "Mediterranean and Western Asia Volcanic Regions",
            subregion: "Italy",
            tectonicSetting: "Subduction zone / Continental crust (> 25 km)",
          },
        }),
      ],
      [37, 38, 14, 16]
    );

    expect(context.records[0]).toMatchObject({
      volcanoNumber: 211060,
      sourceUrl: "https://volcano.si.edu/volcano.cfm?vn=211060",
      region: "Mediterranean and Western Asia Volcanic Regions",
      subregion: "Italy",
      tectonicSetting: "Subduction zone / Continental crust (> 25 km)",
    });
    expect(context.limitations.join(" ")).toContain(
      "retained GVP catalog labels"
    );
  });

  it("does not invent a source URL without a valid GVP number", () => {
    expect(gvpVolcanoUrl(null)).toBeNull();
    expect(gvpVolcanoUrl(211060.5)).toBeNull();
  });

  it("includes both sides of an antimeridian-crossing search box", () => {
    const context = volcanoesInSearchExtent(
      [
        volcano({ name: "East", lat: 10, lon: 179 }),
        volcano({ name: "West", lat: 10, lon: -179 }),
        volcano({ name: "Middle", lat: 10, lon: 0 }),
      ],
      [0, 20, 170, -170]
    );

    expect(context.crossesAntimeridian).toBe(true);
    expect(context.records.map(({ name }) => name)).toEqual(["East", "West"]);
  });

  it("keeps an empty supplied dataset distinct from an empty search extent", () => {
    expect(volcanoesInSearchExtent([], [0, 10, 0, 10])).toMatchObject({
      status: "available",
      suppliedRecordCount: 0,
      matchedRecordCount: 0,
    });
    expect(volcanoesInSearchExtent([volcano()], [0, 10, 0, 10])).toMatchObject({
      status: "available",
      suppliedRecordCount: 1,
      matchedRecordCount: 0,
    });
  });

  it("does not silently broaden a missing or invalid bounding box", () => {
    expect(volcanoesInSearchExtent([volcano()], null)).toMatchObject({
      status: "invalid-bounds",
      suppliedRecordCount: 1,
      matchedRecordCount: 0,
      bounds: null,
    });
    expect(volcanoesInSearchExtent([volcano()], [20, 10, 0, 10])).toMatchObject(
      { status: "invalid-bounds", matchedRecordCount: 0 }
    );
  });
});
