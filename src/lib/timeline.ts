/**
 * Timeline model for the temporal scrubber.
 *
 * Pure, render-free logic: the catalog of seasonal data layers, year/month
 * math, GIBS image URLs, and slider position mapping. Kept dependency-free so
 * it's fast and deterministic to unit-test (see timeline.test.ts).
 *
 * Imagery: NASA GIBS (Global Imagery Browse Services) monthly composites —
 * cloud-free, gap-free, public domain, served with permissive CORS so the
 * browser can load them straight into WebGL textures.
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
  | "aerosol";

export type LayerCategory =
  "Vegetation" | "Temperature" | "Water" | "Cryosphere" | "Atmosphere";

/** A calendar month. `month` is 1-12 (1 = January). */
export interface YearMonth {
  year: number;
  month: number;
}

export interface LayerConfig {
  id: LayerId;
  label: string;
  category: LayerCategory;
  /** GIBS WMS layer identifier. */
  wmsLayer: string;
  /** Earliest month available for this layer. */
  start: YearMonth;
  /** Most recent month available (defaults to DATA_LATEST). Reanalysis and
   * some products lag further behind than the MODIS composites. */
  latest?: YearMonth;
  description: string;
}

/**
 * The most recent month with published data. Monthly composites lag the
 * current month (the current month isn't finalised until it ends), so this
 * trails "today". Bump it as NASA publishes new months.
 */
export const DATA_LATEST: YearMonth = { year: 2026, month: 5 };

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

export const LAYERS: Record<LayerId, LayerConfig> = {
  ndvi: {
    id: "ndvi",
    label: "Vegetation (NDVI)",
    category: "Vegetation",
    wmsLayer: "MODIS_Terra_L3_NDVI_Monthly",
    start: { year: 2000, month: 3 },
    description: "Vegetation greenness — the classic seasonal-cycle signal.",
  },
  evi: {
    id: "evi",
    label: "Vegetation (EVI)",
    category: "Vegetation",
    wmsLayer: "MODIS_Terra_L3_EVI_Monthly",
    start: { year: 2000, month: 3 },
    description:
      "Enhanced vegetation index — less saturated over dense canopy.",
  },
  lst: {
    id: "lst",
    label: "Land surface temp",
    category: "Temperature",
    wmsLayer: "MODIS_Terra_L3_Land_Surface_Temp_Monthly_Day",
    start: { year: 2000, month: 3 },
    description: "Daytime land-surface temperature (MODIS/Terra).",
  },
  airtemp: {
    id: "airtemp",
    label: "Air temperature (2 m)",
    category: "Temperature",
    wmsLayer: "MERRA2_2m_Air_Temperature_Monthly",
    start: { year: 1980, month: 1 },
    latest: { year: 2026, month: 3 },
    description: "Near-surface air temperature (MERRA-2 reanalysis).",
  },
  sst: {
    id: "sst",
    label: "Sea surface temp",
    category: "Temperature",
    wmsLayer: "MODIS_Aqua_L3_SST_Thermal_9km_Day_Monthly",
    start: { year: 2002, month: 7 },
    latest: { year: 2026, month: 3 },
    description: "Ocean surface temperature (MODIS/Aqua thermal).",
  },
  precip: {
    id: "precip",
    label: "Precipitation",
    category: "Water",
    wmsLayer: "GLDAS_Surface_Total_Precipitation_Rate_Monthly",
    start: { year: 2000, month: 1 },
    latest: { year: 2026, month: 1 },
    description: "Total precipitation rate (GLDAS land model).",
  },
  soil: {
    id: "soil",
    label: "Soil moisture",
    category: "Water",
    wmsLayer: "GLDAS_Underground_Soil_Moisture_Monthly",
    start: { year: 2000, month: 1 },
    latest: { year: 2026, month: 1 },
    description: "Root-zone soil moisture (GLDAS) — drought & agriculture.",
  },
  snow: {
    id: "snow",
    label: "Snow cover",
    category: "Cryosphere",
    wmsLayer: "MODIS_Terra_L3_Snow_Cover_Monthly_Average_Pct",
    start: { year: 2000, month: 3 },
    description:
      "Average snow-cover percentage — watch winter advance/retreat.",
  },
  aerosol: {
    id: "aerosol",
    label: "Aerosols (AOD)",
    category: "Atmosphere",
    wmsLayer: "MERRA2_Total_Aerosol_Optical_Thickness_550nm_Extinction_Monthly",
    start: { year: 1980, month: 1 },
    latest: { year: 2026, month: 3 },
    description: "Aerosol optical thickness — dust, smoke, and air quality.",
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
];

export const CATEGORY_ORDER: LayerCategory[] = [
  "Vegetation",
  "Temperature",
  "Water",
  "Cryosphere",
  "Atmosphere",
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

/** Whether a month falls within a layer's published range. */
export function isAvailable(layer: LayerConfig, ym: YearMonth): boolean {
  return compareYm(ym, layer.start) >= 0 && compareYm(ym, DATA_LATEST) <= 0;
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
 * the given layer and month. Months are addressed by their first day.
 */
export function gibsWmsUrl(
  layer: LayerConfig,
  ym: YearMonth,
  options: GibsImageOptions = {}
): string {
  const { width = 2048, height = 1024, format = "image/jpeg" } = options;
  const time = `${ym.year}-${String(ym.month).padStart(2, "0")}-01`;

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
    TIME: time,
  });

  return `https://gibs.earthdata.nasa.gov/wms/epsg4326/best/wms.cgi?${params.toString()}`;
}
