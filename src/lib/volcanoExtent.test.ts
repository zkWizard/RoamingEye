import { describe, expect, it } from "vitest";
import type { Volcano } from "./volcanoes";
import {
  gvpCatalogRegionLabel,
  gvpVolcanoUrl,
  suppliedRecordPopulationText,
  volcanoCoordinateLabel,
  volcanoesInSearchExtent,
} from "./volcanoExtent";

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
  it("preserves a source year zero without presenting a nonexistent 0 BCE", () => {
    const context = volcanoesInSearchExtent(
      [
        volcano({
          name: "Arxan-Chaihe",
          lat: 47.45,
          lon: 120.8,
          lastEruptionYear: 0,
        }),
      ],
      [40, 50, 115, 125]
    );

    expect(context.records[0].lastEruptionText).toBe(
      "last eruption year 0 (source value; era not converted)"
    );
    expect(context.units.lastEruptionYear).toContain("zero is preserved");
  });

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
      elevationCoverage: {
        presentCount: 2,
        missingCount: 0,
        fraction: 1,
      },
      geographicCoverage:
        "Coordinates inside the search result bounding box, about 361 km north–south and 49.0 km east–west at its mid-latitude; the exact selected boundary is not tested.",
      provenance: { org: "Smithsonian Institution Global Volcanism Program" },
      units: { elevation: "metres relative to sea level" },
    });
    expect(context.records).toEqual([
      expect.objectContaining({
        name: "Etna",
        lastEruptionYear: 2025,
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

  it("preserves the raw GVP eruption year beside its display label", () => {
    const context = volcanoesInSearchExtent(
      [
        volcano({
          name: "Dated BCE",
          lastEruptionYear: -1250,
        }),
        volcano({
          name: "Undated Holocene",
          lastEruptionYear: null,
        }),
      ],
      [37, 38, 14, 16]
    );

    expect(context.records).toEqual([
      expect.objectContaining({
        name: "Dated BCE",
        lastEruptionYear: -1250,
        lastEruptionText: "last erupted 1250 BCE",
      }),
      expect.objectContaining({
        name: "Undated Holocene",
        lastEruptionYear: null,
        lastEruptionText: "Holocene evidence only",
      }),
    ]);
    expect(context.units.lastEruptionYear).toBe(
      "source calendar year; negative values are BCE and zero is preserved without era conversion"
    );
  });

  it("does not invent a source URL without a valid GVP number", () => {
    expect(gvpVolcanoUrl(null)).toBeNull();
    expect(gvpVolcanoUrl(211060.5)).toBeNull();
  });

  it("retains native record coordinates and labels their hemispheres", () => {
    const context = volcanoesInSearchExtent(
      [volcano({ lat: -0.25, lon: -78.5 })],
      [-1, 1, -79, -78]
    );

    expect(context.records[0]).toMatchObject({
      latitudeDegrees: -0.25,
      longitudeDegrees: -78.5,
    });
    expect(volcanoCoordinateLabel(context.records[0]!)).toBe(
      "0.25° S, 78.50° W"
    );
    expect(
      volcanoCoordinateLabel({ latitudeDegrees: 0, longitudeDegrees: 0 })
    ).toBe("0.00° N, 0.00° E");
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
      elevationCoverage: {
        presentCount: 0,
        missingCount: 0,
        fraction: null,
      },
    });
    expect(volcanoesInSearchExtent([volcano()], [0, 10, 0, 10])).toMatchObject({
      status: "available",
      suppliedRecordCount: 1,
      matchedRecordCount: 0,
    });
  });

  it("reports partial summit-elevation coverage without filling missing values", () => {
    const context = volcanoesInSearchExtent(
      [
        volcano({ name: "Known", elevation: -120 }),
        volcano({ name: "Missing", elevation: null }),
        volcano({ name: "Outside", lat: 50, elevation: 2400 }),
      ],
      [30, 40, 0, 20]
    );

    expect(context).toMatchObject({
      matchedRecordCount: 2,
      elevationCoverage: {
        presentCount: 1,
        missingCount: 1,
        fraction: 0.5,
      },
    });
    expect(context.records).toEqual([
      expect.objectContaining({ name: "Known", elevationMeters: -120 }),
      expect.objectContaining({ name: "Missing", elevationMeters: null }),
    ]);
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

  it("summarizes eruption recency over every matched record, not the listed few", () => {
    const context = volcanoesInSearchExtent(
      [
        volcano({ name: "A", lat: 35, lon: 10, lastEruptionYear: 2011 }),
        volcano({ name: "B", lat: 35, lon: 11, lastEruptionYear: 1980 }),
        volcano({ name: "C", lat: 35, lon: 12, lastEruptionYear: 1500 }),
        volcano({ name: "D", lat: 35, lon: 13, lastEruptionYear: null }),
        volcano({ name: "E", lat: 35, lon: 14, lastEruptionYear: -900 }),
        // Outside the box: must not reach the recency tally.
        volcano({ name: "Z", lat: 5, lon: 14, lastEruptionYear: 2020 }),
      ],
      [30, 40, 0, 20]
    );

    expect(context.matchedRecordCount).toBe(5);
    expect(context.eruptionRecency).toMatchObject({
      kind: "gvp-eruption-recency-summary",
      isForecast: false,
      volcanoCount: 5,
      // The BCE record is Holocene-evidence-only by class but still dated.
      recencyClassCounts: { recent: 2, historic: 1, holocene: 2 },
      datedEruptionCount: 4,
      undatedCount: 1,
      lastEruptionYear: { min: -900, max: 2011 },
    });
    expect(context.eruptionRecency.limitations.join(" ")).toMatch(/dormancy/i);
  });

  it("reports an empty recency tally rather than omitting it when nothing matched", () => {
    const context = volcanoesInSearchExtent([volcano()], null);

    expect(context.eruptionRecency.volcanoCount).toBe(0);
    expect(context.eruptionRecency.lastEruptionYear).toEqual({
      min: null,
      max: null,
    });
  });

  it("tallies landforms across every matched record, not only the listed ones", () => {
    const context = volcanoesInSearchExtent(
      [
        volcano({ name: "A", type: "Stratovolcano" }),
        volcano({ name: "B", type: "Stratovolcano(es)" }),
        volcano({ name: "C", type: "Shield" }),
        volcano({ name: "D", type: null }),
        // Outside the box: it must not reach the tally.
        volcano({ name: "E", lat: -40, lon: -70, type: "Caldera" }),
      ],
      [37, 38, 14, 16]
    );

    expect(context.typeComposition.totalCount).toBe(4);
    expect(context.typeComposition.tallies).toEqual([
      { base: "Stratovolcano", count: 2 },
      { base: "Shield", count: 1 },
    ]);
    expect(context.typeComposition.recordsWithoutType).toBe(1);
    expect(context.typeComposition.foldedRecordCount).toBe(1);
  });

  it("reports an empty landform tally rather than omitting it when nothing matched", () => {
    const context = volcanoesInSearchExtent([volcano()], null);

    expect(context.typeComposition.totalCount).toBe(0);
    expect(context.typeComposition.tallies).toEqual([]);
  });
});

describe("search extent size in the volcano geographic coverage sentence", () => {
  it("scales a matched-record count by stating the extent it was taken over", () => {
    // The defect this guards: the same "N records" sentence covers a city-sized
    // box and a country-sized one, so a count read without a size is not
    // comparable between places.
    const city = volcanoesInSearchExtent(
      [volcano({ name: "Hekla", lat: 63.98, lon: -19.7 })],
      [64.03, 64.18, -22.05, -21.75]
    );
    const country = volcanoesInSearchExtent(
      [volcano({ name: "Hekla", lat: 63.98, lon: -19.7 })],
      [63.2, 66.6, -24.6, -13.400001]
    );

    expect(city.geographicCoverage).toContain(
      "about 16.7 km north–south and 14.6 km east–west at its mid-latitude"
    );
    expect(country.geographicCoverage).toContain(
      "about 378 km north–south and 528 km east–west at its mid-latitude"
    );
    expect(city.geographicCoverage).not.toBe(country.geographicCoverage);
  });

  it("says nothing about extent size when the bounding box was unusable", () => {
    const context = volcanoesInSearchExtent([volcano()], null);
    expect(context.status).toBe("invalid-bounds");
    expect(context.geographicCoverage).not.toContain("north–south");
  });
});

describe("suppliedRecordPopulationText", () => {
  it("states the searched population when nothing matched", () => {
    // The defect this guards: "No bundled GVP volcano records have coordinates
    // inside this search bounding box" is a negative result, and a negative
    // result cannot be read without the size of the set that produced it.
    const context = volcanoesInSearchExtent(
      [
        volcano({ lat: 50 }),
        volcano({ name: "Fuji", lat: 35.36, lon: 138.73 }),
      ],
      [0, 10, 0, 10]
    );

    expect(context.matchedRecordCount).toBe(0);
    expect(suppliedRecordPopulationText(context)).toBe(
      "Compared against 2 valid bundled records."
    );
  });

  it("states the searched population when records did match", () => {
    // A bare match count is not comparable between places either: the same "1
    // record" reads very differently against 2 searched records and 1,196.
    const context = volcanoesInSearchExtent([volcano()], [30, 40, 0, 20]);

    expect(context.matchedRecordCount).toBe(1);
    expect(suppliedRecordPopulationText(context)).toBe(
      "Counted from 1 valid bundled record."
    );
  });

  it("uses the matched branch's verb only when something matched", () => {
    // The two voices must not converge: "Counted from" claims records were
    // counted, which is false of a search that matched nothing.
    const empty = volcanoesInSearchExtent([volcano()], [0, 10, 0, 10]);
    const matched = volcanoesInSearchExtent([volcano()], [30, 40, 0, 20]);

    expect(suppliedRecordPopulationText(empty)).not.toContain("Counted from");
    expect(suppliedRecordPopulationText(matched)).not.toContain(
      "Compared against"
    );
  });

  it("stays silent when the bounding box was unusable", () => {
    // That branch reports that no geographic comparison was made at all, so a
    // comparison population would describe a search that never ran.
    const context = volcanoesInSearchExtent([volcano()], null);

    expect(context.status).toBe("invalid-bounds");
    expect(suppliedRecordPopulationText(context)).toBeNull();
  });

  it("stays silent when the bundled dataset supplied no valid records", () => {
    // That branch already says the dataset supplied zero valid records; adding
    // "Compared against 0 valid bundled records" would state one figure twice.
    const context = volcanoesInSearchExtent([], [0, 10, 0, 10]);

    expect(context.suppliedRecordCount).toBe(0);
    expect(suppliedRecordPopulationText(context)).toBeNull();
  });

  it("counts every supplied record, not only the ones that matched", () => {
    // Records outside the box were still searched, so they belong in the basis;
    // reporting only the matched ones would make the denominator meaningless.
    const context = volcanoesInSearchExtent(
      [
        volcano({ name: "Inside" }),
        volcano({ name: "Outside", lat: 50 }),
        volcano({ name: "Also outside", lat: 55 }),
      ],
      [30, 40, 0, 20]
    );

    expect(context.matchedRecordCount).toBe(1);
    expect(suppliedRecordPopulationText(context)).toBe(
      "Counted from 3 valid bundled records."
    );
  });
});

describe("gvpCatalogRegionLabel", () => {
  it("attributes a subregion to GVP rather than asserting arc membership", () => {
    expect(
      gvpCatalogRegionLabel({
        region: "Japan, Taiwan, Marianas",
        subregion: "Nankai Volcanic Arc",
      })
    ).toBe("GVP subregion: Nankai Volcanic Arc");
  });

  it("names the region level when no subregion is supplied", () => {
    // GVP treats the two as distinct catalog levels, so a fallback value must
    // not be presented as the finer one.
    expect(
      gvpCatalogRegionLabel({
        region: "Iceland and Arctic Ocean",
        subregion: null,
      })
    ).toBe("GVP region: Iceland and Arctic Ocean");
  });

  it("returns null when neither level is supplied", () => {
    // The caller drops falsy row items; inventing a placeholder here would
    // change that behaviour rather than attribute an existing value.
    expect(gvpCatalogRegionLabel({ region: null, subregion: null })).toBeNull();
  });

  it("falls back to the region when the subregion is blank", () => {
    expect(
      gvpCatalogRegionLabel({
        region: "Mexico and Central America",
        subregion: "",
      })
    ).toBe("GVP region: Mexico and Central America");
  });

  it("never returns a value without naming the catalog it came from", () => {
    const labels = [
      gvpCatalogRegionLabel({ region: "R", subregion: "S" }),
      gvpCatalogRegionLabel({ region: "R", subregion: null }),
    ];
    for (const label of labels) {
      expect(label).toMatch(/^GVP (sub)?region: /);
    }
  });
});
