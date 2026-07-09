import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { citedDatasets, GIBS_ACKNOWLEDGMENT } from "./providers";

/**
 * Drift guard for the README's "Citing RoamingEye and its data" section:
 * the hand-written dataset/DOI table must track the layer configuration the
 * app actually runs on. If a layer's source product changes (e.g. a 061 →
 * 062 re-point caught by the weekly citation contract), this fails until
 * the docs follow — a citation table that silently rots is worse than none.
 */

const readme = readFileSync(
  new URL("../../README.md", import.meta.url),
  "utf8"
);

describe("README citing section", () => {
  it("lists every cited dataset's DOI", () => {
    for (const { dataset } of citedDatasets()) {
      expect(
        readme.includes(dataset.doi),
        `README is missing DOI ${dataset.doi} (${dataset.shortName} v${dataset.version})`
      ).toBe(true);
    }
  });

  it("carries the GIBS acknowledgment", () => {
    // The README blockquote wraps lines; compare with whitespace collapsed.
    const flat = readme.replace(/[\s>]+/g, " ");
    expect(flat).toContain(GIBS_ACKNOWLEDGMENT);
  });

  it("names all three citable objects", () => {
    expect(readme).toContain("CITATION.cff");
    expect(readme).toContain("# data_doi");
    expect(readme).toContain("# view_url");
  });
});
