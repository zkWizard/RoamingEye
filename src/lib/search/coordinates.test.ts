import { describe, expect, it } from "vitest";
import { parseCoordinateQuery } from "./coordinates";

describe("parseCoordinateQuery", () => {
  it("reads a lat, lon pair and keeps that order", () => {
    expect(parseCoordinateQuery("40.7, -74")).toEqual({ lat: 40.7, lon: -74 });
    expect(parseCoordinateQuery("40.7 -74")).toEqual({ lat: 40.7, lon: -74 });
    // 74 is a legal latitude. The pair is not swapped into a longitude.
    expect(parseCoordinateQuery("74, 40")).toEqual({ lat: 74, lon: 40 });
  });

  it("rejects values outside the geographic ranges, and extra words", () => {
    expect(parseCoordinateQuery("95, 10")).toBeNull();
    expect(parseCoordinateQuery("10, 200")).toBeNull();
    expect(parseCoordinateQuery("near 40.7, -74")).toBeNull();
  });
});
