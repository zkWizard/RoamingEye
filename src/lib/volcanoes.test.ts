import { describe, it, expect } from "vitest";
import { parseVolcanoList, eruptionClass } from "./volcanoes";

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
