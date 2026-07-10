import { describe, it, expect } from "vitest";
import {
  bibtexTool,
  bibtexDataset,
  risTool,
  risDataset,
  citationBundle,
  TOOL_CITATION,
} from "./citation";
import { citedDatasets } from "./providers";

const ndvi = {
  shortName: "MOD13A3",
  version: "061",
  doi: "10.5067/MODIS/MOD13A3.061",
  title: "MODIS/Terra Vegetation Indices Monthly L3 Global 1km",
};

describe("BibTeX", () => {
  it("emits a well-formed @software entry for the tool with a version", () => {
    const bib = bibtexTool();
    expect(bib).toMatch(/^@software\{roamingeye,/);
    expect(bib).toContain(`version = {${TOOL_CITATION.version}}`);
    expect(bib.trimEnd().endsWith("}")).toBe(true);
  });

  it("emits an @misc entry carrying the dataset DOI", () => {
    const bib = bibtexDataset(ndvi);
    expect(bib).toContain("doi = {10.5067/MODIS/MOD13A3.061}");
    expect(bib).toContain("url = {https://doi.org/10.5067/MODIS/MOD13A3.061}");
    expect(bib).toContain("MOD13A3 v061");
  });

  it("escapes BibTeX-special characters in titles", () => {
    const bib = bibtexDataset({ ...ndvi, title: "A & B {test} 50%" });
    expect(bib).toContain("A \\& B \\{test\\} 50\\%");
  });

  it("escapes the backslash completely (no stray escape char slips through)", () => {
    const bib = bibtexDataset({ ...ndvi, title: "path\\to#x" });
    // The backslash becomes \textbackslash{} and its braces are NOT re-escaped;
    // the # is escaped. No unescaped backslash-then-special remains.
    expect(bib).toContain("path\\textbackslash{}to\\#x");
  });
});

describe("RIS", () => {
  it("emits a COMP record for the tool and a DATA record for a dataset", () => {
    expect(risTool()).toMatch(/^TY {2}- COMP/);
    expect(risTool()).toContain(`ET  - ${TOOL_CITATION.version}`);
    const ris = risDataset(ndvi);
    expect(ris).toMatch(/^TY {2}- DATA/);
    expect(ris).toContain("DO  - 10.5067/MODIS/MOD13A3.061");
    expect(ris.trimEnd().endsWith("ER  -")).toBe(true);
  });
});

describe("citationBundle", () => {
  it("bundles the tool plus every deduplicated dataset in BibTeX", () => {
    const bundle = citationBundle("bibtex");
    expect(bundle).toContain("@software{roamingeye");
    // One @misc per unique dataset DOI.
    const uniqueDois = new Set(citedDatasets().map((c) => c.dataset.doi));
    expect(bundle.match(/@misc\{/g)?.length).toBe(uniqueDois.size);
    for (const doi of uniqueDois) expect(bundle).toContain(`doi = {${doi}}`);
  });

  it("bundles RIS with a record per citable object", () => {
    const bundle = citationBundle("ris");
    const records = bundle.match(/TY {2}- /g)?.length ?? 0;
    expect(records).toBe(
      1 + new Set(citedDatasets().map((c) => c.dataset.doi)).size
    );
  });
});
