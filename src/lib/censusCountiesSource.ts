/**
 * Provenance for the US county lines the borders overlay draws up close.
 *
 * The geometry is the Census Bureau's 2017 cartographic county boundaries,
 * redistributed as the unprojected `counties-10m.json` topology in us-atlas
 * 3.0.1. `scripts/prepare-data.mjs` fetches that pinned file and keeps the
 * shared arcs, so the version below is the Census edition the publisher of
 * the redistribution names, not a guess.
 */
export const CENSUS_COUNTY_SOURCE = {
  name: "Cartographic Boundary Files",
  org: "U.S. Census Bureau",
  /** The edition us-atlas 3.0.1 says its counties were derived from. */
  edition: "2017",
  url: "https://www.census.gov/geographies/mapping-files/time-series/geo/carto-boundary-file.html",
  /** Pinned redistribution. prepare-data.mjs fetches this exact URL. */
  redistributionUrl:
    "https://cdn.jsdelivr.net/npm/us-atlas@3.0.1/counties-10m.json",
  preparedBy: "scripts/prepare-data.mjs",
  localFile: "public/data/us-counties.json",
} as const;
