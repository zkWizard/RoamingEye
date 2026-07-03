/**
 * A catalogue of the open Earth-observation data ecosystem RoamingEye is built
 * on and draws from. `use` marks how each relates to the project:
 *  - "core": data we stream/use directly.
 *  - "underlying": missions/instruments whose data we show via NASA GIBS.
 *  - "ecosystem": open providers in the wider community we don't (yet) use.
 *
 * Kept as data so it can power the in-app Providers page and stay accurate.
 */

export type ProviderUse = "core" | "underlying" | "ecosystem";

export interface Provider {
  name: string;
  org: string;
  region: string;
  group: string;
  url: string;
  license: string;
  use: ProviderUse;
  description: string;
}

export const PROVIDER_GROUPS = [
  "Space agencies & national archives",
  "Open cloud platforms & catalogs",
  "Open datasets & services",
  "Vector & base maps",
] as const;

export const PROVIDERS: Provider[] = [
  // --- Space agencies & national archives ---
  {
    name: "NASA EOSDIS — GIBS / Worldview",
    org: "NASA",
    region: "USA",
    group: "Space agencies & national archives",
    url: "https://nasa-gibs.github.io/gibs-api-docs/",
    license: "Public domain",
    use: "core",
    description:
      "Global Imagery Browse Services — the open, CORS-friendly imagery backbone RoamingEye streams (MODIS, HLS, MERRA-2, GLDAS, and hundreds more layers).",
  },
  {
    name: "NASA Earthdata / EOSDIS DAACs",
    org: "NASA",
    region: "USA",
    group: "Space agencies & national archives",
    url: "https://www.earthdata.nasa.gov/",
    license: "Public domain",
    use: "underlying",
    description:
      "The full NASA Earth science archive across a dozen Distributed Active Archive Centers — the source behind GIBS.",
  },
  {
    name: "NASA LANCE (near real-time)",
    org: "NASA",
    region: "USA",
    group: "Space agencies & national archives",
    url: "https://www.earthdata.nasa.gov/data/tools/lance",
    license: "Public domain",
    use: "ecosystem",
    description:
      "Land, Atmosphere Near real-time Capability — imagery within ~3 hours of observation, used for hazards and events.",
  },
  {
    name: "Copernicus Data Space Ecosystem",
    org: "ESA / European Commission",
    region: "EU",
    group: "Space agencies & national archives",
    url: "https://dataspace.copernicus.eu/",
    license: "Free & open (Copernicus)",
    use: "underlying",
    description:
      "Open access to all Sentinel missions (1/2/3/5P/6). Sentinel-2 (10 m) and Landsat feed the HLS product we use for high-res study patches.",
  },
  {
    name: "USGS EROS — EarthExplorer",
    org: "USGS",
    region: "USA",
    group: "Space agencies & national archives",
    url: "https://earthexplorer.usgs.gov/",
    license: "Public domain",
    use: "underlying",
    description:
      "The Landsat archive (since 1972) and more. Landsat 8/9 feed the HLS L30 high-res product.",
  },
  {
    name: "NOAA Open Data",
    org: "NOAA",
    region: "USA",
    group: "Space agencies & national archives",
    url: "https://www.noaa.gov/information-technology/open-data-dissemination",
    license: "Public domain",
    use: "ecosystem",
    description:
      "GOES geostationary imagery, JPSS/VIIRS, weather, ocean, and climate data — much of it on public cloud buckets.",
  },
  {
    name: "EUMETSAT",
    org: "EUMETSAT",
    region: "EU",
    group: "Space agencies & national archives",
    url: "https://www.eumetsat.int/",
    license: "Free & open (most)",
    use: "ecosystem",
    description:
      "European weather satellites — Meteosat geostationary imagery and polar-orbiting Metop data.",
  },
  {
    name: "JAXA G-Portal / Himawari",
    org: "JAXA",
    region: "Japan",
    group: "Space agencies & national archives",
    url: "https://gportal.jaxa.jp/",
    license: "Free (registration)",
    use: "ecosystem",
    description:
      "Japanese Earth-observation archive including GCOM, ALOS, and Himawari geostationary imagery.",
  },
  {
    name: "ISRO Bhuvan / NRSC",
    org: "ISRO",
    region: "India",
    group: "Space agencies & national archives",
    url: "https://bhuvan.nrsc.gov.in/",
    license: "Open (varies)",
    use: "ecosystem",
    description:
      "India's geoportal — Resourcesat, Cartosat, and Oceansat imagery and thematic layers.",
  },
  {
    name: "CNES / Theia",
    org: "CNES",
    region: "France",
    group: "Space agencies & national archives",
    url: "https://www.theia-land.fr/en/homepage-en/",
    license: "Open (Etalab / CC)",
    use: "ecosystem",
    description:
      "French land data centre — value-added Sentinel-2 and SPOT World Heritage products.",
  },
  {
    name: "INPE — Brazil",
    org: "INPE",
    region: "Brazil",
    group: "Space agencies & national archives",
    url: "http://www.dgi.inpe.br/",
    license: "Free & open",
    use: "ecosystem",
    description:
      "CBERS (China-Brazil) and Amazonia imagery, plus the PRODES/DETER deforestation monitoring archives.",
  },
  {
    name: "DLR EOC Geoservice",
    org: "DLR",
    region: "Germany",
    group: "Space agencies & national archives",
    url: "https://geoservice.dlr.de/",
    license: "Open (varies)",
    use: "ecosystem",
    description:
      "German Aerospace Center products — TanDEM-X elevation, global urban footprint, and more.",
  },

  // --- Open cloud platforms & catalogs ---
  {
    name: "Registry of Open Data on AWS",
    org: "Amazon Web Services",
    region: "Global",
    group: "Open cloud platforms & catalogs",
    url: "https://registry.opendata.aws/",
    license: "Open (per dataset)",
    use: "ecosystem",
    description:
      "Cloud-hosted, analysis-ready open archives — Landsat, Sentinel-2 COGs, NAIP aerial, and hundreds more.",
  },
  {
    name: "Microsoft Planetary Computer",
    org: "Microsoft",
    region: "Global",
    group: "Open cloud platforms & catalogs",
    url: "https://planetarycomputer.microsoft.com/",
    license: "Open (per dataset)",
    use: "ecosystem",
    description:
      "A STAC catalog and compute environment over petabytes of open EO data (Sentinel, Landsat, MODIS, land cover, and more).",
  },
  {
    name: "Google Earth Engine — Data Catalog",
    org: "Google",
    region: "Global",
    group: "Open cloud platforms & catalogs",
    url: "https://developers.google.com/earth-engine/datasets",
    license: "Open (per dataset)",
    use: "ecosystem",
    description:
      "A vast catalog of public EO datasets paired with planetary-scale analysis (free for research/non-commercial).",
  },
  {
    name: "Earth Search (Element 84)",
    org: "Element 84",
    region: "Global",
    group: "Open cloud platforms & catalogs",
    url: "https://earth-search.aws.element84.com/",
    license: "Open (per dataset)",
    use: "ecosystem",
    description:
      "A public STAC API over the AWS open data (Sentinel-2, Landsat) — a common entry point for tiled access.",
  },
  {
    name: "Source Cooperative (Radiant Earth)",
    org: "Radiant Earth",
    region: "Global",
    group: "Open cloud platforms & catalogs",
    url: "https://source.coop/",
    license: "Open (per dataset)",
    use: "ecosystem",
    description:
      "A repository for sharing open geospatial data, including ML-ready EO datasets and labels.",
  },
  {
    name: "Digital Earth Africa / Australia",
    org: "DE Africa / Geoscience Australia",
    region: "Africa / Australia",
    group: "Open cloud platforms & catalogs",
    url: "https://www.digitalearthafrica.org/",
    license: "Open",
    use: "ecosystem",
    description:
      "Open Data Cube platforms delivering analysis-ready Landsat/Sentinel and derived products for whole continents.",
  },
  {
    name: "STAC Index",
    org: "Community",
    region: "Global",
    group: "Open cloud platforms & catalogs",
    url: "https://stacindex.org/",
    license: "—",
    use: "ecosystem",
    description:
      "A directory of SpatioTemporal Asset Catalogs — the open standard for discovering and accessing imagery.",
  },

  // --- Open datasets & services ---
  {
    name: "MODIS (Terra & Aqua)",
    org: "NASA",
    region: "USA",
    group: "Open datasets & services",
    url: "https://modis.gsfc.nasa.gov/",
    license: "Public domain",
    use: "underlying",
    description:
      "Daily global imaging since 2000. Source of our NDVI, EVI, snow, land-surface and sea-surface temperature layers.",
  },
  {
    name: "HLS — Harmonized Landsat-Sentinel",
    org: "NASA / USGS / ESA",
    region: "Global",
    group: "Open datasets & services",
    url: "https://hls.gsfc.nasa.gov/",
    license: "Public domain",
    use: "core",
    description:
      "~30 m harmonized surface reflectance combining Sentinel-2 and Landsat — the high-res true colour behind our study regions.",
  },
  {
    name: "MERRA-2 & GLDAS",
    org: "NASA GMAO / GES DISC",
    region: "USA",
    group: "Open datasets & services",
    url: "https://gmao.gsfc.nasa.gov/reanalysis/MERRA-2/",
    license: "Public domain",
    use: "core",
    description:
      "Reanalysis and land-surface modelling — source of our air-temperature, aerosol, precipitation and soil-moisture layers.",
  },
  {
    name: "ESA WorldCover",
    org: "ESA",
    region: "Global",
    group: "Open datasets & services",
    url: "https://esa-worldcover.org/",
    license: "CC BY 4.0",
    use: "ecosystem",
    description:
      "Global 10 m land-cover maps from Sentinel-1 & 2 — a natural future overlay (see RFC/roadmap).",
  },
  {
    name: "Copernicus DEM (GLO-30 / GLO-90)",
    org: "ESA",
    region: "Global",
    group: "Open datasets & services",
    url: "https://spacedata.copernicus.eu/collections/copernicus-digital-elevation-model",
    license: "Free & open",
    use: "ecosystem",
    description:
      "Global digital elevation model — a candidate for true 3D terrain on the roadmap.",
  },
  {
    name: "NASADEM / SRTM",
    org: "NASA / USGS",
    region: "Global",
    group: "Open datasets & services",
    url: "https://www.earthdata.nasa.gov/data/instruments/srtm",
    license: "Public domain",
    use: "ecosystem",
    description:
      "Shuttle Radar Topography Mission elevation — classic open terrain data for relief.",
  },
  {
    name: "GEBCO",
    org: "GEBCO / IHO-IOC",
    region: "Global",
    group: "Open datasets & services",
    url: "https://www.gebco.net/",
    license: "Open",
    use: "ecosystem",
    description:
      "The global bathymetric grid — ocean-floor elevation to complement land terrain.",
  },
  {
    name: "NASA FIRMS (active fire)",
    org: "NASA",
    region: "Global",
    group: "Open datasets & services",
    url: "https://firms.modaps.eosdis.nasa.gov/",
    license: "Public domain",
    use: "ecosystem",
    description:
      "Fire Information for Resource Management System — near-real-time active-fire detections from MODIS/VIIRS.",
  },
  {
    name: "Copernicus Global Land Service",
    org: "European Commission",
    region: "Global",
    group: "Open datasets & services",
    url: "https://land.copernicus.eu/global/",
    license: "Free & open",
    use: "ecosystem",
    description:
      "Bio-geophysical land products — vegetation, energy, water cycle variables at global scale.",
  },
  {
    name: "GHSL — Global Human Settlement Layer",
    org: "EU JRC",
    region: "Global",
    group: "Open datasets & services",
    url: "https://ghsl.jrc.ec.europa.eu/",
    license: "Free & open",
    use: "ecosystem",
    description:
      "Open data on built-up area, population, and settlements derived from satellite imagery.",
  },
  {
    name: "Planet NICFI Basemaps",
    org: "Planet / Norway (NICFI)",
    region: "Tropics",
    group: "Open datasets & services",
    url: "https://www.planet.com/nicfi/",
    license: "Free for non-commercial",
    use: "ecosystem",
    description:
      "High-resolution tropical-forest basemaps, free for research, education, and forest monitoring.",
  },

  // --- Vector & base maps ---
  {
    name: "OpenStreetMap",
    org: "OSM Foundation",
    region: "Global",
    group: "Vector & base maps",
    url: "https://www.openstreetmap.org/",
    license: "ODbL",
    use: "core",
    description:
      "The open map of the world — powers our place search and administrative-boundary highlights (via Nominatim).",
  },
  {
    name: "Natural Earth",
    org: "NACIS",
    region: "Global",
    group: "Vector & base maps",
    url: "https://www.naturalearthdata.com/",
    license: "Public domain",
    use: "core",
    description:
      "Public-domain vector basemap data — our national borders and city overlays.",
  },
  {
    name: "OpenAerialMap",
    org: "HOT / community",
    region: "Global",
    group: "Vector & base maps",
    url: "https://openaerialmap.org/",
    license: "Open (per image)",
    use: "ecosystem",
    description:
      "An open repository of aerial and drone imagery, often used in humanitarian mapping.",
  },
];
