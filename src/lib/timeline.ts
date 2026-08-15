import type { WmtsConfig } from "./tiles";

/**
 * Timeline model for the temporal scrubber.
 *
 * Pure, render-free logic: the catalog of seasonal data layers, year/month
 * math, GIBS image URLs, and slider position mapping. Kept dependency-free so
 * it's fast and deterministic to unit-test (see timeline.test.ts).
 *
 * Imagery: NASA GIBS (Global Imagery Browse Services) monthly composites —
 * cloud-free, public domain, served with permissive CORS so the browser can
 * load them straight into WebGL textures. Not gap-free: a product can skip a
 * month of its own record (see `unpublished`), and GIBS says so by advertising
 * the layer's time dimension as several disjoint ranges.
 */

export type LayerId =
  | "ndvi"
  | "evi"
  | "snow"
  | "lst"
  | "airtemp"
  | "sst"
  | "precip"
  | "soil"
  | "aerosol"
  | "landcover"
  | "terrain";

export type LayerCategory =
  | "Vegetation"
  | "Temperature"
  | "Water"
  | "Cryosphere"
  | "Atmosphere"
  | "Land"
  | "Terrain";

/** A calendar month. `month` is 1-12 (1 = January). */
export interface YearMonth {
  year: number;
  month: number;
}

/**
 * The source dataset a GIBS layer renders — the thing a publication must
 * cite (NASA's data-use guidance: cite the dataset, not the picture).
 * Resolved 2026-07-09 via GIBS layer-metadata → CMR (by shortName+version;
 * stale conceptIds 404 after DAAC migrations) and pinned here; the weekly
 * citation contract re-checks the mapping and that every DOI still resolves.
 */
export interface DatasetRef {
  /** Product short name (e.g. "MOD13A3"). */
  shortName: string;
  /** Product version as CMR publishes it (e.g. "061"). */
  version: string;
  /** Dataset DOI, without the resolver prefix (e.g. "10.5067/…"). */
  doi: string;
  /** CMR collection title, for the providers page. */
  title: string;
}

export interface LayerConfig {
  id: LayerId;
  label: string;
  category: LayerCategory;
  /** GIBS WMS layer identifier. */
  wmsLayer: string;
  /** The underlying cited dataset (see DatasetRef). */
  dataset?: DatasetRef;
  /** WMTS serving parameters for tiled streaming (RFC-001). Conservative
   * matrix sets: over-zooming a layer's published levels 404s per tile. */
  wmts?: WmtsConfig;
  /** Earliest month available for this layer. */
  start: YearMonth;
  /** Most recent month available (defaults to DATA_LATEST). Reanalysis and
   * some products lag further behind than the MODIS composites. */
  latest?: YearMonth;
  /** Months the product does not publish *inside* its own [start, latest]
   * record. GIBS advertises a layer's time dimension as one or more ranges,
   * and a layer with a distribution gap advertises several — the months
   * between them were never distributed, so their tiles 404 rather than
   * returning a no-data image. Left undefined for a layer whose record is
   * contiguous. See MOD13A3_UNPUBLISHED_MONTHS. */
  unpublished?: readonly YearMonth[];
  /** True for datasets with no time dimension (e.g. elevation): one image
   * regardless of the selected month, and no TIME param in GIBS URLs. */
  static?: boolean;
  /** Publishing cadence. Annual products (e.g. land cover) get one timeline
   * entry per year — addressed by January 1st in GIBS TIME params. */
  cadence?: "annual";
  /** True for class-coded (categorical) layers: the legend shows swatches
   * instead of a gradient, and the probe has no numeric series to chart. */
  categorical?: boolean;
  description: string;
}

/**
 * The most recent month with published data. Monthly composites lag the
 * current month (the current month isn't finalised until it ends), so this
 * trails "today". A live binding: freshness.ts probes GIBS at boot and
 * extends it when NASA has published newer months than this compiled-in
 * baseline (which should still be bumped occasionally so cold boots start
 * close to the truth). Last bumped 2026-08-15: Jun 2026 verified against
 * MOD13A3's DescribeDomains answer (the slowest of the non-lagging families).
 */
export let DATA_LATEST: YearMonth = { year: 2026, month: 6 };

/** Move the runtime latest forward (never backward) — see lib/freshness.ts. */
export function extendDataLatest(ym: YearMonth): void {
  if (compareYm(ym, DATA_LATEST) > 0) DATA_LATEST = ym;
}

