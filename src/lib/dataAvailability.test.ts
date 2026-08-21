import { describe, it, expect } from "vitest";
import {
  dataAvailabilityClause,
  dataAvailabilityStatement,
  vectorAvailabilityClause,
} from "./dataAvailability";
import { citedVectorSources } from "./citedVectorSources";
import { citedDatasets, GIBS_ACKNOWLEDGMENT } from "./providers";
import type { DatasetRef } from "./timeline";

const ndvi: DatasetRef = {
  shortName: "MOD13A3",
  version: "061",
  doi: "10.5067/MODIS/MOD13A3.061",
  title: "MODIS/Terra Vegetation Indices Monthly L3 Global 1km",
};

const gldas: DatasetRef = {
  shortName: "GLDAS_NOAH025_M",
  version: "2.1",
  doi: "10.5067/SXAVCZFAQLNO",
  title: "GLDAS Noah Land Surface Model L4 monthly 0.25°",
};

describe("dataAvailabilityClause", () => {
  it("names the product with a resolvable DOI link", () => {
    expect(dataAvailabilityClause(ndvi)).toBe(
      "MODIS/Terra Vegetation Indices Monthly L3 Global 1km (MOD13A3 v061, https://doi.org/10.5067/MODIS/MOD13A3.061)"
    );
  });

  it("drops the link for a blank DOI rather than fabricating a broken one", () => {
    const clause = dataAvailabilityClause({ ...ndvi, doi: "   " });
    expect(clause).toBe(
      "MODIS/Terra Vegetation Indices Monthly L3 Global 1km (MOD13A3 v061)"
    );
    expect(clause).not.toContain("https://doi.org/");
  });
});

describe("dataAvailabilityStatement", () => {
  it("states the GIBS/EOSDIS access path and NASA open-data reuse terms", () => {
    const das = dataAvailabilityStatement({ datasets: [ndvi] });
    expect(das).toContain("Global Imagery Browse Services (GIBS)");
    expect(das).toContain("Earth Science Data and Information System (EOSDIS)");
    expect(das).toContain(
      "free of charge under NASA's full and open data policy"
    );
    expect(das).toContain(
      "without restriction on subsequent use or redistribution"
    );
  });

  it("names every cited product with its resolvable DOI", () => {
    const das = dataAvailabilityStatement({ datasets: [ndvi, gldas] });
    expect(das).toContain(
      "MOD13A3 v061, https://doi.org/10.5067/MODIS/MOD13A3.061"
    );
    expect(das).toContain(
      "GLDAS_NOAH025_M v2.1, https://doi.org/10.5067/SXAVCZFAQLNO"
    );
  });

  it("ends with the requested GIBS acknowledgment", () => {
    const das = dataAvailabilityStatement({ datasets: [ndvi] });
    expect(das.trimEnd().endsWith(GIBS_ACKNOWLEDGMENT)).toBe(true);
  });

  it("deduplicates datasets sharing a DOI so a product is named once", () => {
    const das = dataAvailabilityStatement({ datasets: [gldas, { ...gldas }] });
    const occurrences = das.split("GLDAS_NOAH025_M v2.1").length - 1;
    expect(occurrences).toBe(1);
    // Two entries collapse to one → singular grammar.
    expect(das).toContain("The source product is:");
  });

  it("uses singular grammar for one dataset and plural for several", () => {
    expect(dataAvailabilityStatement({ datasets: [ndvi] })).toContain(
      "The NASA Earth-observation imagery dataset underlying this work is openly available"
    );
    const many = dataAvailabilityStatement({ datasets: [ndvi, gldas] });
    expect(many).toContain(
      "The NASA Earth-observation imagery datasets underlying this work are openly available"
    );
    expect(many).toContain("The source products are:");
  });

  it("includes an access date only when one is supplied, never fabricating it", () => {
    expect(dataAvailabilityStatement({ datasets: [ndvi] })).not.toContain(
      "accessed on"
    );
    const dated = dataAvailabilityStatement({
      datasets: [ndvi],
      accessed: "2026-07",
    });
    expect(dated).toContain("GIBS imagery was accessed on 2026-07.");
  });

  it("reports honestly when there are no datasets to describe", () => {
    expect(dataAvailabilityStatement({ datasets: [], vectorSources: [] })).toBe(
      "No source datasets to report for a data availability statement."
    );
  });

  it("defaults to the app's full cited catalog, each with a resolvable DOI", () => {
    const das = dataAvailabilityStatement();
    const datasets = citedDatasets().map((c) => c.dataset);
    expect(datasets.length).toBeGreaterThan(0);
    for (const ref of datasets) {
      expect(das).toContain(`${ref.shortName} v${ref.version}`);
      expect(das).toContain(`https://doi.org/${ref.doi}`);
    }
  });

  it("makes no value, condition, or forecast claim about the data", () => {
    const das = dataAvailabilityStatement();
    expect(das).not.toMatch(
      /\b(risk|forecast|predict|trend|because|due to)\b/i
    );
  });
});

