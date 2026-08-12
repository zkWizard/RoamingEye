import { describe, it, expect } from "vitest";
import { citedVectorSources } from "./citedVectorSources";
import { SEISMICITY_SOURCE } from "./earthquakes";
import { BIRD_2003_PLATE_BOUNDARY_SOURCE } from "./plateBoundaryContext";
import { GVP_VOLCANO_SOURCE } from "./volcanoContext";

const byKey = (key: string) => {
  const found = citedVectorSources().find((s) => s.key === key);
  if (!found) throw new Error(`no cited vector source keyed ${key}`);
  return found;
};

describe("citedVectorSources", () => {
  it("covers each vector dataset the globe renders", () => {
    // One entry per rendered overlay: volcanoes, seismicity, plate boundaries.
    expect(citedVectorSources().map((s) => s.key)).toEqual([
      "dataset_GVPVolcanoesOfTheWorld",
      "dataset_USGSSeismicityFeed",
      "article_Bird2003PlateBoundaries",
    ]);
  });

  it("gives every source a locator and the surfaces it powers", () => {
    for (const source of citedVectorSources()) {
      expect(source.url, `${source.key} has a locator`).toMatch(/^https:\/\//);
      expect(source.title.length, `${source.key} is titled`).toBeGreaterThan(0);
      expect(
        source.usedBy.length,
        `${source.key} credits a surface`
      ).toBeGreaterThan(0);
    }
  });

  it("keys are unique and ASCII, so citation keys never collide", () => {
    const keys = citedVectorSources().map((s) => s.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const key of keys) expect(key).toMatch(/^[A-Za-z0-9_]+$/);
  });

  it("returns a fresh array, so a caller cannot mutate the registry", () => {
    const first = citedVectorSources();
    first[0].usedBy.push("tampered");
    expect(citedVectorSources()[0].usedBy).not.toContain("tampered");
  });

  it("transcribes provenance from the constants that ship with each dataset", () => {
    // The registry must never drift from the source of truth each overlay
    // already carries; these are the fields a citation is built from.
    const gvp = byKey("dataset_GVPVolcanoesOfTheWorld");
    expect(gvp.doi).toBe(GVP_VOLCANO_SOURCE.doi);
    expect(gvp.version).toBe(GVP_VOLCANO_SOURCE.databaseVersion);
    expect(gvp.publisher).toBe(GVP_VOLCANO_SOURCE.org);

    expect(byKey("dataset_USGSSeismicityFeed").url).toBe(SEISMICITY_SOURCE.url);
    expect(byKey("article_Bird2003PlateBoundaries").doi).toBe(
      BIRD_2003_PLATE_BOUNDARY_SOURCE.doi
    );
  });

  it("omits a DOI for the feed that has none rather than borrowing one", () => {
    // The USGS summary feed is not registered with a DOI. Emitting an empty or
    // substituted one would be worse than emitting nothing: it would send a
    // reader to the wrong work.
    const usgs = byKey("dataset_USGSSeismicityFeed");
    expect(usgs.doi).toBeUndefined();
    expect(usgs.version).toBeUndefined();
    // ...and the reader is told what only they can supply.
    expect(usgs.note).toMatch(/date you retrieved/);
  });

  it("cites Bird (2003) as the article its DOI actually resolves to", () => {
    // 10.1029/2001GC000252 is the G-cubed paper, not a data product; typing it
    // as a dataset would misdescribe what the DOI points at.
    expect(byKey("article_Bird2003PlateBoundaries").type).toBe(
      "article-journal"
    );
    expect(byKey("dataset_GVPVolcanoesOfTheWorld").type).toBe("dataset");
  });

  it("names the digitization the rendered plate geometry came from", () => {
    // The globe draws a community digitization, not Bird's original file.
    // Crediting only the article would hide the provenance of the linework.
    expect(byKey("article_Bird2003PlateBoundaries").note).toContain(
      BIRD_2003_PLATE_BOUNDARY_SOURCE.digitizationUrl
    );
  });

  it("structured article fields are transcriptions of the verbatim citation", () => {
    // Guards the one place this module restates a string the repo already
    // holds: if the committed citation is corrected, the parts must move with
    // it rather than silently disagreeing with the publisher's own wording.
    const bird = byKey("article_Bird2003PlateBoundaries");
    const verbatim = bird.formattedCitation ?? "";
    expect(verbatim).toBe(BIRD_2003_PLATE_BOUNDARY_SOURCE.citation);
    for (const part of [
      bird.title,
      bird.author,
      String(bird.year),
      bird.containerTitle,
    ]) {
      expect(
        verbatim,
        `"${part}" occurs in the publisher's citation`
      ).toContain(part as string);
    }
  });

  it("dates the bundled volcano extract rather than implying live data", () => {
    expect(byKey("dataset_GVPVolcanoesOfTheWorld").note).toContain(
      GVP_VOLCANO_SOURCE.dataDate
    );
  });
});
