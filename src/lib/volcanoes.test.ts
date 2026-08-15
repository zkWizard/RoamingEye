import { describe, it, expect } from "vitest";
import {
  parseVolcanoList,
  parseVolcanoDataset,
  eruptionClass,
  ERUPTION_CLASS_LABELS,
  elevationRegime,
  elevationRegimeLabel,
  lastEruptionLabel,
  summitElevationHoverLabel,
  volcanoHoverLabel,
} from "./volcanoes";

const volcano = (overrides: object = {}) => ({
  name: "Etna",
  lat: 37.748,
  lon: 14.999,
  type: "Stratovolcano",
  elevation: 3357,
  lastEruptionYear: 2025,
  country: "Italy",
  ...overrides,
});

describe("parseVolcanoList", () => {
  it("extracts fields from valid entries", () => {
    const list = parseVolcanoList([volcano()]);
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({
      name: "Etna",
      lat: 37.748,
      lon: 14.999,
      type: "Stratovolcano",
      elevation: 3357,
      lastEruptionYear: 2025,
      country: "Italy",
      sourceRecord: {
        volcanoNumber: null,
        region: null,
        subregion: null,
        tectonicSetting: null,
      },
    });
  });

  it("retains GVP source identity and tectonic labels verbatim", () => {
    const [parsed] = parseVolcanoList([
      volcano({
        volcanoNumber: 211060,
        region: "Mediterranean and Western Asia Volcanic Regions",
        subregion: "Italy",
        tectonicSetting: "Subduction zone / Continental crust (> 25 km)",
      }),
    ]);

    expect(parsed.sourceRecord).toEqual({
      volcanoNumber: 211060,
      region: "Mediterranean and Western Asia Volcanic Regions",
      subregion: "Italy",
      tectonicSetting: "Subduction zone / Continental crust (> 25 km)",
    });
  });

  it("returns [] for non-array input", () => {
    expect(parseVolcanoList(null)).toEqual([]);
    expect(parseVolcanoList("nope")).toEqual([]);
    expect(parseVolcanoList({ features: [] })).toEqual([]);
  });

  it("drops malformed entries but keeps the rest", () => {
    const list = parseVolcanoList([
      volcano(),
      null,
      volcano({ name: "" }), // unnamed
      volcano({ lat: 95 }), // lat out of range
      volcano({ lon: Number.NaN }),
      volcano({ name: "Erebus", lat: -77.53, lon: 167.17 }),
    ]);
    expect(list).toHaveLength(2);
    expect(list[1].name).toBe("Erebus");
  });

  it("nulls optional fields that are missing or wrong-typed", () => {
    const list = parseVolcanoList([
      volcano({
        type: undefined,
        elevation: "high",
        lastEruptionYear: null,
        country: 42,
      }),
    ]);
    expect(list[0]).toMatchObject({
      type: null,
      elevation: null,
      lastEruptionYear: null,
      country: null,
    });
  });
});

describe("parseVolcanoDataset", () => {
  it("preserves snapshot provenance and derives its UTC data month", () => {
    const dataset = parseVolcanoDataset({
      provenance: {
        source: "Smithsonian GVP",
        sourceUrl: "https://volcano.si.edu/",
        service: "GVP-VOTW WFS",
        retrievedAt: "2026-07-16T18:42:00.000Z",
      },
      records: [volcano()],
    });

    expect(dataset.volcanoes).toHaveLength(1);
    expect(dataset.provenance?.service).toBe("GVP-VOTW WFS");
    expect(dataset.dataMonth).toBe("2026-07");
  });

  it("keeps records but marks malformed snapshot metadata unavailable", () => {
    const dataset = parseVolcanoDataset({
      provenance: { retrievedAt: "sometime" },
      records: [volcano()],
    });

    expect(dataset.volcanoes).toHaveLength(1);
    expect(dataset.provenance).toBeNull();
    expect(dataset.dataMonth).toBeNull();
  });

  it("continues to read legacy arrays with unavailable provenance", () => {
    const dataset = parseVolcanoDataset([volcano()]);
    expect(dataset.volcanoes).toHaveLength(1);
    expect(dataset.provenance).toBeNull();
    expect(dataset.dataMonth).toBeNull();
  });
});

describe("eruptionClass", () => {
  it("classifies by most recent eruption year", () => {
    expect(eruptionClass(2025)).toBe("recent");
    expect(eruptionClass(1900)).toBe("recent");
    expect(eruptionClass(1899)).toBe("historic");
    expect(eruptionClass(79)).toBe("historic"); // Vesuvius
    expect(eruptionClass(1)).toBe("historic");
    expect(eruptionClass(0)).toBe("historic");
    expect(eruptionClass(-4360)).toBe("holocene"); // BCE eruptions
    expect(eruptionClass(null)).toBe("holocene");
  });
});