describe("vectorAvailabilityClause", () => {
  it("locates a source by its resolvable DOI when it publishes one", () => {
    expect(
      vectorAvailabilityClause({
        key: "k",
        title: "Volcanoes of the World",
        publisher: "Smithsonian Institution",
        type: "dataset",
        version: "5.2",
        doi: "10.5479/si.GVP.VOTW5-2023",
        url: "https://volcano.si.edu/",
        usedBy: [],
      })
    ).toBe(
      "Volcanoes of the World v5.2 (Smithsonian Institution, https://doi.org/10.5479/si.GVP.VOTW5-2023)"
    );
  });

  it("falls back to the landing page for a source with no DOI", () => {
    const clause = vectorAvailabilityClause({
      key: "k",
      title: "USGS Earthquake Feed",
      publisher: "U.S. Geological Survey",
      type: "dataset",
      url: "https://earthquake.usgs.gov/",
      usedBy: [],
    });
    expect(clause).toBe(
      "USGS Earthquake Feed (U.S. Geological Survey, https://earthquake.usgs.gov/)"
    );
    // No version is invented for a feed that issues none.
    expect(clause).not.toContain(" v");
  });

  it("names the journal when the provenance records no publisher", () => {
    expect(
      vectorAvailabilityClause({
        key: "k",
        title: "An updated digital model of plate boundaries",
        type: "article-journal",
        doi: "10.1029/2001GC000252",
        url: "https://example.org/",
        usedBy: [],
        containerTitle: "Geochemistry, Geophysics, Geosystems",
      })
    ).toBe(
      "An updated digital model of plate boundaries (Geochemistry, Geophysics, Geosystems, https://doi.org/10.1029/2001GC000252)"
    );
  });

  it("omits the attribution entirely rather than inventing one", () => {
    const clause = vectorAvailabilityClause({
      key: "k",
      title: "Anonymous Extract",
      type: "dataset",
      url: "https://example.org/extract",
      usedBy: [],
    });
    expect(clause).toBe("Anonymous Extract (https://example.org/extract)");
    expect(clause).not.toContain("undefined");
  });
});

describe("data availability for the rendered vector datasets", () => {
  // The defect this covers: the statement claimed to describe the datasets
  // underlying the work while naming only the NASA imagery, and asserted
  // NASA's open-data policy over everything it named. The globe also draws
  // four datasets no NASA policy governs.
  it("names every source the globe renders, not only the NASA products", () => {
    const das = dataAvailabilityStatement();
    const sources = citedVectorSources();
    expect(sources.length).toBeGreaterThan(0);
    for (const source of sources) {
      expect(das).toContain(source.title);
      // The same locator the providers page links, so the two cannot send a
      // reader to different pages for one source.
      expect(das).toContain(
        source.doi ? `https://doi.org/${source.doi}` : source.url
      );
    }
  });

  it("keeps NASA's open-data policy off the sources it does not govern", () => {
    const das = dataAvailabilityStatement();
    expect(das).toContain(
      "are not NASA products and are not covered by that policy"
    );
    expect(das).toContain(
      "governed by its own publisher's terms of use; consult the linked source"
    );
    // The honest omission: no licence, no policy and no access guarantee is
    // asserted for a source whose terms this repo does not record.
    const vectorSentence = das.slice(das.indexOf("The globe also renders"));
    expect(vectorSentence).not.toMatch(
      /\b(public domain|CC0|open licen[cs]e|free of charge|without restriction)\b/i
    );
  });

  it("tells the reader to date a source that publishes no DOI and no version", () => {
    const das = dataAvailabilityStatement();
    expect(das).toContain(
      "where one publishes no DOI and no fixed version, cite it with the date you retrieved it"
    );
  });

  it("still ends with the GIBS acknowledgment once the sources are named", () => {
    const das = dataAvailabilityStatement();
    expect(das.trimEnd().endsWith(GIBS_ACKNOWLEDGMENT)).toBe(true);
    // The acknowledgment follows the vector sentence, so it reads as the
    // closing courtesy rather than as a claim about the sources after it.
    expect(das.indexOf("The globe also renders")).toBeLessThan(
      das.indexOf(GIBS_ACKNOWLEDGMENT)
    );
  });

  it("describes the imagery alone when the work drew no overlay", () => {
    const das = dataAvailabilityStatement({
      datasets: [ndvi],
      vectorSources: [],
    });
    expect(das).not.toContain("The globe also renders");
    expect(das.trimEnd().endsWith(GIBS_ACKNOWLEDGMENT)).toBe(true);
  });

  it("reports the vector sources alone when there is no imagery to describe", () => {
    const das = dataAvailabilityStatement({ datasets: [] });
    // Nothing was streamed from GIBS, so its access path, NASA's policy and
    // the requested acknowledgment all describe nothing and none is emitted.
    expect(das).not.toContain("Global Imagery Browse Services");
    expect(das).not.toContain(GIBS_ACKNOWLEDGMENT);
    expect(das).not.toContain("that policy");
    expect(das.startsWith("The globe renders")).toBe(true);
    for (const source of citedVectorSources()) {
      expect(das).toContain(source.title);
    }
  });

  it("uses singular grammar for a lone vector source", () => {
    const [first] = citedVectorSources();
    const das = dataAvailabilityStatement({
      datasets: [ndvi],
      vectorSources: [first],
    });
    expect(das).toContain(
      "The globe also renders one further dataset that is not a NASA product and is not covered by that policy"
    );
    expect(das).toContain("It is governed by its own publisher's terms of use");
  });
});
