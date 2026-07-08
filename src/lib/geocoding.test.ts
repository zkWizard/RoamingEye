import { describe, it, expect } from "vitest";
import { makeLru, buildSearchUrl } from "./geocoding";

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

describe("makeLru", () => {
  it("hits, misses, and evicts the least recently used", () => {
    const lru = makeLru<string, number>(2);
    lru.set("a", 1);
    lru.set("b", 2);
    expect(lru.get("a")).toBe(1); // refresh a
    lru.set("c", 3); // evicts b (LRU)
    expect(lru.get("b")).toBeUndefined();
    expect(lru.get("a")).toBe(1);
    expect(lru.get("c")).toBe(3);
    expect(lru.size).toBe(2);
  });

  it("re-setting a key refreshes recency without growing", () => {
    const lru = makeLru<string, number>(2);
    lru.set("a", 1);
    lru.set("b", 2);
    lru.set("a", 10); // refresh + overwrite
    lru.set("c", 3); // evicts b, not a
    expect(lru.get("a")).toBe(10);
    expect(lru.get("b")).toBeUndefined();
  });
});
