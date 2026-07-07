import { describe, it, expect } from "vitest";
import { parseCityList, cityHoverLabel } from "./cities";

const city = (overrides: object = {}) => ({
  name: "Tokyo",
  lat: 35.687,
  lon: 139.7495,
  country: "Japan",
  pop: 35676000,
  capital: true,
  ...overrides,
});

describe("parseCityList", () => {
  it("extracts fields from valid entries", () => {
    const list = parseCityList([city()]);
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({
      name: "Tokyo",
      lat: 35.687,
      lon: 139.7495,
      country: "Japan",
      pop: 35676000,
      capital: true,
    });
  });

  it("returns [] for non-array input", () => {
    expect(parseCityList(null)).toEqual([]);
    expect(parseCityList("nope")).toEqual([]);
    expect(parseCityList({ features: [] })).toEqual([]);
  });

  it("drops malformed entries but keeps the rest", () => {
    const list = parseCityList([
      city(),
      null,
      city({ name: "" }), // unnamed
      city({ lat: 95 }), // lat out of range
      city({ lon: Number.NaN }),
      city({ name: "Reykjavík", lat: 64.15, lon: -21.95 }),
    ]);
    expect(list).toHaveLength(2);
    expect(list[1].name).toBe("Reykjavík");
  });

  it("nulls optional fields that are missing or wrong-typed", () => {
    const list = parseCityList([
      city({ country: 42, pop: "many", capital: "yes" }),
    ]);
    expect(list[0]).toMatchObject({ country: null, pop: null, capital: false });
  });
});

describe("cityHoverLabel", () => {
  it("joins name and country", () => {
    expect(cityHoverLabel(parseCityList([city()])[0])).toBe("Tokyo · Japan");
  });

  it("falls back to the bare name without a country", () => {
    expect(cityHoverLabel(parseCityList([city({ country: null })])[0])).toBe(
      "Tokyo"
    );
  });
});
