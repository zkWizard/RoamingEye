# Data Sources

RoamingEye uses **only open, freely-redistributable data**. This document
catalogues every source, its scientific characteristics, and how it's accessed,
so observations made in the tool are reproducible and citable.

## Imagery — NASA GIBS

All imagery is served by **NASA's Global Imagery Browse Services (GIBS)** via its
WMS endpoint (`https://gibs.earthdata.nasa.gov/wms/epsg4326/best/wms.cgi`). GIBS
imagery is in the **public domain**, and the service is CORS-open, so it streams
straight into the browser with no backend or API key.

| Layer (GIBS identifier)                          | Instrument         | Variable          | Native res. | Temporal         | Notes                                                         |
| ------------------------------------------------ | ------------------ | ----------------- | ----------- | ---------------- | ------------------------------------------------------------- |
| `MODIS_Terra_L3_NDVI_Monthly`                    | MODIS / Terra      | Vegetation (NDVI) | 1 km        | Monthly, 2000→   | Cloud-free monthly composite; the workhorse phenology signal. |
| `MODIS_Terra_L3_EVI_Monthly`                     | MODIS / Terra      | Vegetation (EVI)  | 1 km        | Monthly, 2000→   | Enhanced index; less saturated over dense canopy.             |
| `MODIS_Terra_L3_Land_Surface_Temp_Monthly_Day`   | MODIS / Terra      | Land surface temp | 1 km        | Monthly, 2000→   | Daytime LST.                                                  |
| `MERRA2_2m_Air_Temperature_Monthly`              | MERRA-2 reanalysis | 2 m air temp      | ~50 km      | Monthly, 1980→   | Near-surface air temperature.                                 |
| `MODIS_Aqua_L3_SST_Thermal_9km_Day_Monthly`      | MODIS / Aqua       | Sea surface temp  | 9 km        | Monthly, 2002→   | Ocean thermal SST.                                            |
| `GLDAS_Surface_Total_Precipitation_Rate_Monthly` | GLDAS land model   | Precipitation     | ~25 km      | Monthly, 2000→   | Total precipitation rate.                                     |
| `GLDAS_Underground_Soil_Moisture_Monthly`        | GLDAS land model   | Soil moisture     | ~25 km      | Monthly, 2000→   | Root-zone moisture; drought/agriculture.                      |
| `MODIS_Terra_L3_Snow_Cover_Monthly_Average_Pct`  | MODIS / Terra      | Snow cover %      | 2 km        | Monthly, 2000→   | Average snow-covered fraction.                                |
| `MERRA2_..._Aerosol_Optical_Thickness_550nm...`  | MERRA-2 reanalysis | Aerosols (AOD)    | ~50 km      | Monthly, 1980→   | Dust, smoke, air quality.                                     |
| `HLS_S30_Nadir_BRDF_Adjusted_Reflectance`        | Sentinel-2 (HLS)   | True colour       | ~30 m       | Per-scene, 2015→ | High-res; per-orbit, so coverage is date-specific.            |
| `HLS_L30_Nadir_BRDF_Adjusted_Reflectance`        | Landsat 8/9 (HLS)  | True colour       | ~30 m       | Per-scene, 2013→ | High-res fallback for the study patch.                        |

### How the layers are used

- **Global base & timeline** — the monthly MODIS composites (NDVI/EVI/snow). They
  are cloud-free and gap-free, which is exactly what's needed to scrub smoothly
  across years. Native 1 km caps the achievable sharpness of the base globe.
- **High-resolution study patch** — HLS (Harmonized Landsat-Sentinel), ~30 m. HLS
  is per-scene daily imagery, so a given day may be cloudy or off-swath.
  RoamingEye probes ~10 candidate acquisition dates per month, scores each
  thumbnail for usable coverage (rejecting no-data and saturated cloud), and
  drapes the **clearest** pass — preferring Sentinel-2, falling back to Landsat.

### Why not photographic true colour over the whole globe, across years?

There is **no open, cloud-free, monthly true-colour global composite spanning
multiple years.** Daily true-colour mosaics (e.g. MODIS Corrected Reflectance)
are cloudy and riddled with orbital-swath gaps. Vegetation and snow indices are
the standard, purpose-built way to observe seasonal and multi-year change at
global scale — which is why they drive the timeline.

## Vector data — Natural Earth

[Natural Earth](https://www.naturalearthdata.com/) (public domain), at 1:110m,
slimmed into `public/data/` by `scripts/prepare-data.mjs`:

- `ne_110m_admin_0_countries` → national borders overlay + hover country lookup.
- `ne_110m_populated_places_simple` → cities overlay.

## Geocoding — OpenStreetMap Nominatim

Place search uses [OpenStreetMap Nominatim](https://nominatim.org/) (data ©
OpenStreetMap contributors, **ODbL**). It returns coordinates **and the actual
administrative boundary polygon**, which is highlighted on the globe.

> The public Nominatim endpoint is rate-limited (~1 request/second) and is meant
> for light use. A production deployment should self-host Nominatim or use a
> commercial geocoding provider, and must display OpenStreetMap attribution.

## Resolution ceiling (open data)

| Tier                          | Best open source                     | Resolution |
| ----------------------------- | ------------------------------------ | ---------- |
| Multi-decade monthly seasonal | MODIS composites                     | 1–2 km     |
| Recent high-res true colour   | HLS (Sentinel-2 / Landsat)           | ~30 m      |
| Finest open optical           | Sentinel-2 (direct)                  | ~10 m      |
| Sub-metre "street level"      | _commercial only_ (Maxar, Planet, …) | <1 m       |

RoamingEye targets the open tiers. Reaching native resolution _everywhere_ (not
just in a focused study patch) requires tiled streaming — see
[RFC-001](docs/rfcs/RFC-001-tiled-imagery-streaming.md).
