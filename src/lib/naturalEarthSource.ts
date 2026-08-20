/**
 * Provenance for the Natural Earth vector data the globe draws.
 *
 * Three of the bundled files come from one public-domain collection: the
 * national borders, the admin-1 regions behind the hover readout's
 * "Ontario, Canada", and the populated places the cities overlay labels.
 * They are three themes of a single work, so they are cited once, the way
 * Natural Earth itself asks to be credited.
 *
 * The one field this source cannot supply is a version. `scripts/prepare-data.mjs`
 * fetches the GeoJSON from the `master` branch of the natural-earth-vector
 * mirror, which is not a pinned release, so the repo genuinely does not record
 * which Natural Earth version the shipped extract came from. Naming one here
 * would invent a fact — the same reason the USGS seismicity feed emits no
 * version either. What the repo does record is the exact theme files, and those
 * are transcribed below so a reader can reproduce the extract.
 */
export const NATURAL_EARTH_SOURCE = {
  name: "Natural Earth",
  org: "North American Cartographic Information Society",
  url: "https://www.naturalearthdata.com/",
  /** Public domain, per Natural Earth's own terms of use. */
  license: "Public domain",
  /** The mirror prepare-data.mjs fetches from, at an unpinned branch. */
  mirrorUrl: "https://github.com/nvkelso/natural-earth-vector",
  /** The theme files bundled, exactly as the preparation script names them. */
  themes: [
    "ne_110m_admin_0_countries",
    "ne_10m_admin_1_states_provinces",
    "ne_110m_populated_places_simple",
  ],
  preparedBy: "scripts/prepare-data.mjs",
  localFiles: [
    "public/data/countries.geojson",
    "public/data/admin1.geojson",
    "public/data/cities.json",
  ],
} as const;
