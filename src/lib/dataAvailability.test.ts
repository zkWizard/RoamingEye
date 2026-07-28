import { describe, it, expect } from "vitest";
import {
  dataAvailabilityClause,
  dataAvailabilityStatement,
} from "./dataAvailability";
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
      "The Earth-observation dataset underlying this work is openly available"
    );
    const many = dataAvailabilityStatement({ datasets: [ndvi, gldas] });
    expect(many).toContain(
      "The Earth-observation datasets underlying this work are openly available"
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
    expect(dataAvailabilityStatement({ datasets: [] })).toBe(
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
