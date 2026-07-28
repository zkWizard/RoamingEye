import { describe, it, expect } from "vitest";
import {
  bibtexTool,
  bibtexDataset,
  risTool,
  risDataset,
  textTool,
  textDataset,
  citationBundle,
  doiResolverUrl,
  DOI_RESOLVER,
  TOOL_CITATION,
} from "./citation";
import { citedDatasets } from "./providers";

const ndvi = {
  shortName: "MOD13A3",
  version: "061",
  doi: "10.5067/MODIS/MOD13A3.061",
  title: "MODIS/Terra Vegetation Indices Monthly L3 Global 1km",
};

describe("doiResolverUrl", () => {
  it("builds a resolvable link for a normal NASA DOI unchanged", () => {
    expect(doiResolverUrl(ndvi.doi)).toBe(
      "https://doi.org/10.5067/MODIS/MOD13A3.061"
    );
  });

  it("preserves the DOI's structural slash separators", () => {
    // The "/" between registrant and suffix (and within the suffix) is part of
    // the DOI, not a character to encode.
    expect(doiResolverUrl("10.5067/a/b/c")).toBe(
      `${DOI_RESOLVER}10.5067/a/b/c`
    );
  });

  it("percent-encodes URL-unsafe characters a DOI suffix may carry", () => {
    // "#", "?", and a space would otherwise be read as a fragment, a query, and
    // a break in the URL; each must be escaped so the link resolves.
    expect(doiResolverUrl("10.1234/a#b?c d")).toBe(
      `${DOI_RESOLVER}10.1234/a%23b%3Fc%20d`
    );
  });

  it("encodes an existing percent sign without double-encoding it", () => {
    // "%" maps to "%25" first, so a later escape is never re-read as a prefix.
    expect(doiResolverUrl("10.1234/50%off")).toBe(
      `${DOI_RESOLVER}10.1234/50%25off`
    );
  });

  it("trims surrounding whitespace before building the link", () => {
    expect(doiResolverUrl("  10.5067/x  ")).toBe(`${DOI_RESOLVER}10.5067/x`);
  });

  it("yields the bare resolver base for an empty DOI", () => {
    expect(doiResolverUrl("")).toBe(DOI_RESOLVER);
  });
});

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
