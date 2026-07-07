import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseCityList } from "./cities";
import { parseVolcanoList } from "./volcanoes";
import { parsePlateBoundaries } from "./plates";
import { buildCountryIndex } from "./countryIndex";

/**
 * Guards the real bundled data files in public/data/ — a bad regeneration by
 * scripts/prepare-data.mjs (or a corrupt commit) would otherwise boot fine
 * and silently render empty overlays. Runs through the exact parsers the app
 * uses, in CI via `npm test`.
 */

const DATA_DIR = join(__dirname, "..", "..", "public", "data");
const load = (name: string): unknown =>
  JSON.parse(readFileSync(join(DATA_DIR, name), "utf8"));

describe("bundled data files", () => {
  it("cities.json parses with a sane population of entries", () => {
    const cities = parseCityList(load("cities.json"));
    expect(cities.length).toBeGreaterThanOrEqual(200);
    // The label layer depends on the biggest cities being present & sorted.
    expect(cities[0].pop ?? 0).toBeGreaterThan(10_000_000);
    for (const c of cities.slice(0, 30)) {
      expect(c.name.length).toBeGreaterThan(0);
    }
  });

  it("volcanoes.json parses the Holocene population", () => {
    const volcanoes = parseVolcanoList(load("volcanoes.json"));
    expect(volcanoes.length).toBeGreaterThanOrEqual(1000);
    // The recency coloring needs dated eruptions to be present.
    expect(
      volcanoes.filter((v) => v.lastEruptionYear !== null).length
    ).toBeGreaterThanOrEqual(500);
  });

  it("plate-boundaries.geojson parses into boundary segments", () => {
    const plates = parsePlateBoundaries(load("plate-boundaries.geojson"));
    expect(plates.length).toBeGreaterThanOrEqual(200);
  });

  it("countries.geojson builds a working lookup index", () => {
    const index = buildCountryIndex(
      load("countries.geojson") as Parameters<typeof buildCountryIndex>[0]
    );
    // Spot checks: a large country, an island nation, and open ocean.
    expect(index.lookup(-14.2, -51.9)).toBe("Brazil");
    expect(index.lookup(64.9, -18.6)).toBe("Iceland");
    expect(index.lookup(0, -140)).toBeNull();
  });
});
