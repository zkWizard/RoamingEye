import { describe, it, expect } from "vitest";
import { validateInversion, MEASURED_INVERSION } from "./validation";
import { COLORMAP_DOCS, type ColormapEntry } from "./colormap";
import { buildColormapLut, invertColormap, NO_DATA_DISTANCE } from "./probe";
import { LEGENDS, type GradientLegendSpec } from "./legend";

/**
 * Offline guards for the NDVI legend's calibration against GIBS's own
 * MODIS_L3_NDVI colormap.
 *
 * The weekly contract test re-measures the whole ramp live. These cases pin
 * the properties that made the recalibration necessary, so a future legend
 * edit that quietly reintroduces them fails here rather than in a once-a-week
 * network run: the ramp's brown→green discontinuity near NDVI 0.3, and the
 * requirement that an undrawn (black) tile pixel never reads as greenness.
 *
 * Anchor colours below are transcribed from MODIS_L3_NDVI; each is the RGB
 * GIBS publishes for the stated NDVI value.
 */

const ndviLegend = LEGENDS.ndvi as GradientLegendSpec;
const lut = buildColormapLut(ndviLegend.stops);

/** (value, rgb) pairs taken from GIBS's MODIS_L3_NDVI colormap document. */
const GIBS_ANCHORS: ColormapEntry[] = [
  { value: 0.0025, rgb: { r: 241, g: 236, b: 236 } },
  { value: 0.0975, rgb: { r: 223, g: 206, b: 194 } },
  { value: 0.1975, rgb: { r: 176, g: 155, b: 138 } },
  { value: 0.2975, rgb: { r: 150, g: 90, b: 71 } },
  { value: 0.3488, rgb: { r: 164, g: 198, b: 61 } },
  { value: 0.4987, rgb: { r: 86, g: 161, b: 0 } },
  { value: 0.5962, rgb: { r: 62, g: 138, b: 1 } },
  { value: 0.695, rgb: { r: 33, g: 120, b: 1 } },
  { value: 0.795, rgb: { r: 8, g: 103, b: 1 } },
  { value: 0.895, rgb: { r: 0, g: 84, b: 1 } },
];

describe("NDVI legend ↔ GIBS MODIS_L3_NDVI", () => {
  it("names GIBS's own NDVI colormap as the calibration reference", () => {
    // The WMTS capabilities tie MODIS_Terra_L3_NDVI_Monthly to this document.
    expect(COLORMAP_DOCS.ndvi).toBe("MODIS_L3_NDVI");
  });

  it("recovers every GIBS anchor colour to within 0.06 NDVI", () => {
    for (const anchor of GIBS_ANCHORS) {
      const pos = invertColormap(anchor.rgb, lut);
      expect(
        pos,
        `NDVI ${anchor.value} was rejected as no-data`
      ).not.toBeNull();
      expect(
        Math.abs(pos! - anchor.value),
        `NDVI ${anchor.value} inverted to ${pos}`
      ).toBeLessThan(0.06);
    }
  });

  it("keeps the measured RMSE consistent with the committed figure", () => {
    const stats = validateInversion("ndvi", GIBS_ANCHORS);
    const committed = MEASURED_INVERSION.ndvi;
    expect(committed.rmse).not.toBeNull();
    expect(stats.nulls).toBe(0);
    // The anchors are a decimated sample of the full ramp, so this asserts the
    // same order of magnitude rather than the exact live number.
    expect(stats.rmse!).toBeLessThan(committed.rmse! * 3);
  });

  it("straddles the ramp's brown→green discontinuity with adjacent stops", () => {
    // GIBS jumps from brown (150,90,71) to yellow-green (164,198,61) between
    // NDVI 0.2975 and 0.3488. A gradient that interpolates smoothly across
    // that gap misreads the whole sparse-vegetation end, so the legend must
    // spend a short segment on it.
    const jump = ndviLegend.stops.findIndex(
      (stop, i) => i > 0 && stop.at - ndviLegend.stops[i - 1].at <= 0.05
    );
    expect(jump, "no short segment carries the hue jump").toBeGreaterThan(0);
    const brown = ndviLegend.stops[jump - 1];
    const green = ndviLegend.stops[jump];
    expect(brown.at).toBeGreaterThan(0.2);
    expect(green.at).toBeLessThan(0.4);
  });

  it("never reads an undrawn tile pixel as greenness", () => {
    // GIBS serves undrawn areas — ocean, unpublished months — as black in
    // JPEG tiles, and its NDVI ramp runs to within 24 RGB units of black.
    // Anchoring the top stop on those darkest greens would make open water
    // invert to maximum NDVI, so the legend stops short of them.
    expect(invertColormap({ r: 0, g: 0, b: 0 }, lut)).toBeNull();
    // The published "Fill" colour must stay no-data too.
    expect(invertColormap({ r: 0, g: 26, b: 105 }, lut)).toBeNull();

    const nearestToBlack = Math.min(
      ...lut.map((c) => Math.hypot(c.r, c.g, c.b))
    );
    expect(nearestToBlack).toBeGreaterThan(NO_DATA_DISTANCE);
  });

  it("keeps every interpolated colour inside the RGB cube", () => {
    // buildColormapLut extrapolates past the final stop, so stops that stop
    // short of at: 1 would generate negative channels.
    expect(ndviLegend.stops[0].at).toBe(0);
    expect(ndviLegend.stops[ndviLegend.stops.length - 1].at).toBe(1);
    for (const c of lut) {
      for (const channel of [c.r, c.g, c.b]) {
        expect(channel).toBeGreaterThanOrEqual(0);
        expect(channel).toBeLessThanOrEqual(255);
      }
    }
  });
});
