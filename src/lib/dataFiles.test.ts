import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseCityList } from "./cities";
import {
  ERUPTION_CLASS_LABELS,
  eruptionClass,
  parseVolcanoDataset,
} from "./volcanoes";
import { canonicalVolcanoType } from "./volcanoMorphology";
import { PROVIDERS } from "./providers";
import { parsePlateBoundaries, plateBoundaryClass } from "./plates";
import { decodePlatePair } from "./platePairs";
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
    const dataset = parseVolcanoDataset(load("volcanoes.json"));
    const volcanoes = dataset.volcanoes;
    expect(volcanoes.length).toBeGreaterThanOrEqual(1000);
    expect(dataset.provenance).not.toBeNull();
    expect(dataset.dataMonth).toMatch(/^\d{4}-\d{2}$/);
    // The recency coloring needs dated eruptions to be present.
    expect(
      volcanoes.filter((v) => v.lastEruptionYear !== null).length
    ).toBeGreaterThanOrEqual(500);
  });

  it("the GVP provider caption describes the bundled records honestly", () => {
    // The providers page renders this description verbatim, so it is a science
    // claim about the shipped snapshot. GVP's inventory is Holocene *activity*,
    // and a large minority of it carries no dated eruption — a caption saying
    // "with eruption history" would assert one for every record. Measured
    // against the real file through the app's own parser, so a regeneration
    // that moved the fraction out of "about a third" fails here.
    const volcanoes = parseVolcanoDataset(load("volcanoes.json")).volcanoes;
    const undated = volcanoes.filter((v) => v.lastEruptionYear === null);
    const undatedShare = undated.length / volcanoes.length;
    expect(undatedShare).toBeGreaterThan(0.2);
    expect(undatedShare).toBeLessThan(0.45);

    const gvp = PROVIDERS.find((p) =>
      p.name.includes("Global Volcanism Program")
    );
    expect(gvp).toBeDefined();
    // Must not claim a dated eruption for the whole population.
    expect(gvp?.description).not.toMatch(/volcanoes with eruption history/i);
    expect(gvp?.description).toMatch(/no dated eruption/i);
  });

  it("every volcanoes.json type label canonicalizes to a clean landform", () => {
    const { volcanoes } = parseVolcanoDataset(load("volcanoes.json"));
    // volcanoHoverLabel() renders the canonical base directly, so a
    // regeneration that introduced a qualifier form the parser does not
    // recognize would leak raw punctuation into the tooltip and split the
    // type tallies into a spurious extra bucket. A clean base is plain words;
    // anything else is a GVP vocabulary change that deserves a human read.
    // "Shield(pyroclastic)" is the one reviewed exception: its parenthetical
    // qualifies the landform rather than marking multiplicity, so the parser
    // is right to preserve it.
    const REVIEWED_EXCEPTIONS = ["Shield(pyroclastic)"];
    const bases = new Set(
      volcanoes
        .map((volcano) => canonicalVolcanoType(volcano.type).base)
        .filter((base): base is string => base !== null)
    );
    const unexpected = [...bases]
      .filter((base) => !/^[A-Za-z][A-Za-z -]*$/.test(base))
      .sort();
    expect(unexpected).toEqual(REVIEWED_EXCEPTIONS);
  });

  it("the legend's eruption bands describe the bundled records honestly", () => {
    // Evidence for why the violet band is not labelled "Holocene only": in the
    // shipped GVP snapshot a substantial minority of that class carries a
    // *dated* BCE eruption year, so a "no dated eruption" reading is wrong for
    // it. Measured against the real file through the app's own parser.
    const volcanoes = parseVolcanoDataset(load("volcanoes.json")).volcanoes;
    const inClass = (c: string) =>
      volcanoes.filter((v) => eruptionClass(v.lastEruptionYear) === c);

    const holocene = inClass("holocene");
    const datedBce = holocene.filter((v) => (v.lastEruptionYear ?? 0) < 0);
    const undated = holocene.filter((v) => v.lastEruptionYear === null);
    expect(datedBce.length + undated.length).toBe(holocene.length);
    // Both states are well populated, so the label must not claim either one.
    expect(datedBce.length).toBeGreaterThanOrEqual(100);
    expect(undated.length).toBeGreaterThanOrEqual(100);
    expect(ERUPTION_CLASS_LABELS.holocene).not.toMatch(/holocene only/i);

    // Every dated record in the band really is BCE, as the label says.
    for (const v of datedBce) expect(v.lastEruptionYear).toBeLessThan(0);

    // The historic band's label starts at year 0, not 1 CE, because GVP ships
    // a source-year-zero record that eruptionClass puts there.
    const historic = inClass("historic");
    for (const v of historic) {
      expect(v.lastEruptionYear).toBeGreaterThanOrEqual(0);
      expect(v.lastEruptionYear).toBeLessThanOrEqual(1899);
    }
    expect(historic.some((v) => v.lastEruptionYear === 0)).toBe(true);

    for (const v of inClass("recent")) {
      expect(v.lastEruptionYear).toBeGreaterThanOrEqual(1900);
    }
  });

  it("plate-boundaries.geojson parses into boundary segments", () => {
    const plates = parsePlateBoundaries(load("plate-boundaries.geojson"));
    expect(plates.length).toBeGreaterThanOrEqual(200);
  });

  it("every plate-boundary label decodes to a recognized PB2002 pair", () => {
    const plates = parsePlateBoundaries(load("plate-boundaries.geojson"));
    // The PB2002 decode vocabulary must cover the bundled labels: a bad
    // regeneration that introduced an unknown plate code would fail here
    // rather than silently label a boundary with a plate we cannot name.
    const undecodable = plates
      .map((boundary) => boundary.name)
      .filter((name) => !decodePlatePair(name)?.recognized);
    expect(undecodable).toEqual([]);
  });

  it("carries PB2002's own plate codes, type, and per-step citations", () => {
    const plates = parsePlateBoundaries(load("plate-boundaries.geojson"));
    // A regeneration that dropped the step attributes again would leave the
    // linework rendering fine while silently losing the source's boundary-type
    // marking and its per-step digitization credit.
    expect(plates.every((boundary) => boundary.step !== undefined)).toBe(true);
    expect(plates.filter((boundary) => boundary.step?.plateA === null)).toEqual(
      []
    );
    expect(
      plates.filter((boundary) => plateBoundaryClass(boundary) === "subduction")
        .length
    ).toBeGreaterThanOrEqual(50);
    // PB2002 is a compilation of dozens of separately sourced digitizations.
    const citations = new Set(
      plates
        .map((boundary) => boundary.step?.sourceCitation)
        .filter((citation): citation is string => Boolean(citation))
    );
    expect(citations.size).toBeGreaterThanOrEqual(50);
  });

  it("agrees with the label delimiter on which steps are subduction zones", () => {
    const plates = parsePlateBoundaries(load("plate-boundaries.geojson"));
    // PB2002 writes a subduction step's label with "/" or "\" and every other
    // step's with "-". That is the source's own convention, and its `Type`
    // field is the evidence: the two must not drift apart in the bundled file.
    const disagreeing = plates.filter((boundary) => {
      const separator = decodePlatePair(boundary.name)?.separator;
      const labelledSubduction = separator === "/" || separator === "\\";
      return (
        labelledSubduction !== (plateBoundaryClass(boundary) === "subduction")
      );
    });
    expect(disagreeing.map((boundary) => boundary.name)).toEqual([]);
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
