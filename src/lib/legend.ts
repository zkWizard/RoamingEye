import type { LayerId } from "./timeline";
import { DEPTH_CLASS_COLORS } from "./earthquakes";
import { ERUPTION_CLASS_COLORS } from "./volcanoes";
import { PROBE_SCALES, formatProbeValue, scaleValue } from "./probe";
import { IGBP_LAND_COVER_CLASSES } from "./landCover";
import { IGBP_RENDERED_PALETTE } from "./landCoverPalette";
import { vegetationIndexLegendNote } from "./vegetationIndexRenderedRange";

/**
 * Legend model: what the colors on the globe mean, per data layer.
 *
 * Pure, render-free data + helpers (see legend.test.ts). The gradients
 * approximate the GIBS colormaps the imagery is served with — close enough to
 * read the globe, without fetching NASA's colormap XML at runtime.
 */

/** One color stop along the legend bar. `at` is a 0..1 position. */
export interface LegendStop {
  color: string;
  at: number;
}

/** Continuous layers: a gradient bar with min/max end labels. */
export interface GradientLegendSpec {
  kind?: "gradient";
  /** What the scale measures, in plain words. */
  measures: string;
  /** Label under the low end of the bar. */
  minLabel: string;
  /** Label under the high end of the bar. */
  maxLabel: string;
  /** Gradient stops, sorted by `at`, spanning 0 → 1. */
  stops: LegendStop[];
  /** Optional guardrail shown with the legend when colors need interpretation. */
  interpretationNote?: string;
}

/** Categorical layers (e.g. land cover): named class swatches, no gradient. */
export interface ClassLegendSpec {
  kind: "classes";
  measures: string;
  classes: { color: string; label: string }[];
  interpretationNote?: string;
}

export type LegendSpec = GradientLegendSpec | ClassLegendSpec;

