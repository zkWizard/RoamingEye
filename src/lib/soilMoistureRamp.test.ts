import { describe, it, expect } from "vitest";
import { LEGENDS, type GradientLegendSpec } from "./legend";
import { buildColormapLut, invertColormap, PROBE_SCALES } from "./probe";
import { validateInversion, MEASURED_INVERSION } from "./validation";
import type { ColormapEntry } from "./colormap";

/**
 * The soil-moisture legend is not decorative: its stops are lifted from the
 * colormap GIBS renders the layer with
 * (colormaps/v1.3/GLDAS_Underground_Soil_Moisture_Monthly.xml), so a probed
 * pixel inverts back to the kg/m² NASA drew it from.
 *
 * These entries are verbatim from that document — RGB and the midpoint of the
 * 1 kg/m² bin it labels — sampled across the whole 0–50 ramp and weighted
 * toward the stretches the previous hand-drawn brown → teal gradient rejected
 * outright (everything below 12, most of 19–35, and the wettest bin). The
 * live document is re-checked weekly by
 * contract/inversion-validation.contract.test.ts; this offline pin is what
 * keeps a careless legend edit from silently un-calibrating the layer.
 */
const GIBS_RAMP: ColormapEntry[] = [
  { rgb: { r: 213, g: 62, b: 79 }, value: 0.5 },
  { rgb: { r: 230, g: 88, b: 72 }, value: 4.5 },
  { rgb: { r: 245, g: 118, b: 71 }, value: 8.5 },
  { rgb: { r: 249, g: 146, b: 84 }, value: 11.5 },
  { rgb: { r: 253, g: 181, b: 103 }, value: 15.5 },
  { rgb: { r: 253, g: 209, b: 126 }, value: 19.5 },
  { rgb: { r: 247, g: 229, b: 142 }, value: 23.5 },
  { rgb: { r: 233, g: 242, b: 150 }, value: 27.5 },
  { rgb: { r: 213, g: 238, b: 155 }, value: 30.5 },
  { rgb: { r: 179, g: 224, b: 162 }, value: 34.5 },
  { rgb: { r: 121, g: 201, b: 164 }, value: 40.5 },
  { rgb: { r: 79, g: 169, b: 175 }, value: 45.5 },
  { rgb: { r: 50, g: 136, b: 189 }, value: 49.5 },
];

const spec = LEGENDS.soil as GradientLegendSpec;
const lut = buildColormapLut(spec.stops);
const scale = PROBE_SCALES.soil;

/** Invert a rendered colour to kg/m², or null when read as no-data. */
function probe(rgb: { r: number; g: number; b: number }): number | null {
  const pos = invertColormap(rgb, lut);
  return pos === null ? null : scale.min + pos * (scale.max - scale.min);
}

describe("soil-moisture legend ↔ GIBS colormap", () => {
  it("recovers every sampled ramp colour, none rejected as no-data", () => {
    for (const entry of GIBS_RAMP) {
      expect(
        probe(entry.rgb),
        `${entry.value} kg/m² was read as no-data`
      ).not.toBeNull();
    }
  });

  it("recovers each sampled value to within a kilogram per square metre", () => {
    // 1 kg/m² is one colormap bin. The two end bins carry the full budget:
    // their stops are stretched to 0 and 1 so the legend bar spans the scale,
    // which costs half a bin at each end.
    for (const entry of GIBS_RAMP) {
      expect(
        Math.abs(probe(entry.rgb)! - entry.value),
        `${entry.value} kg/m²`
      ).toBeLessThanOrEqual(1);
    }
  });

  it("keeps the ramp oriented dry-red → wet-blue", () => {
    // GIBS draws this layer on a *reversed* spectral ramp. Flipping it would
    // still invert cleanly but would report every dry soil as saturated, so
    // the orientation is asserted independently of the residuals.
    const driest = probe({ r: 213, g: 62, b: 79 })!;
    const wettest = probe({ r: 50, g: 136, b: 189 })!;
    expect(driest).toBeLessThan(wettest);
    expect(driest).toBeLessThan(5);
    expect(wettest).toBeGreaterThan(45);
  });

  it("still rejects the colours that are not soil moisture", () => {
    // The spectral ramp covers far more of RGB space than the old brown → teal
    // gradient, so no-data rejection has to be re-proven, not assumed.
    expect(probe({ r: 255, g: 0, b: 255 })).toBeNull(); // GIBS "No Data"
    expect(probe({ r: 0, g: 0, b: 0 })).toBeNull(); // undrawn / background
    expect(probe({ r: 255, g: 255, b: 255 })).toBeNull();
    expect(probe({ r: 128, g: 128, b: 128 })).toBeNull(); // ocean / off-land
  });

  it("matches the accuracy figure published in METHODS.md", () => {
    const stats = validateInversion("soil", GIBS_RAMP);
    expect(stats.nulls).toBe(0);
    expect(stats.n).toBe(GIBS_RAMP.length);
    // Committed figure is measured over the full 50-entry ramp; this sampled
    // subset must land in the same regime, not merely "somewhere better".
    expect(stats.rmse!).toBeLessThan(2 * MEASURED_INVERSION.soil.rmse!);
  });

  it("declares the layer fully recovered in the published figures", () => {
    expect(MEASURED_INVERSION.soil.nulls).toBe(0);
    expect(MEASURED_INVERSION.soil.total).toBe(50);
    expect(MEASURED_INVERSION.soil.rmse!).toBeLessThan(1);
  });
});
