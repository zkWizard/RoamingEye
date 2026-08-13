import type { LayerId } from "./timeline";
import { DEPTH_CLASS_COLORS } from "./earthquakes";
import { ERUPTION_CLASS_COLORS, ERUPTION_CLASS_LABELS } from "./volcanoes";
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
    // Sampled from GIBS's own MODIS_L3_NDVI colormap — the document its WMTS
    // capabilities ties to MODIS_Terra_L3_NDVI_Monthly — rather than drawn by
    // hand, so the probe inverts rendered pixels through the ramp NASA
    // actually draws. Two features of that ramp drive the stop placement:
    //   * It is near-white at low NDVI and only reaches brown around 0.28,
    //     then jumps abruptly to yellow-green. The 0.28→0.30 pair carries
    //     that discontinuity; a smooth ramp through it would misread the
    //     sparse-vegetation end entirely.
    //   * Its darkest greens run to within 24 RGB units of black. Because
    //     GIBS serves undrawn pixels as black in JPEG tiles, anchoring the
    //     top stop there would make open ocean read as maximum greenness.
    //     The top stop therefore stops at the NDVI-0.905 hue, 72 units from
    //     black, which clears NO_DATA_DISTANCE (60) with margin.
    stops: [
      { color: "#f1ecec", at: 0 }, // sparse / bare — GIBS's near-white low end
      { color: "#9d7c5f", at: 0.28 }, // brown, just below the ramp's hue jump
      { color: "#a7cc4b", at: 0.3 }, // yellow-green, just above it
      { color: "#126e01", at: 0.7 },
      { color: "#004800", at: 1 }, // dense canopy, held clear of black
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
    // Sampled from GIBS's own MODIS_Land_Surface_Temp colormap — the document
    // the LST tiles are rendered with — rather than drawn by hand. GIBS paints
    // this layer as a *full-spectrum rainbow* (magenta → violet → blue → cyan
    // → green → yellow → orange → red) across 200.3–349.7 K, and that ramp is
    // piecewise-linear in RGB, so stops placed on its hue corners reproduce
    // the rendered ramp instead of approximating it.
    //
    // The five hand-drawn stops these replace were a muted blue → green →
    // yellow → red gradient with no magenta or violet anywhere. That gradient
    // did not merely misread the cold end — it missed the rendered ramp so
    // completely that **all 250 published colours** fell outside
    // NO_DATA_DISTANCE and inverted to no-data. LST was the app's only layer
    // whose probe recovered nothing at all; it now recovers every colour at
    // 0.317 K RMSE. See validation.MEASURED_INVERSION and lstLegend.test.ts.
    //
    // Two deliberate departures from the published colours:
    //   * The end stops sit at 0 and 1 (200 K and 350 K) while GIBS's ramp is
    //     published over 200.3–349.7 K, so each end extrapolates its segment by
    //     0.3 K. The legend bar has to span the probe scale it labels; holding
    //     the ends inside it would leave the bar's extremes uncoloured.
    //   * The cold stop is GIBS's magenta with red pulled 197 → 194. Pure
    //     magenta (#ff00ff) sits 58 units from the published colour — inside
    //     the 60-unit no-data threshold — so the unmodified hue would make an
    //     off-gradient magenta pixel read as a 200 K measurement. The 3/255
    //     nudge buys that separation. Same trade the NDVI ramp above makes
    //     against black.
    stops: [
      { color: "#c200ff", at: 0 }, // 200 K — coldest rendered surface
      { color: "#0100ff", at: 0.198 }, // 229.7 K — violet → pure blue corner
      { color: "#001aff", at: 0.214 }, // 232.1 K
      { color: "#00ffff", at: 0.394 }, // 259.1 K — cyan corner
      { color: "#04fff7", at: 0.398 }, // 259.7 K
      { color: "#0bffe6", at: 0.402 }, // 260.3 K
      { color: "#6dff01", at: 0.51 }, // 276.5 K — green
      { color: "#ffff00", at: 0.666 }, // 299.9 K — yellow corner
      { color: "#ff0400", at: 1 }, // 350 K — hot desert surfaces
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
    // Taken from the ramp GIBS renders MODIS_Sea_Surface_Temperature with
    // (0–32 °C), sampled every ~2 °C. It is a spectral ramp — magenta and
    // deep blue for cold water, green/yellow through the subtropics, red at
    // the warm end — not the smooth cool-to-warm gradient this legend used to
    // draw. That mismatch was not cosmetic: it put the whole 20–24 °C band
    // (27 of 27 ramp colours) outside NO_DATA_DISTANCE, so subtropical water
    // probed as no-data, and a true 8 °C inverted to 0 °C.
    //
    // The cold end is deliberately anchored at GIBS's ~2 °C hue rather than
    // its true 0 °C colour (#2d001c): that colour sits only 53 units from the
    // black GIBS renders where the L3 product has no SST, i.e. inside the
    // 60-unit no-data threshold, so drawing it faithfully would invert land,
    // sea ice, and cloud into plausible near-freezing water. The cost is
    // absolute accuracy below ~4 °C (RMSE 2.8 °C there); the benefit is that
    // empty pixels stay rejected. See docs/validation.md.
    stops: [
      { color: "#550249", at: 0 }, // near-freezing seas (GIBS ~2 °C hue)
      { color: "#7a0677", at: 0.124 },
      { color: "#4d0961", at: 0.185 },
      { color: "#1e124e", at: 0.251 },
      { color: "#1f2e76", at: 0.312 },
      { color: "#214b9e", at: 0.373 },
      { color: "#2878c8", at: 0.438 },
      { color: "#2ea3ef", at: 0.499 },
      { color: "#1ea35d", at: 0.56 },
      { color: "#78d300", at: 0.626 },
      { color: "#f8f500", at: 0.687 },
      { color: "#ffb400", at: 0.748 },
      { color: "#fa6d00", at: 0.813 },
      { color: "#e03e00", at: 0.874 },
      { color: "#b01b00", at: 0.935 },
      { color: "#6e0300", at: 1 }, // warm tropical basins
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
    // Taken from the colormap GIBS actually renders the layer with
    // (colormaps/v1.3/GLDAS_Underground_Soil_Moisture_Monthly.xml): a reversed
    // *spectral* ramp — red = dry, yellow-green mid, blue = wet — not the
    // brown → teal gradient this legend used to draw. Every stop below is a
    // verbatim GIBS anchor colour placed at the position of the 1 kg/m² bin it
    // labels on the 0–50 scale (bin i covers [i, i+1], midpoint i+0.5). Only
    // the two end stops are moved, stretched to 0 and 1 so the bar spans the
    // full scale; that costs half a bin (0.5 kg/m²) at each end.
    stops: [
      { color: "#d53e4f", at: 0 }, // driest ground GIBS draws
      { color: "#f46d43", at: 0.15 },
      { color: "#fdae61", at: 0.29 },
      { color: "#fee08b", at: 0.43 },
      { color: "#e6f598", at: 0.57 },
      { color: "#abdda4", at: 0.71 },
      { color: "#66c2a5", at: 0.85 },
      { color: "#3288bd", at: 1 }, // waterlogged ground
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
      {
        color: ERUPTION_CLASS_COLORS.recent,
        label: ERUPTION_CLASS_LABELS.recent,
      },
      {
        color: ERUPTION_CLASS_COLORS.historic,
        label: ERUPTION_CLASS_LABELS.historic,
      },
      {
        color: ERUPTION_CLASS_COLORS.holocene,
        label: ERUPTION_CLASS_LABELS.holocene,
      },
    ],
  },
};

/** Key spec for an overlay id, or undefined for overlays without one. */
export function overlayKeyFor(id: string): OverlayKeySpec | undefined {
  return id in OVERLAY_KEYS
    ? OVERLAY_KEYS[id as keyof typeof OVERLAY_KEYS]
    : undefined;
}
