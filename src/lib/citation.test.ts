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
  doiResolverUrl,
  bibtexVectorSource,
  risVectorSource,
  textVectorSource,
  cslVectorSource,
  DOI_RESOLVER,
  TOOL_CITATION,
  type CslItem,
} from "./citation";
import {
  citedVectorSources,
  type VectorSourceCitation,
} from "./citedVectorSources";
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

    // One dataset item per unique GIBS DOI — no product double-counted — plus
    // the vector sources typed as data (the plate model is an article).
    const uniqueDois = new Set(citedDatasets().map((c) => c.dataset.doi));
    const vectorDatasets = citedVectorSources().filter(
      (s) => s.type === "dataset"
    );
    const datasetItems = items.filter((i) => i.type === "dataset");
    expect(datasetItems).toHaveLength(uniqueDois.size + vectorDatasets.length);
    // Every item carrying a DOI resolves through it; the one source without a
    // DOI is located by its own URL instead.
    for (const item of datasetItems) {
      if (item.DOI) expect(item.URL).toBe(`https://doi.org/${item.DOI}`);
      else expect(item.URL).toMatch(/^https:\/\//);
    }
  });
});

describe("vector-source citations", () => {
  // A source with a DOI and a version, and one with neither, cover both shapes
  // the formatters must handle without inventing a field.
  const withDoi: VectorSourceCitation = {
    key: "dataset_Example",
    title: "Example database",
    publisher: "Example Institution",
    type: "dataset",
    version: "5.3.6",
    doi: "10.5479/si.EXAMPLE",
    url: "https://example.org/",
    usedBy: ["Example overlay"],
    note: "Bundled extract dated 2026-05-26.",
  };
  const withoutDoi: VectorSourceCitation = {
    key: "dataset_ExampleFeed",
    title: "Example feed",
    publisher: "Example Survey",
    type: "dataset",
    url: "https://example.org/feed/",
    usedBy: ["Example overlay"],
    note: "Cite it with the date you retrieved the events.",
  };
  const article: VectorSourceCitation = {
    key: "article_Example2003",
    title: "An example model",
    type: "article-journal",
    doi: "10.1029/EXAMPLE",
    url: "https://doi.org/10.1029/EXAMPLE",
    usedBy: ["Example overlay"],
    author: "Example, P.",
    year: 2003,
    containerTitle: "Journal of Examples",
    volume: "4",
    issue: "3",
    formattedCitation:
      "Example, P. (2003), An example model, Journal of Examples 4(3)",
  };

  it("emits a DOI-located BibTeX entry with only the fields held", () => {
    const entry = bibtexVectorSource(withDoi);
    expect(entry).toContain("@misc{dataset_Example,");
    expect(entry).toContain("title = {Example database (v5.3.6)},");
    expect(entry).toContain("doi = {10.5479/si.EXAMPLE},");
    expect(entry).toContain("url = {https://doi.org/10.5479/si.EXAMPLE}");
    // No author or journal is invented for a database.
    expect(entry).not.toContain("author =");
    expect(entry).not.toContain("journal =");
  });

  it("locates a DOI-less source by URL and emits no empty DOI field", () => {
    const entry = bibtexVectorSource(withoutDoi);
    expect(entry).toContain("url = {https://example.org/feed/}");
    expect(entry).not.toContain("doi =");
    expect(entry).not.toContain("version =");
    // The caveat travels with the entry rather than being dropped.
    expect(entry).toContain("note = {Cite it with the date");
  });

  it("emits a paper as @article with its journal parts", () => {
    const entry = bibtexVectorSource(article);
    expect(entry).toContain("@article{article_Example2003,");
    expect(entry).toContain("author = {Example, P.},");
    expect(entry).toContain("journal = {Journal of Examples},");
    expect(entry).toContain("volume = {4},");
    expect(entry).toContain("number = {3},");
    expect(entry).toContain("year = {2003},");
  });

  it("closes every BibTeX entry with a braced url and no dangling comma", () => {
    for (const ref of [withDoi, withoutDoi, article, ...citedVectorSources()]) {
      const lines = bibtexVectorSource(ref).split("\n");
      expect(lines[lines.length - 1]).toBe("}");
      expect(lines[lines.length - 2].endsWith("}")).toBe(true);
      expect(lines[lines.length - 2]).not.toContain(",");
    }
  });

  it("types RIS records by what the work is", () => {
    expect(risVectorSource(withDoi)).toContain("TY  - DATA");
    expect(risVectorSource(article)).toContain("TY  - JOUR");
    expect(risVectorSource(withoutDoi)).not.toContain("DO  - ");
    expect(risVectorSource(withoutDoi)).toContain(
      "UR  - https://example.org/feed/"
    );
    expect(risVectorSource(article)).toContain("JO  - Journal of Examples");
    for (const ref of [withDoi, withoutDoi, article]) {
      expect(risVectorSource(ref).endsWith("ER  - ")).toBe(true);
    }
  });

  it("uses the publisher's own wording verbatim when the repo holds it", () => {
    const text = textVectorSource(article);
    expect(text).toContain(article.formattedCitation as string);
    // ...and does not label a paper a data set.
    expect(text).not.toContain("[Data set]");
    expect(textVectorSource(withDoi)).toContain("[Data set]");
  });

  it("builds a CSL item from held fields only, omitting the rest", () => {
    const item = cslVectorSource(withoutDoi);
    expect(item).toMatchObject({
      id: "dataset_ExampleFeed",
      type: "dataset",
      title: "Example feed",
      URL: "https://example.org/feed/",
    });
    expect("DOI" in item).toBe(false);
    expect("version" in item).toBe(false);
    expect("author" in item).toBe(false);
    expect("issued" in item).toBe(false);

    const paper = cslVectorSource(article);
    expect(paper["container-title"]).toBe("Journal of Examples");
    expect(paper.issued).toEqual({ "date-parts": [[2003]] });
    expect(paper.author).toEqual([{ literal: "Example, P." }]);
  });

  it("percent-encodes a DOI that would otherwise break its resolver link", () => {
    const awkward = { ...withDoi, doi: "10.1234/a#b c" };
    expect(bibtexVectorSource(awkward)).toContain(
      "url = {https://doi.org/10.1234/a%23b%20c}"
    );
    expect(cslVectorSource(awkward).URL).toBe(
      "https://doi.org/10.1234/a%23b%20c"
    );
    // The DOI variable itself stays the bare, unencoded name.
    expect(cslVectorSource(awkward).DOI).toBe("10.1234/a#b c");
  });
});

