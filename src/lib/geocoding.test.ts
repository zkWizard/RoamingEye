import { describe, it, expect } from "vitest";
import { buildSearchUrl } from "./geocoding";

describe("buildSearchUrl", () => {
  it("targets Nominatim and requests boundary polygons", () => {
    const url = buildSearchUrl("Toledo, Spain");
    expect(url).toContain("nominatim.openstreetmap.org/search");
    expect(url).toContain("polygon_geojson=1");
    expect(url).toContain("format=jsonv2");
  });

  it("encodes the query and applies the limit", () => {
    const url = buildSearchUrl("São Paulo", 3);
    expect(url).toContain("q=S%C3%A3o+Paulo");
    expect(url).toContain("limit=3");
  });
});