describe("elevationRegime", () => {
  it("reads the summit-elevation datum sign", () => {
    expect(elevationRegime(3357)).toBe("subaerial"); // Etna
    expect(elevationRegime(1)).toBe("subaerial");
    expect(elevationRegime(0)).toBe("sea-level");
    expect(elevationRegime(-1)).toBe("submarine");
    expect(elevationRegime(-2000)).toBe("submarine"); // seamount
  });

  it("treats missing or non-finite elevation as unknown", () => {
    expect(elevationRegime(null)).toBe("unknown");
    expect(elevationRegime(Number.NaN)).toBe("unknown");
    expect(elevationRegime(Number.POSITIVE_INFINITY)).toBe("unknown");
  });
});

describe("elevationRegimeLabel", () => {
  it("states the datum sign relative to sea level", () => {
    expect(elevationRegimeLabel(3357)).toBe(
      "subaerial summit, 3357 m above sea level"
    );
    expect(elevationRegimeLabel(-2000)).toBe(
      "submarine summit, 2000 m below sea level"
    );
    expect(elevationRegimeLabel(0)).toBe("summit at sea level (0 m)");
  });

  it("is honest about missing elevation", () => {
    expect(elevationRegimeLabel(null)).toBe("summit elevation unknown");
    expect(elevationRegimeLabel(Number.NaN)).toBe("summit elevation unknown");
  });
});

describe("summitElevationHoverLabel", () => {
  it("leaves a summit above the datum in its bare native form", () => {
    expect(summitElevationHoverLabel(3357)).toBe("summit elevation 3357 m");
    expect(summitElevationHoverLabel(1)).toBe("summit elevation 1 m");
  });

  it("reads a negative GVP height as a summit below sea level", () => {
    // Axial Seamount, the bundled snapshot's rift-zone case.
    expect(summitElevationHoverLabel(-1410)).toBe(
      "summit elevation 1410 m below sea level"
    );
    // Udintsev Transform, the deepest summit GVP supplies.
    expect(summitElevationHoverLabel(-5700)).toBe(
      "summit elevation 5700 m below sea level"
    );
    // Kuwae: a shallow negative is the value most easily misread as a typo.
    expect(summitElevationHoverLabel(-2)).toBe(
      "summit elevation 2 m below sea level"
    );
  });

  it("never renders the minus sign it decoded", () => {
    expect(summitElevationHoverLabel(-1410)).not.toContain("-");
  });

  it("marks an exact zero as the datum, not as a missing value", () => {
    // Zealandia Bank is the one bundled record reported at 0 m.
    expect(summitElevationHoverLabel(0)).toBe(
      "summit elevation 0 m (sea level)"
    );
    expect(summitElevationHoverLabel(0)).not.toBe(
      summitElevationHoverLabel(null)
    );
  });

  it("is honest about missing or non-finite elevation", () => {
    expect(summitElevationHoverLabel(null)).toBe(
      "summit elevation not recorded"
    );
    expect(summitElevationHoverLabel(Number.NaN)).toBe(
      "summit elevation not recorded"
    );
  });
});

describe("lastEruptionLabel", () => {
  it("states CE years plainly", () => {
    expect(lastEruptionLabel(2025)).toBe("last erupted 2025");
    expect(lastEruptionLabel(79)).toBe("last erupted 79");
  });

  it("marks BCE years", () => {
    expect(lastEruptionLabel(-6850)).toBe("last erupted 6850 BCE");
  });

  it("preserves source year zero without inventing 0 BCE", () => {
    expect(lastEruptionLabel(0)).toBe(
      "last eruption year 0 (source value; era not converted)"
    );
    expect(lastEruptionLabel(0)).not.toContain("BCE");
  });

  it("is honest about undated volcanoes", () => {
    expect(lastEruptionLabel(null)).toBe("Holocene evidence only");
    expect(lastEruptionLabel(Number.NaN)).toBe("Holocene evidence only");
  });
});

