import { describe, it, expect } from "vitest";
import {
  bibtexTool,
  bibtexDataset,
  risTool,
  risDataset,
  textTool,
  textDataset,
  cslTool,
  cslDataset,
  citationBundle,
  TOOL_CITATION,
  type CslItem,
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

describe("plain text", () => {
  it("emits a formatted software citation for the tool", () => {
    const text = textTool();
    expect(text).toContain(TOOL_CITATION.author);
    expect(text).toContain(`(${TOOL_CITATION.year})`);
    expect(text).toContain(`Version ${TOOL_CITATION.version}`);
    expect(text).toContain("[Software]");
    expect(text).toContain(TOOL_CITATION.url);
  });

  it("emits a formatted data citation with a resolvable DOI link", () => {
    const text = textDataset(ndvi);
    expect(text).toContain(
      "MODIS/Terra Vegetation Indices Monthly L3 Global 1km (MOD13A3 v061)"
    );
    expect(text).toContain("[Data set]");
    expect(text).toContain("NASA Global Imagery Browse Services (GIBS)");
    expect(text).toContain("https://doi.org/10.5067/MODIS/MOD13A3.061");
  });

  it("invents no author or release date beyond the DatasetRef fields", () => {
    // Honest provenance: only title, short name, version, and DOI are used.
    const text = textDataset(ndvi);
    expect(text.startsWith(ndvi.title)).toBe(true);
    expect(text).not.toMatch(/\b(19|20)\d{2}\b/); // no fabricated year
  });
});

describe("CSL-JSON", () => {
  it("emits a 'software' item for the tool with author, year, and version", () => {
    const item = cslTool();
    expect(item.id).toBe("roamingeye");
    expect(item.type).toBe("software");
    expect(item.title).toBe(TOOL_CITATION.title);
    expect(item.author).toEqual([{ literal: TOOL_CITATION.author }]);
    expect(item.issued).toEqual({ "date-parts": [[TOOL_CITATION.year]] });
    expect(item.version).toBe(TOOL_CITATION.version);
    expect(item.URL).toBe(TOOL_CITATION.url);
    // The tool carries no DOI, so the field is omitted rather than emitted null.
    expect("DOI" in item).toBe(false);
  });

  it("emits a 'dataset' item carrying the DOI and a resolvable URL", () => {
    const item = cslDataset(ndvi);
    expect(item.type).toBe("dataset");
    expect(item.title).toContain("MOD13A3 v061");
    expect(item.publisher).toBe("NASA Global Imagery Browse Services (GIBS)");
    expect(item.version).toBe("061");
    expect(item.DOI).toBe("10.5067/MODIS/MOD13A3.061");
    expect(item.URL).toBe("https://doi.org/10.5067/MODIS/MOD13A3.061");
    // The CSL id matches the BibTeX key for the same work (stable, ASCII).
    expect(item.id).toMatch(/^dataset_MOD13A3_v061$/);
  });

  it("invents no author or release date beyond the DatasetRef fields", () => {
    const item = cslDataset(ndvi);
    expect("author" in item).toBe(false);
    expect("issued" in item).toBe(false);
  });

  it("bundles valid, parseable CSL-JSON: the tool first, then each dataset", () => {
    const bundle = citationBundle("csljson");
    expect(bundle.endsWith("\n")).toBe(true);
    const items = JSON.parse(bundle) as CslItem[];
    expect(Array.isArray(items)).toBe(true);
    expect(items[0]).toMatchObject({ id: "roamingeye", type: "software" });

    // One dataset item per unique DOI, each resolvable — no product double-counted.
    const uniqueDois = new Set(citedDatasets().map((c) => c.dataset.doi));
    const datasetItems = items.filter((i) => i.type === "dataset");
    expect(datasetItems).toHaveLength(uniqueDois.size);
    for (const item of datasetItems) {
      expect(item.URL).toBe(`https://doi.org/${item.DOI}`);
    }
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

  it("bundles plain text: the tool plus one line per unique dataset DOI", () => {
    const bundle = citationBundle("text");
    expect(bundle).toContain(TOOL_CITATION.title);
    const uniqueDois = new Set(citedDatasets().map((c) => c.dataset.doi));
    for (const doi of uniqueDois) {
      expect(bundle).toContain(`https://doi.org/${doi}`);
    }
    // One "[Data set]" per unique dataset, and a trailing newline.
    expect(bundle.match(/\[Data set\]/g)?.length).toBe(uniqueDois.size);
    expect(bundle.endsWith("\n")).toBe(true);
  });
});