/**
 * Pin a layer's runtime `latest` to a boot-verified month (forward-only —
 * a stale or shrunken upstream answer never rewinds a working timeline).
 * Freshness verifies each *product family* separately: MOD13A3 (ndvi/evi),
 * MOD11C3 (lst), and MOD10CM (snow) publish on their own schedules, so one
 * product's newest month must never be offered on another product's layer.
 * See lib/freshness.ts.
 */
export function setLayerLatest(id: LayerId, ym: YearMonth): void {
  const layer = LAYERS[id];
  if (!layer.latest || compareYm(ym, layer.latest) > 0) layer.latest = ym;
}

export const MONTH_NAMES = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

/**
 * Months MOD13A3 never distributed, inside its own record.
 *
 * GIBS advertises the vegetation-index time dimension as two disjoint ranges
 * — 2000-03/2025-03/P1M and 2025-05/2026-06/P1M (WMTS GetCapabilities,
 * verified 2026-08-11; the April 2025 tile answers HTTP 404 while March and
 * May serve normally). NDVI and EVI are two fields of the same MOD13A3
 * granule, so the gap is identical on both layers.
 *
 * Recorded as catalog data rather than derived, because a *distribution* gap
 * is not an observation. Offering the month anyway would put the absence into
 * a vegetation series as a failed retrieval, where a reader would credit it to
 * cloud, snow, or the quality screen — a statement about a surface nobody
 * measured that month. Other layers advertise interior gaps too; those belong
 * to their own product catalogs and are not asserted here — see
 * MODIS_AQUA_SST_DAY_UNPUBLISHED_MONTHS and MOD10CM_UNPUBLISHED_MONTHS. Air
 * temperature also splits into several ranges upstream and is not yet
 * catalogued.
 */
const MOD13A3_UNPUBLISHED_MONTHS: readonly YearMonth[] = [
  { year: 2025, month: 4 },
];

/**
 * Months the daytime MODIS/Aqua monthly SST composite never distributed,
 * inside its own record.
 *
 * GIBS advertises this layer's time dimension as five disjoint ranges —
 * 2002-07/2022-10, 2023-01/2023-05, 2023-07/2023-09, 2023-11/2025-11 and
 * 2026-01/2026-04, all P1M (WMTS GetCapabilities, verified 2026-08-11). Each
 * of the five months below sits between two of them and answers HTTP 404,
 * while every month on either side of every gap serves normally.
 *
 * A missing month reads differently in an SST record than in a vegetation
 * one, and more dangerously. Absent *pixels* here are routine and
 * informative — cloud, sea ice, and sun glint all withhold a thermal-IR
 * retrieval, so a reader is right to credit a hole to the sea surface. These
 * months are not that: no monthly composite was distributed at all, so
 * offering them would invite exactly the reading the data cannot support.
 * The gaps also fall where they cost the most: they thin the same-calendar
 * -month baselines a December or June anomaly is measured against, and two
 * of them (Nov and Dec 2022) are consecutive.
 *
 * That these are distribution artifacts rather than ocean signal is directly
 * checkable: the sibling *night* layer of the same product
 * (MODIS_Aqua_L3_SST_Thermal_9km_Night_Monthly) splits into five ranges too,
 * but skips a different set of months — 2022-12, 2023-01, 2023-06, 2024-01
 * and 2025-01 — sharing only two with the daytime half the app renders. No
 * property of the ocean is visible by day and not by night in November 2022.
 */
const MODIS_AQUA_SST_DAY_UNPUBLISHED_MONTHS: readonly YearMonth[] = [
  { year: 2022, month: 11 },
  { year: 2022, month: 12 },
  { year: 2023, month: 6 },
  { year: 2023, month: 10 },
  { year: 2025, month: 12 },
];