describe("citationBundle", () => {
  it("bundles the tool plus every deduplicated dataset in BibTeX", () => {
    const bundle = citationBundle("bibtex");
    expect(bundle).toContain("@software{roamingeye");
    // One @misc per unique dataset DOI, plus one per non-article vector source.
    const uniqueDois = new Set(citedDatasets().map((c) => c.dataset.doi));
    const vectorMisc = citedVectorSources().filter(
      (s) => s.type !== "article-journal"
    );
    expect(bundle.match(/@misc\{/g)?.length).toBe(
      uniqueDois.size + vectorMisc.length
    );
    for (const doi of uniqueDois) expect(bundle).toContain(`doi = {${doi}}`);
    // The plate model is a paper, so it is emitted as @article.
    expect(bundle.match(/@article\{/g)?.length).toBe(
      citedVectorSources().filter((s) => s.type === "article-journal").length
    );
  });

  it("bundles RIS with a record per citable object", () => {
    const bundle = citationBundle("ris");
    const records = bundle.match(/TY {2}- /g)?.length ?? 0;
    expect(records).toBe(
      1 +
        new Set(citedDatasets().map((c) => c.dataset.doi)).size +
        citedVectorSources().length
    );
  });

  it("bundles plain text: the tool plus one line per unique dataset DOI", () => {
    const bundle = citationBundle("text");
    expect(bundle).toContain(TOOL_CITATION.title);
    const uniqueDois = new Set(citedDatasets().map((c) => c.dataset.doi));
    for (const doi of uniqueDois) {
      expect(bundle).toContain(`https://doi.org/${doi}`);
    }
    // One "[Data set]" per unique GIBS dataset plus each vector source cited as
    // data (the article is not labelled a data set), and a trailing newline.
    const vectorDataSets = citedVectorSources().filter(
      (s) => s.type === "dataset" && s.formattedCitation === undefined
    );
    expect(bundle.match(/\[Data set\]/g)?.length).toBe(
      uniqueDois.size + vectorDataSets.length
    );
    expect(bundle.endsWith("\n")).toBe(true);
  });

  it("credits every rendered vector source, not just the imagery", () => {
    // The regression this guards: the overlays were rendered on the globe but
    // absent from the bundle, so an exported reference list silently
    // under-credited the volcano, seismicity and plate-boundary sources.
    for (const format of ["bibtex", "ris", "text", "csljson"] as const) {
      const bundle = citationBundle(format);
      for (const source of citedVectorSources()) {
        const locator = source.doi
          ? `https://doi.org/${source.doi}`
          : source.url;
        expect(bundle, `${format} cites ${source.key}`).toContain(locator);
      }
    }
  });

  it("is byte-stable across calls, so an exported bundle is diffable", () => {
    // No access date or other clock-dependent field may leak into the output.
    for (const format of ["bibtex", "ris", "text", "csljson"] as const) {
      expect(citationBundle(format)).toBe(citationBundle(format));
    }
  });
});
