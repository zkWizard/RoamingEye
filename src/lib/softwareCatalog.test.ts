import { describe, expect, it } from "vitest";
import {
  catalogFacets,
  filterSoftware,
  parseSoftwareCatalog,
  type SoftwareCatalog,
} from "./softwareCatalog";

const catalog: SoftwareCatalog = {
  version: 1,
  generatedAt: "2026-07-12T00:00:00.000Z",
  tools: [
    {
      id: "qgis",
      name: "QGIS",
      summary: "Desktop GIS for mapping and analysis.",
      repository: "https://github.com/qgis/QGIS",
      documentation: "https://docs.qgis.org/",
      license: "GPL-2.0-or-later",
      domains: ["GIS", "Cartography"],
      workflows: ["Desktop analysis"],
      formats: ["GeoTIFF"],
      platforms: ["Windows", "Linux"],
      access: ["Desktop"],
      accessNotes: [
        "Use the documented installer or package for your operating system.",
      ],
      languages: ["English"],
      verifiedAt: "2026-07-12",
      evidence: {
        repositoryApi: "https://api.github.com/repos/qgis/QGIS",
        repositoryUpdatedAt: "2026-07-12T00:00:00Z",
      },
    },
    {
      id: "xarray",
      name: "xarray",
      summary: "Python analysis for labelled multidimensional arrays.",
      repository: "https://github.com/pydata/xarray",
      documentation: "https://docs.xarray.dev/",
      license: "Apache-2.0",
      domains: ["Climate"],
      workflows: ["Multidimensional analysis"],
      formats: ["NetCDF", "Zarr"],
      platforms: ["Windows", "macOS", "Linux"],
      access: ["Python library"],
      accessNotes: [
        "Use an isolated Python environment and the project guide.",
      ],
      languages: ["English"],
      verifiedAt: "2026-07-12",
      evidence: {
        repositoryApi: "https://api.github.com/repos/pydata/xarray",
        repositoryUpdatedAt: "2026-07-12T00:00:00Z",
      },
    },
  ],
};

describe("software catalog", () => {
  it("parses a complete, unique catalog", () => {
    expect(parseSoftwareCatalog(catalog)).toEqual(catalog);
  });

  it("rejects invalid records", () => {
    expect(() => parseSoftwareCatalog({ ...catalog, tools: [{}] })).toThrow(
      "invalid tool record"
    );
  });

  it("filters on terms and facets", () => {
    expect(filterSoftware(catalog.tools, { query: "netcdf python" })).toEqual([
      catalog.tools[1],
    ]);
    expect(filterSoftware(catalog.tools, { domain: "GIS" })).toEqual([
      catalog.tools[0],
    ]);
  });

  it("returns stable facet values", () => {
    expect(catalogFacets(catalog.tools, "access")).toEqual([
      "Desktop",
      "Python library",
    ]);
  });
});