/**
 * Months MOD10CM never distributed, inside its own record.
 *
 * GIBS advertises the snow layer's time dimension as *seven* disjoint ranges —
 * 2000-03/2000-07, 2000-09/2001-05, 2001-07/2002-02, 2002-04/2003-11,
 * 2004-01/2016-01, 2016-03/2022-09 and 2022-11/2026-07, all P1M (WMTS
 * GetCapabilities, verified 2026-08-13). Each of the six months below sits
 * between two of them and answers HTTP 404 at the tile endpoint, while every
 * month on either side of every gap serves normally.
 *
 * A missing month is especially misleading in a snow record. Absent or *low*
 * covered-area values here are routine and informative — cloud and polar
 * darkness both withhold an optical retrieval, and monthly averaging over the
 * cloud-free days is exactly what MOD10CM reports. Offering an undistributed
 * month anyway would put a failed retrieval into a cryosphere series where a
 * reader would credit it to cloud, darkness, or genuine melt-out: an implied
 * statement about a snowpack nobody imaged. Four of the six (2001-06, 2002-03,
 * 2003-12, 2016-02) fall inside a hemispheric snow season, so they would also
 * silently shorten any season or same-month baseline built across them.
 *
 * The same six months are recorded, with their consequences for the summary
 * layer, as SNOW_COVER_UNDISTRIBUTED_MONTHS in lib/snowCover.ts; the two are
 * pinned together by snowCover.test.ts. They are restated here rather than
 * imported to keep this catalog module dependency-free.
 */
const MOD10CM_UNPUBLISHED_MONTHS: readonly YearMonth[] = [
  { year: 2000, month: 8 },
  { year: 2001, month: 6 },
  { year: 2002, month: 3 },
  { year: 2003, month: 12 },
  { year: 2016, month: 2 },
  { year: 2022, month: 10 },
];

