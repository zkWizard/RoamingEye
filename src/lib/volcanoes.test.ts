import { describe, it, expect } from "vitest";
import {
  parseVolcanoList,
  parseVolcanoDataset,
  eruptionClass,
  elevationRegime,
  elevationRegimeLabel,
  lastEruptionLabel,
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
    expect(eruptionClass(0)).toBe("holocene");
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

describe("lastEruptionLabel", () => {
  it("states CE years plainly", () => {
    expect(lastEruptionLabel(2025)).toBe("last erupted 2025");
    expect(lastEruptionLabel(79)).toBe("last erupted 79");
  });

  it("marks BCE years", () => {
    expect(lastEruptionLabel(-6850)).toBe("last erupted 6850 BCE");
  });

  it("is honest about undated volcanoes", () => {
    expect(lastEruptionLabel(null)).toBe("Holocene evidence only");
  });
});

describe("volcanoHoverLabel", () => {
  it("joins name, type, and eruption recency", () => {
    expect(volcanoHoverLabel(parseVolcanoList([volcano()])[0])).toBe(
      "Etna · Stratovolcano · last erupted 2025"
    );
  });

  it("skips a missing type", () => {
    const v = parseVolcanoList([
      volcano({ type: null, lastEruptionYear: null }),
    ])[0];
    expect(volcanoHoverLabel(v)).toBe("Etna · Holocene evidence only");
  });
});
