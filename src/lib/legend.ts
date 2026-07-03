import type { LayerId } from "./timeline";

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

export interface LegendSpec {
  /** What the scale measures, in plain words. */
  measures: string;
  /** Label under the low end of the bar. */
  minLabel: string;
  /** Label under the high end of the bar. */
  maxLabel: string;
  /** Gradient stops, sorted by `at`, spanning 0 → 1. */
  stops: LegendStop[];
}

export const LEGENDS: Record<LayerId, LegendSpec> = {
  ndvi: {
    measures: "Vegetation greenness (NDVI)",
    minLabel: "bare / sparse",
    maxLabel: "dense & lush",
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
    minLabel: "bare / sparse",
    maxLabel: "dense & lush",
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
};

/** Build the CSS `linear-gradient(...)` for a legend's stops. */
export function gradientCss(stops: LegendStop[]): string {
  const parts = stops.map((s) => `${s.color} ${Math.round(s.at * 100)}%`);
  return `linear-gradient(to right, ${parts.join(", ")})`;
}
