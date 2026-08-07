import type { LayerId } from "./timeline";
import { DEPTH_CLASS_COLORS } from "./earthquakes";
import { ERUPTION_CLASS_COLORS } from "./volcanoes";
import { PROBE_SCALES, formatProbeValue, scaleValue } from "./probe";
import { IGBP_LAND_COVER_CLASSES } from "./landCover";
import { IGBP_RENDERED_PALETTE } from "./landCoverPalette";

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
    interpretationNote:
      "NDVI is a unitless vegetation index; color does not measure vegetation cover, biomass, or condition.",
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
    interpretationNote:
      "EVI is a unitless vegetation index; color does not measure vegetation cover, biomass, or condition.",
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
    stops: [
      { color: "#274a6d", at: 0 }, // snow-free ground reads dark
      { color: "#5b87ad", at: 0.35 },
      { color: "#a8c8dd", at: 0.7 },
      { color: "#ffffff", at: 1 }, // full snow cover
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
    stops: [
      { color: "#4a2e8f", at: 0 }, // polar air
      { color: "#2c6fbb", at: 0.3 },
      { color: "#7ec96a", at: 0.55 },
      { color: "#f2a33c", at: 0.8 },
      { color: "#b71c1c", at: 1 }, // tropical heat
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
    stops: [
      { color: "#d9d2be", at: 0 }, // arid ground
      { color: "#9ec9e0", at: 0.35 },
      { color: "#3f83bf", at: 0.7 },
      { color: "#173f7a", at: 1 }, // monsoon-level rainfall
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