export const LAYERS: Record<LayerId, LayerConfig> = {
  ndvi: {
    id: "ndvi",
    label: "Vegetation (NDVI)",
    category: "Vegetation",
    wmsLayer: "MODIS_Terra_L3_NDVI_Monthly",
    dataset: {
      shortName: "MOD13A3",
      version: "061",
      doi: "10.5067/MODIS/MOD13A3.061",
      title: "MODIS/Terra Vegetation Indices Monthly L3 Global 1km",
    },
    wmts: { set: "1km", maxLevel: 6, ext: "png" },
    start: { year: 2000, month: 3 },
    unpublished: MOD13A3_UNPUBLISHED_MONTHS,
    description: "Vegetation greenness — the classic seasonal-cycle signal.",
  },
  evi: {
    id: "evi",
    label: "Vegetation (EVI)",
    category: "Vegetation",
    wmsLayer: "MODIS_Terra_L3_EVI_Monthly",
    dataset: {
      shortName: "MOD13A3",
      version: "061",
      doi: "10.5067/MODIS/MOD13A3.061",
      title: "MODIS/Terra Vegetation Indices Monthly L3 Global 1km",
    },
    wmts: { set: "1km", maxLevel: 6, ext: "png" },
    start: { year: 2000, month: 3 },
    unpublished: MOD13A3_UNPUBLISHED_MONTHS,
    description:
      "Enhanced vegetation index — less saturated over dense canopy.",
  },
  lst: {
    id: "lst",
    label: "Land surface temp",
    category: "Temperature",
    wmsLayer: "MODIS_Terra_L3_Land_Surface_Temp_Monthly_Day",
    dataset: {
      shortName: "MOD11C3",
      version: "061",
      doi: "10.5067/MODIS/MOD11C3.061",
      title: "MODIS/Terra LST/Emissivity Monthly L3 Global 0.05Deg CMG",
    },
    wmts: { set: "2km", maxLevel: 5, ext: "png" },
    start: { year: 2000, month: 3 },
    description: "Daytime clear-sky land-surface temperature (MODIS/Terra).",
  },
  airtemp: {
    id: "airtemp",
    label: "Air temperature (2 m)",
    category: "Temperature",
    wmsLayer: "MERRA2_2m_Air_Temperature_Monthly",
    dataset: {
      shortName: "M2TMNXSLV",
      version: "5.12.4",
      doi: "10.5067/AP1B0BA5PD2K",
      title: "MERRA-2 tavgM_2d_slv_Nx: Monthly Single-Level Diagnostics",
    },
    wmts: { set: "2km", maxLevel: 5, ext: "png" },
    start: { year: 1980, month: 1 },
    latest: { year: 2026, month: 3 },
    description: "Near-surface air temperature (MERRA-2 reanalysis).",
  },
  sst: {
    id: "sst",
    label: "Sea surface temp",
    category: "Temperature",
    wmsLayer: "MODIS_Aqua_L3_SST_Thermal_9km_Day_Monthly",
    dataset: {
      shortName: "MODIS_AQUA_L3_SST_THERMAL_MONTHLY_9KM_DAYTIME_V2019.0",
      version: "2019.0",
      doi: "10.5067/MODSA-MO9D9",
      title: "MODIS Aqua L3 SST Thermal IR Monthly 9km Daytime",
    },
    wmts: { set: "2km", maxLevel: 5, ext: "png" },
    start: { year: 2002, month: 7 },
    // Verified against GIBS DescribeDomains 2026-08-14; extended at boot by
    // its own freshness family (added 2026-08-15 — this pin is the fallback).
    latest: { year: 2026, month: 4 },
    unpublished: MODIS_AQUA_SST_DAY_UNPUBLISHED_MONTHS,
    // Both sampling gates, not just the diurnal one: a thermal-infrared
    // retrieval exists only under cloud-free sky, so the monthly field averages
    // a non-random subset of the month's days. See sstObservingConstraints —
    // `sstCaptionConstraintOmissions` keeps this caption in step with it.
    description:
      "Daytime clear-sky ocean surface temperature (MODIS/Aqua thermal).",
  },
  precip: {
    id: "precip",
    label: "Precipitation",
    category: "Water",
    wmsLayer: "GLDAS_Surface_Total_Precipitation_Rate_Monthly",
    dataset: {
      shortName: "GLDAS_NOAH025_M",
      version: "2.1",
      doi: "10.5067/SXAVCZFAQLNO",
      title: "GLDAS Noah Land Surface Model L4 monthly 0.25°",
    },
    wmts: { set: "2km", maxLevel: 5, ext: "png" },
    start: { year: 2000, month: 1 },
    latest: { year: 2026, month: 1 },
    description: "Total precipitation rate (GLDAS land model).",
  },
  soil: {
    id: "soil",
    label: "Soil moisture",
    category: "Water",
    wmsLayer: "GLDAS_Underground_Soil_Moisture_Monthly",
    dataset: {
      shortName: "GLDAS_NOAH025_M",
      version: "2.1",
      doi: "10.5067/SXAVCZFAQLNO",
      title: "GLDAS Noah Land Surface Model L4 monthly 0.25°",
    },
    wmts: { set: "2km", maxLevel: 5, ext: "png" },
    start: { year: 2000, month: 1 },
    latest: { year: 2026, month: 1 },
    // Depth is GIBS's own ("Soil Moisture (Monthly, 0-10 cm, Noah LSM,
    // GLDAS)"), not the root zone. Kept literal to preserve this module's
    // dependency-free contract; soilMoistureDepth.test.ts pins the two together.
    description: "Surface soil moisture, 0-10 cm (GLDAS Noah) — not root zone.",
  },
  snow: {
    id: "snow",
    label: "Snow cover",
    category: "Cryosphere",
    wmsLayer: "MODIS_Terra_L3_Snow_Cover_Monthly_Average_Pct",
    dataset: {
      shortName: "MOD10CM",
      version: "61",
      doi: "10.5067/MODIS/MOD10CM.061",
      title: "MODIS/Terra Snow Cover Monthly L3 Global 0.05Deg CMG",
    },
    wmts: { set: "2km", maxLevel: 5, ext: "png" },
    start: { year: 2000, month: 3 },
    unpublished: MOD10CM_UNPUBLISHED_MONTHS,
    description:
      "Average snow-cover percentage — watch winter advance/retreat.",
  },
  aerosol: {
    id: "aerosol",
    label: "Aerosols (AOD)",
    category: "Atmosphere",
    wmsLayer: "MERRA2_Total_Aerosol_Optical_Thickness_550nm_Extinction_Monthly",
    dataset: {
      shortName: "M2TMNXAER",
      version: "5.12.4",
      doi: "10.5067/FH9A0MLJPC7N",
      title: "MERRA-2 tavgM_2d_aer_Nx: Monthly Aerosol Diagnostics",
    },
    wmts: { set: "2km", maxLevel: 5, ext: "png" },
    start: { year: 1980, month: 1 },
    latest: { year: 2026, month: 3 },
    // AOD is a whole-column optical thickness, so it cannot see the surface
    // concentration an "air quality" caption used to promise here; and both
    // sibling atmosphere captions name their production method (see
    // lib/atmosphereLayerClaims.ts, which guards both points).
    description:
      "Aerosol optical thickness — dust, smoke (MERRA-2 reanalysis).",
  },
  landcover: {
    id: "landcover",
    label: "Land cover (IGBP)",
    category: "Land",
    // Verified against GIBS WMTS capabilities: annual, 2001-01-01/2024-01-01/P1Y.
    wmsLayer: "MODIS_Combined_L3_IGBP_Land_Cover_Type_Annual",
    dataset: {
      shortName: "MCD12Q1",
      version: "061",
      doi: "10.5067/MODIS/MCD12Q1.061",
      title: "MODIS Land Cover Type Yearly L3 Global 500m",
    },
    wmts: { set: "500m", maxLevel: 7, ext: "png" },
    start: { year: 2001, month: 1 },
    latest: { year: 2024, month: 1 },
    cadence: "annual",
    categorical: true,
    description:
      "Annual land-cover classification (17 IGBP classes, MODIS MCD12Q1).",
  },
  terrain: {
    id: "terrain",
    label: "Terrain (shaded relief)",
    category: "Terrain",
    wmsLayer: "ASTER_GDEM_Color_Shaded_Relief",
    dataset: {
      shortName: "ASTGTM",
      version: "003",
      doi: "10.5067/ASTER/ASTGTM.003",
      title: "ASTER Global Digital Elevation Model V003",
    },
    wmts: { set: "31.25m", maxLevel: 11, ext: "jpg" },
    start: { year: 2000, month: 3 }, // static dataset — the timeline has no effect
    static: true,
    description:
      "ASTER GDEM color shaded relief — landforms, mountain belts, and basins.",
  },
};