describe("volcanoHoverLabel", () => {
  it("preserves source geography, native summit units, and eruption recency", () => {
    expect(volcanoHoverLabel(parseVolcanoList([volcano()])[0])).toBe(
      "Etna · Stratovolcano · Italy · summit elevation 3357 m · last erupted 2025 · tectonic setting not recorded"
    );
  });

  it("decodes a submarine summit rather than showing a negative height", () => {
    // Ahyi: a subduction-zone volcano that erupted in the instrumental era with
    // its summit under water, so the marker is both prominent and misreadable.
    const label = volcanoHoverLabel(
      parseVolcanoList([
        volcano({ name: "Ahyi", elevation: -55, lastEruptionYear: 2026 }),
      ])[0]
    );
    expect(label).toContain("summit elevation 55 m below sea level");
    expect(label).not.toContain("-55");
  });

  it("names the GVP tectonic setting recorded for the site, and credits GVP", () => {
    // Every other item on this line is RoamingEye's own reading of the record,
    // so the retained catalog judgement says whose it is rather than reading as
    // a setting the app derived from where the marker sits.
    expect(
      volcanoHoverLabel(
        parseVolcanoList([
          volcano({
            tectonicSetting: "Subduction zone / Continental crust (> 25 km)",
          }),
        ])[0]
      )
    ).toBe(
      "Etna · Stratovolcano · Italy · summit elevation 3357 m · last erupted 2025 · GVP setting: subduction zone, continental crust"
    );
  });

  it("credits no catalog when GVP recorded no setting", () => {
    const label = volcanoHoverLabel(parseVolcanoList([volcano()])[0]);
    expect(label).toContain("tectonic setting not recorded");
    expect(label).not.toContain("GVP");
  });

  it("explains GVP multiplicity and uncertainty qualifiers", () => {
    expect(
      volcanoHoverLabel(
        parseVolcanoList([volcano({ type: "Stratovolcano(es)?" })])[0]
      )
    ).toBe(
      "Etna · Stratovolcano (multiple landforms; type uncertain) · Italy · summit elevation 3357 m · last erupted 2025 · tectonic setting not recorded"
    );
  });

  it("states unavailable source fields instead of silently omitting them", () => {
    const v = parseVolcanoList([
      volcano({
        type: null,
        country: null,
        elevation: null,
        lastEruptionYear: null,
      }),
    ])[0];
    expect(volcanoHoverLabel(v)).toBe(
      "Etna · volcano type not recorded · country/territory not recorded · summit elevation not recorded · Holocene evidence only · tectonic setting not recorded"
    );
  });

  it("shows the GVP source-year convention for a year-zero record", () => {
    const v = parseVolcanoList([
      volcano({ name: "Arxan-Chaihe", lastEruptionYear: 0 }),
    ])[0];
    expect(volcanoHoverLabel(v)).toContain(
      "last eruption year 0 (source value; era not converted)"
    );
    expect(volcanoHoverLabel(v)).not.toContain("0 BCE");
  });

  it("retains zero and negative summit elevations in native metres", () => {
    expect(
      volcanoHoverLabel(
        parseVolcanoList([volcano({ elevation: 0, country: "Tonga" })])[0]
      )
    ).toContain("summit elevation 0 m");
    // The magnitude is still GVP's native metres and is neither dropped nor
    // clamped to zero; only the datum sign is spelled out instead of being left
    // as a bare minus for the reader to interpret.
    expect(
      volcanoHoverLabel(
        parseVolcanoList([volcano({ elevation: -55, country: "Tonga" })])[0]
      )
    ).toContain("55 m below sea level");
  });
});

describe("ERUPTION_CLASS_LABELS", () => {
  it("names a band eruptionClass actually assigns, at every boundary", () => {
    // "since 1900" — inclusive lower bound, open above.
    expect(eruptionClass(1900)).toBe("recent");
    expect(eruptionClass(2025)).toBe("recent");
    expect(eruptionClass(1899)).not.toBe("recent");

    // "year 0–1899" — both bounds inclusive, and year 0 really is inside it,
    // so the label may not start the band at 1 CE.
    expect(eruptionClass(0)).toBe("historic");
    expect(eruptionClass(1899)).toBe("historic");
    expect(eruptionClass(-1)).not.toBe("historic");

    // "BCE or undated" — the class merges dated-BCE with no-dated-eruption.
    expect(eruptionClass(-1)).toBe("holocene");
    expect(eruptionClass(-9450)).toBe("holocene");
    expect(eruptionClass(null)).toBe("holocene");
  });

  it("does not call the merged bucket 'Holocene only'", () => {
    // A BCE year is a *dated* eruption, so a label reading "no dated eruption"
    // would misdescribe it. lastEruptionLabel reports the same record as dated.
    expect(lastEruptionLabel(-9450)).toBe("last erupted 9450 BCE");
    expect(eruptionClass(-9450)).toBe("holocene");
    expect(ERUPTION_CLASS_LABELS.holocene).not.toMatch(/holocene only/i);
    expect(ERUPTION_CLASS_LABELS.holocene).toMatch(/BCE/);
  });

  it("labels every class exactly once, with no empty label", () => {
    const labels = Object.values(ERUPTION_CLASS_LABELS);
    expect(Object.keys(ERUPTION_CLASS_LABELS).sort()).toEqual([
      "historic",
      "holocene",
      "recent",
    ]);
    expect(new Set(labels).size).toBe(labels.length);
    for (const label of labels) expect(label.trim().length).toBeGreaterThan(0);
  });
});