export const LEGENDS: Record<LayerId, LegendSpec> = {
  ndvi: {
    measures: "Vegetation greenness (NDVI)",
    minLabel: "lower NDVI",
    maxLabel: "higher NDVI",
    interpretationNote: vegetationIndexLegendNote("ndvi"),
    stops: [
      { color: "#a97c50", at: 0 }, // bare soil / desert browns
      { color: "#d9c38a", at: 0.25 },
      { color: "#c7d96a", at: 0.5 },
      { color: "#5da83f", at: 0.75 },
      { color: "#1a6b1a", at: 1 }, // dense canopy
    ],
  },
  evi: {
    measures: "Vegetation greenness (EVI)",
    minLabel: "lower EVI",
    maxLabel: "higher EVI",
    interpretationNote: vegetationIndexLegendNote("evi"),
    stops: [
      { color: "#a97c50", at: 0 },
      { color: "#d9c38a", at: 0.25 },
      { color: "#c7d96a", at: 0.5 },
      { color: "#4c9c38", at: 0.75 },
      { color: "#125e12", at: 1 },
    ],
  },
  snow: {
    measures: "Snow cover (monthly average)",
    minLabel: "0%",
    maxLabel: "100%",
    interpretationNote:
      "GIBS renders this layer in 20-point bands below 81%, and draws no colour at all for 0% — so snow-free ground and an unobserved pixel look the same. Cloud, night, water and fill are drawn as flag colours, not snow amounts.",
    // GIBS renders these tiles with the MODIS_NDSI_Snow_Cover colormap — a
    // *discrete* ramp (yellow → red), not the blue → white one a snow layer
    // invites. Each stop below is a colour published in that document, at the
    // position of the percent it stands for, so the bar the user reads and the
    // LUT the probe inverts both describe the imagery on the globe. See
    // lib/snowCoverRamp.ts for the audit and the weekly contract check.
    stops: [
      { color: "#f0f080", at: 0 }, // 1% — 0% is transparent, never drawn
      { color: "#f0f093", at: 0.2 }, // 20%, top of the first band
      { color: "#f0d280", at: 0.21 }, // 21%
      { color: "#f0d293", at: 0.4 }, // 40%
      { color: "#f0b480", at: 0.41 }, // 41%
      { color: "#f0b493", at: 0.6 }, // 60%
      { color: "#f09680", at: 0.61 }, // 61%
      { color: "#f09693", at: 0.8 }, // 80%
      { color: "#f07880", at: 0.81 }, // 81% — finely resolved above here
      { color: "#f08585", at: 0.99 }, // 99%
      { color: "#ff0000", at: 1 }, // 100% — a colour of its own
    ],
  },
  lst: {
    measures: "Land surface temperature (day)",
    minLabel: "cold",
    maxLabel: "hot",
    stops: [
      { color: "#2c3ea8", at: 0 }, // frozen ground / high latitudes
      { color: "#3fa0c7", at: 0.25 },
      { color: "#7ec96a", at: 0.5 },
      { color: "#f2c94c", at: 0.75 },
      { color: "#c62828", at: 1 }, // hot desert surfaces
    ],
  },
  airtemp: {
    measures: "Air temperature at 2 m",
    minLabel: "cold",
    maxLabel: "hot",
    interpretationNote:
      "The bar covers 220–310 K only. GIBS paints anything colder violet and anything warmer dark crimson — neither is on this ramp, so both read as no-data rather than as the end of the scale.",
    // Colours published in MERRA2_2m_Air_Temperature_Monthly (the colormap the
    // tiles are rendered with). GIBS draws that ramp by interpolating nine
    // ColorBrewer Spectral anchors across 220–310 K, so nine stops placed on
    // those anchors reproduce the rendered ramp rather than approximating it.
    // The previous five hand-drawn stops opened on violet — GIBS's *below-220 K*
    // overflow colour, not its 220 K blue — and ran to a dark red GIBS never
    // paints, so 44 of the 90 ramp colours sat further than the no-data
    // threshold from the gradient and were rejected outright, while the rest
    // inverted at 18.95 K RMSE. See validation.MEASURED_INVERSION and the
    // inversion-validation contract for the measured before/after.
    stops: [
      { color: "#348abb", at: 0 }, // 220 K — coldest rendered temperature
      { color: "#66c2a5", at: 0.125 }, // 231 K
      { color: "#addea3", at: 0.25 }, // 243 K
      { color: "#e6f598", at: 0.375 }, // 254 K
      { color: "#fefdbc", at: 0.5 }, // 265 K
      { color: "#fdd985", at: 0.625 }, // 276 K
      { color: "#fca85e", at: 0.75 }, // 288 K
      { color: "#ef6644", at: 0.875 }, // 299 K
      { color: "#cf384d", at: 1 }, // 310 K — warmest rendered temperature
    ],
  },
  sst: {
    measures: "Sea surface temperature",
    minLabel: "polar",
    maxLabel: "tropical",
    stops: [
      { color: "#3a1f6e", at: 0 }, // near-freezing seas
      { color: "#2c6fbb", at: 0.35 },
      { color: "#3fbf9f", at: 0.6 },
      { color: "#f2c94c", at: 0.8 },
      { color: "#d84315", at: 1 }, // warm tropical basins
    ],
  },
  precip: {
    measures: "Precipitation rate",
    minLabel: "dry",
    maxLabel: "wet",
    interpretationNote:
      "GIBS renders this layer on a spectral ramp where dry is red and wet is blue — the reverse of the usual rain palette. Red is the driest colour on the globe, not the heaviest rainfall.",
    // Colours published in GLDAS_Surface_Total_Precipitation_Rate_Monthly (the
    // colormap the tiles are rendered with), each placed at the position of the
    // rate it stands for, so the bar the user reads and the LUT the probe
    // inverts both describe the imagery. The previous tan → blue gradient was a
    // hand-drawn guess: it put GIBS's pale-yellow mid-range rates nearest its
    // dry end, so ~20 mm/day inverted to 0.0 mm/day and 23 of 50 ramp colours
    // were rejected outright as no-data. See validation.MEASURED_INVERSION and
    // the inversion-validation contract for the measured before/after.
    stops: [
      { color: "#d53e4f", at: 0 }, // 0.0 mm/day — driest rendered rate
      { color: "#eb5f46", at: 0.1111 }, // 4.8 mm/day
      { color: "#f99254", at: 0.2222 }, // 9.6 mm/day
      { color: "#fdbc6c", at: 0.3333 }, // 14.4 mm/day
      { color: "#fae38c", at: 0.4444 }, // 19.2 mm/day
      { color: "#e9f296", at: 0.5556 }, // 24.0 mm/day
      { color: "#bbe3a0", at: 0.6667 }, // 28.8 mm/day
      { color: "#8dd1a4", at: 0.7778 }, // 33.6 mm/day
      { color: "#57b1ab", at: 0.8889 }, // 38.4 mm/day
      { color: "#3288bd", at: 1 }, // 43.2 mm/day — monsoon-level rainfall
    ],
  },
  soil: {
    measures: "Soil moisture (underground)",
    minLabel: "dry",
    maxLabel: "saturated",
    stops: [
      { color: "#a9743f", at: 0 }, // parched soil
      { color: "#c9b178", at: 0.35 },
      { color: "#63a58f", at: 0.7 },
      { color: "#1f6f6b", at: 1 }, // waterlogged ground
    ],
  },
  aerosol: {
    measures: "Aerosol optical thickness (550 nm)",
    minLabel: "clear air",
    maxLabel: "thick haze",
    stops: [
      { color: "#f5f2e9", at: 0 }, // clean atmosphere
      { color: "#e8c977", at: 0.35 },
      { color: "#d88a3f", at: 0.7 },
      { color: "#8f3a1f", at: 1 }, // dust storms / smoke plumes
    ],
  },
  landcover: {
    kind: "classes",
    measures: "Land-cover class (IGBP)",
    // The 17 IGBP classes + Unclassified, colored exactly as GIBS renders
    // them (colormaps/v1.3/MODIS_IGBP_Land_Cover_Type.xml).
    classes: IGBP_LAND_COVER_CLASSES.map(({ code, label }) => ({
      color: rgbHex(IGBP_RENDERED_PALETTE[code]),
      label,
    })),
  },
  terrain: {
    measures: "Elevation (shaded relief)",
    minLabel: "lowlands",
    maxLabel: "high peaks",
    stops: [
      { color: "#3e7d47", at: 0 }, // low plains read green
      { color: "#b6a86a", at: 0.35 },
      { color: "#8a6a4a", at: 0.65 },
      { color: "#e8e4dc", at: 1 }, // snow-capped elevations
    ],
  },
};

