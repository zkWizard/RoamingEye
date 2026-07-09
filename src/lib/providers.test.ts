import { describe, it, expect } from "vitest";
import {
  PROVIDERS,
  PROVIDER_GROUPS,
  GIBS_ACKNOWLEDGMENT,
  citedDatasets,
} from "./providers";
import { LAYERS, LAYER_ORDER } from "./timeline";
import { HIRES_LAYER } from "./imagery";

describe("PROVIDERS catalogue", () => {
  it("has well-formed entries", () => {
    expect(PROVIDERS.length).toBeGreaterThan(20);
    for (const p of PROVIDERS) {
      expect(p.name).toBeTruthy();
      expect(p.description.length).toBeGreaterThan(10);
      expect(p.url).toMatch(/^https?:\/\//);
      expect(PROVIDER_GROUPS).toContain(p.group);
      expect(["core", "underlying", "ecosystem"]).toContain(p.use);
    }
  });

  it("credits the sources we actually rely on as core", () => {
    const core = PROVIDERS.filter((p) => p.use === "core").map((p) => p.name);
    expect(core.some((n) => n.includes("GIBS"))).toBe(true);
    expect(core.some((n) => n.includes("OpenStreetMap"))).toBe(true);
    expect(core.some((n) => n.includes("Natural Earth"))).toBe(true);
  });
});

describe("dataset citation chain", () => {
  it("every layer names its cited source dataset with a well-formed DOI", () => {
    for (const id of LAYER_ORDER) {
      const dataset = LAYERS[id].dataset;
      expect(dataset, `layer "${id}" has a dataset`).toBeDefined();
      expect(dataset!.doi, id).toMatch(/^10\.\d{4,}\/\S+$/);
      expect(dataset!.shortName, id).toBeTruthy();
      expect(dataset!.version, id).toBeTruthy();
      expect(dataset!.title, id).toBeTruthy();
    }
    expect(HIRES_LAYER.dataset.doi).toMatch(/^10\.\d{4,}\/\S+$/);
  });

  it("deduplicates shared products and attributes every layer", () => {
    const cited = citedDatasets();
    const dois = cited.map((c) => c.dataset.doi);
    expect(new Set(dois).size).toBe(dois.length);
    // NDVI and EVI render the same MOD13A3 product — one entry, two users.
    const mod13 = cited.find((c) => c.dataset.shortName === "MOD13A3");
    expect(mod13?.usedBy).toEqual(["Vegetation (NDVI)", "Vegetation (EVI)"]);
    // Every configured layer (plus the HLS study patch) appears exactly once.
    const allUsers = cited.flatMap((c) => c.usedBy);
    expect(allUsers).toHaveLength(LAYER_ORDER.length + 1);
  });

  it("carries GIBS's acknowledgment verbatim", () => {
    expect(GIBS_ACKNOWLEDGMENT).toContain(
      "Global Imagery Browse Services (GIBS)"
    );
    expect(GIBS_ACKNOWLEDGMENT).toContain(
      "Earth Science Data and Information System (ESDIS)"
    );
  });
});
