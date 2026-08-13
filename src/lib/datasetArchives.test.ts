import { describe, it, expect } from "vitest";
import { archiveCoverageGaps, datasetArchive } from "./datasetArchives";
import { citedDatasets } from "./providers";
import { LAYERS } from "./timeline";

const citedDois = (): string[] =>
  citedDatasets().map(({ dataset }) => dataset.doi);

describe("datasetArchive", () => {
  it("covers every dataset the app cites", () => {
    // A new layer must bring its archive with it, or its citations silently
    // lose their publisher.
    expect(archiveCoverageGaps(citedDois())).toEqual([]);
  });

  it("publishes sea-surface temperature from PO.DAAC, not GIBS", () => {
    // The ocean product is archived by the Physical Oceanography DAAC; GIBS
    // only serves its imagery. Verified by resolving 10.5067/MODSA-MO9D9.
    const sst = LAYERS.sst.dataset;
    expect(sst).toBeDefined();
    const archive = datasetArchive(sst!.doi);
    expect(archive?.abbreviation).toBe("PO.DAAC");
    expect(archive?.name).toContain("Physical Oceanography");
  });

  it("does not infer an archive from the product family", () => {
    // Four MODIS products, three different DAACs — the reason each mapping is
    // read off the DOI's landing page rather than derived from the short name.
    const archiveOf = (id: "ndvi" | "sst" | "snow"): string | undefined =>
      datasetArchive(LAYERS[id].dataset!.doi)?.abbreviation;
    expect(archiveOf("ndvi")).toBe("LP DAAC");
    expect(archiveOf("snow")).toBe("NSIDC DAAC");
    expect(archiveOf("sst")).toBe("PO.DAAC");
  });

  it("names no archive for a DOI the repo has not verified", () => {
    // Silence, not a plausible guess: every cited DOI shares the 10.5067
    // prefix while sitting in four different archives, so a prefix-based
    // fallback would reintroduce the misattribution this registry removes.
    expect(datasetArchive("10.5067/NOT-A-REAL-PRODUCT")).toBeUndefined();
    expect(datasetArchive("")).toBeUndefined();
    expect(archiveCoverageGaps(["10.5067/NOT-A-REAL-PRODUCT"])).toEqual([
      "10.5067/NOT-A-REAL-PRODUCT",
    ]);
  });

  it("gives every mapped archive a usable name, short form, and link", () => {
    for (const doi of citedDois()) {
      const archive = datasetArchive(doi);
      expect(archive, doi).toBeDefined();
      expect(archive!.name.trim().length, doi).toBeGreaterThan(0);
      expect(archive!.abbreviation.trim().length, doi).toBeGreaterThan(0);
      expect(archive!.url, doi).toMatch(/^https:\/\//);
      // The whole point: GIBS is the imagery service, never the publisher.
      expect(archive!.name, doi).not.toContain("Global Imagery Browse");
    }
  });
});
