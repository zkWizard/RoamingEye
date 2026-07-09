import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseCityList } from "./cities";
import { parseVolcanoList } from "./volcanoes";
import { parsePlateBoundaries } from "./plates";
import { buildAdmin1Index, buildCountryIndex } from "./countryIndex";

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

  it("admin1.geojson names provinces/states across every continent", () => {
    const index = buildAdmin1Index(
      load("admin1.geojson") as Parameters<typeof buildAdmin1Index>[0]
    );
    const probes: [number, number, string, string][] = [
      [50.5, -85.0, "Ontario", "Canada"],
      [31.2, -99.3, "Texas", "United States of America"],
      [48.9, 11.5, "Bayern", "Germany"],
      [-22.5, 144.5, "Queensland", "Australia"],
      [31.5, 88.0, "Xizang", "China"], // Tibet
      [-3.5, 23.0, "Kasaï-Oriental", "Democratic Republic of the Congo"],
      [61.5, 64.0, "Khanty-Mansiy", "Russia"],
      [-14.5, -70.0, "Puno", "Peru"],
    ];
    for (const [lat, lon, name, country] of probes) {
      expect(index.lookup(lat, lon), `${name} @ ${lat},${lon}`).toEqual({
        name,
        country,
      });
    }
    // Ocean stays null — the hover falls back to bare coordinates.
    expect(index.lookup(0, -140)).toBeNull();
  });
});
