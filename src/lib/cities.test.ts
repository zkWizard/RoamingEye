import { describe, it, expect } from "vitest";
import {
  parseCityList,
  cityHoverLabel,
  labelOpacity,
  LABEL_COUNT,
} from "./cities";

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

describe("labelOpacity", () => {
  it("is fully opaque at close zoom", () => {
    expect(labelOpacity(1.06)).toBe(1);
    expect(labelOpacity(1.7)).toBe(1);
  });

  it("is zero from orbit (including the default view at 3.2)", () => {
    expect(labelOpacity(2.15)).toBe(0);
    expect(labelOpacity(3.2)).toBe(0);
    expect(labelOpacity(4.5)).toBe(0);
  });

  it("fades linearly between the thresholds", () => {
    const mid = labelOpacity((1.7 + 2.15) / 2);
    expect(mid).toBeGreaterThan(0.49);
    expect(mid).toBeLessThan(0.51);
    expect(labelOpacity(2.0)).toBeGreaterThan(labelOpacity(2.1));
  });

  it("labels a bounded number of cities", () => {
    expect(LABEL_COUNT).toBeGreaterThan(0);
    expect(LABEL_COUNT).toBeLessThanOrEqual(50);
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