function rgbHex({ r, g, b }: { r: number; g: number; b: number }): string {
  return `#${[r, g, b]
    .map((channel) => channel.toString(16).padStart(2, "0"))
    .join("")}`;
}

/** Build the CSS `linear-gradient(...)` for a legend's stops. */
export function gradientCss(stops: LegendStop[]): string {
  const parts = stops.map((s) => `${s.color} ${Math.round(s.at * 100)}%`);
  return `linear-gradient(to right, ${parts.join(", ")})`;
}

/**
 * Numeric ticks for a layer's gradient bar — min/mid/max in the layer's
 * physical units, straight from PROBE_SCALES so the legend and the probe can
 * never disagree about what a color is worth. Null for categorical layers
 * (class swatches, not a gradient) and for uncalibrated ones (terrain):
 * a color bar without trustworthy numbers shows none rather than fake ones.
 */
export function legendTicks(
  id: LayerId
): { min: string; mid: string; max: string } | null {
  if (LEGENDS[id].kind === "classes") return null;
  const scale = PROBE_SCALES[id];
  if (!scale.calibrated) return null;
  const fmt = (t: number): string =>
    formatProbeValue(scaleValue(t, scale), scale);
  return { min: fmt(0), mid: fmt(0.5), max: fmt(1) };
}

/** One swatch + label in an overlay's color key. */
export interface OverlayKeyEntry {
  color: string;
  label: string;
}

export interface OverlayKeySpec {
  /** What the colors encode, in plain words. */
  title: string;
  entries: OverlayKeyEntry[];
}

/**
 * Color keys for overlays whose markers are color-coded (beyond the data
 * layer the gradient legend covers). Colors are the same constants the
 * overlays render with, so the key can never drift from the globe.
 */
export const OVERLAY_KEYS: Record<"quakes" | "volcanoes", OverlayKeySpec> = {
  quakes: {
    title: "Quake depth",
    entries: [
      { color: DEPTH_CLASS_COLORS.shallow, label: "< 70 km" },
      { color: DEPTH_CLASS_COLORS.intermediate, label: "70–300 km" },
      { color: DEPTH_CLASS_COLORS.deep, label: "> 300 km" },
    ],
  },
  volcanoes: {
    title: "Last eruption",
    entries: [
      { color: ERUPTION_CLASS_COLORS.recent, label: "since 1900" },
      { color: ERUPTION_CLASS_COLORS.historic, label: "1 CE–1899" },
      { color: ERUPTION_CLASS_COLORS.holocene, label: "Holocene only" },
    ],
  },
};

/** Key spec for an overlay id, or undefined for overlays without one. */
export function overlayKeyFor(id: string): OverlayKeySpec | undefined {
  return id in OVERLAY_KEYS
    ? OVERLAY_KEYS[id as keyof typeof OVERLAY_KEYS]
    : undefined;
}
