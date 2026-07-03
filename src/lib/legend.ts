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
};

/** Build the CSS `linear-gradient(...)` for a legend's stops. */
export function gradientCss(stops: LegendStop[]): string {
  const parts = stops.map((s) => `${s.color} ${Math.round(s.at * 100)}%`);
  return `linear-gradient(to right, ${parts.join(", ")})`;
}