/** Display order within the picker (grouped by category). */
export const LAYER_ORDER: LayerId[] = [
  "ndvi",
  "evi",
  "lst",
  "airtemp",
  "sst",
  "precip",
  "soil",
  "snow",
  "aerosol",
  "landcover",
  "terrain",
];

export const CATEGORY_ORDER: LayerCategory[] = [
  "Vegetation",
  "Temperature",
  "Water",
  "Cryosphere",
  "Atmosphere",
  "Land",
  "Terrain",
];

/** Layers grouped by category, in display order. */
export function layersByCategory(): {
  category: LayerCategory;
  ids: LayerId[];
}[] {
  return CATEGORY_ORDER.map((category) => ({
    category,
    ids: LAYER_ORDER.filter((id) => LAYERS[id].category === category),
  }));
}

/**
 * Clamp a slider index so it never points past a layer's latest available
 * month — so switching to a layer that lags (e.g. reanalysis) snaps to a month
 * that actually has data instead of showing an empty globe.
 */
export function clampIndexToLayer(
  months: YearMonth[],
  index: number,
  layer: LayerConfig
): number {
  const latestIndex = ymToIndex(layer.latest ?? DATA_LATEST);
  if (months.length === 0) return 0;
  if (ymToIndex(months[index]) <= latestIndex) return index;
  for (let i = months.length - 1; i >= 0; i--) {
    if (ymToIndex(months[i]) <= latestIndex) return i;
  }
  return 0;
}

// --- Year/month arithmetic --------------------------------------------------

/** Absolute month index (months since year 0). Makes math trivial. */
export function ymToIndex(ym: YearMonth): number {
  return ym.year * 12 + (ym.month - 1);
}

export function indexToYm(index: number): YearMonth {
  return { year: Math.floor(index / 12), month: (index % 12) + 1 };
}

export function addMonths(ym: YearMonth, delta: number): YearMonth {
  return indexToYm(ymToIndex(ym) + delta);
}

/** Negative if a < b, 0 if equal, positive if a > b. */
export function compareYm(a: YearMonth, b: YearMonth): number {
  return ymToIndex(a) - ymToIndex(b);
}

export function formatYm(ym: YearMonth): string {
  return `${MONTH_NAMES[ym.month - 1]} ${ym.year}`;
}

export function ymEqual(a: YearMonth, b: YearMonth): boolean {
  return a.year === b.year && a.month === b.month;
}

/**
 * Build a list of consecutive months, oldest → newest, of length `count`,
 * ending at `end` (inclusive).
 */
export function buildMonthRange(end: YearMonth, count: number): YearMonth[] {
  const endIndex = ymToIndex(end);
  const out: YearMonth[] = [];
  for (let i = count - 1; i >= 0; i--) {
    out.push(indexToYm(endIndex - i));
  }
  return out;
}

/**
 * Whether a month was actually published for a layer — inside [start, latest]
 * *and* not one of the months the product skipped (see `unpublished`). A month
 * in a distribution gap is as unavailable as one before the record began.
 */
export function isAvailable(layer: LayerConfig, ym: YearMonth): boolean {
  return (
    compareYm(ym, layer.start) >= 0 &&
    compareYm(ym, layer.latest ?? DATA_LATEST) <= 0 &&
    !isUnpublished(layer, ym)
  );
}

/** Whether a month falls in one of a layer's declared distribution gaps. */
export function isUnpublished(layer: LayerConfig, ym: YearMonth): boolean {
  return layer.unpublished?.some((gap) => ymEqual(gap, ym)) ?? false;
}

/**
 * Every published month for a layer, oldest → newest — the layer's full
 * scientific record (MERRA-2 layers reach back to 1980), not a fixed window.
 * Annual layers get one entry per year (its January), so the same scrubber
 * steps by year.
 *
 * Months the product never distributed are dropped, so the record stays a list
 * of months that exist: the scrubber cannot land on a tile that 404s, and no
 * consumer that walks this list — the place panel, the probe series, the
 * same-calendar-month baselines — records a distribution gap as a month that
 * was observed and came back empty. The entries are therefore not guaranteed
 * consecutive; `nearestMonthIndex` already handles that, as it must for the
 * annual layers.
 */
export function monthRangeForLayer(layer: LayerConfig): YearMonth[] {
  const latest = layer.latest ?? DATA_LATEST;
  if (layer.cadence === "annual") {
    const out: YearMonth[] = [];
    for (let year = layer.start.year; year <= latest.year; year++) {
      out.push({ year, month: 1 });
    }
    return published(
      layer,
      out.length > 0 ? out : [{ year: layer.start.year, month: 1 }]
    );
  }
  const count = ymToIndex(latest) - ymToIndex(layer.start) + 1;
  return published(layer, buildMonthRange(latest, Math.max(1, count)));
}

/** Drop a layer's declared distribution gaps from an enumerated record. */
function published(layer: LayerConfig, months: YearMonth[]): YearMonth[] {
  if (!layer.unpublished?.length) return months;
  return months.filter((ym) => !isUnpublished(layer, ym));
}

/**
 * Index of the timeline entry closest to a calendar month. Unlike raw
 * month-index arithmetic this works for annual layers, whose entries are
 * not consecutive months.
 */
export function nearestMonthIndex(months: YearMonth[], ym: YearMonth): number {
  let best = 0;
  let bestDist = Number.POSITIVE_INFINITY;
  for (let i = 0; i < months.length; i++) {
    const dist = Math.abs(ymToIndex(months[i]) - ymToIndex(ym));
    if (dist < bestDist) {
      bestDist = dist;
      best = i;
    }
  }
  return best;
}

/** Scrubber/provenance label: bare year for annual layers, "Mon YYYY" else. */
export function formatTimelineLabel(layer: LayerConfig, ym: YearMonth): string {
  return layer.cadence === "annual" ? String(ym.year) : formatYm(ym);
}

// --- Slider position mapping ------------------------------------------------

/** Map a 0..1 track fraction to a clamped index in [0, count - 1]. */
export function fractionToIndex(fraction: number, count: number): number {
  if (count <= 1) return 0;
  const i = Math.round(fraction * (count - 1));
  return Math.min(count - 1, Math.max(0, i));
}

/** Map an index to its 0..1 track fraction. */
export function indexToFraction(index: number, count: number): number {
  if (count <= 1) return 0;
  return Math.min(1, Math.max(0, index / (count - 1)));
}

// --- GIBS imagery -----------------------------------------------------------

export interface GibsImageOptions {
  width?: number;
  height?: number;
  format?: string;
}

/**
 * Build a GIBS WMS GetMap URL for a full equirectangular (EPSG:4326) image of
 * the given layer and month. Months are addressed by their first day; static
 * (time-less) layers get no TIME param.
 */
export function gibsWmsUrl(
  layer: LayerConfig,
  ym: YearMonth,
  options: GibsImageOptions = {}
): string {
  const { width = 2048, height = 1024, format = "image/jpeg" } = options;

  const params = new URLSearchParams({
    SERVICE: "WMS",
    REQUEST: "GetMap",
    VERSION: "1.3.0",
    LAYERS: layer.wmsLayer,
    CRS: "EPSG:4326",
    BBOX: "-90,-180,90,180",
    WIDTH: String(width),
    HEIGHT: String(height),
    FORMAT: format,
  });
  if (!layer.static) {
    params.set("TIME", `${ym.year}-${String(ym.month).padStart(2, "0")}-01`);
  }

  return `https://gibs.earthdata.nasa.gov/wms/epsg4326/best/wms.cgi?${params.toString()}`;
}
