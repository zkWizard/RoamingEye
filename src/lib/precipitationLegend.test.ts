import { describe, it, expect } from "vitest";
import { LEGENDS, type GradientLegendSpec } from "./legend";
import { buildColormapLut, invertColormap, scaleValue } from "./probe";
import { PROBE_SCALES } from "./probe";
import { MEASURED_INVERSION } from "./validation";

/**
 * The precipitation legend has to describe the ramp GIBS actually renders the
 * tiles with, because the probe recovers a rain rate by inverting a sampled
 * colour through it. `GLDAS_Surface_Total_Precipitation_Rate_Monthly` is a
 * *spectral* colormap — red at the dry end, blue at the wet end — not the
 * dry-tan → wet-blue gradient a rainfall layer invites.
 *
 * These are offline regression tests over a committed sample of that colormap.
 * The live re-measurement (all 50 colours, current XML) is the weekly
 * `contract/inversion-validation.contract.test.ts`; this file fails fast, in
 * ordinary CI, if the stops drift back toward a hand-drawn guess.
 */

/**
 * Colours published in the GIBS colormap, paired with the rate each stands
 * for (bin midpoint × 86 400 s/day). Sampled across the ramp on 2026-08-11.
 */
const GIBS_RAMP: {
  rgb: { r: number; g: number; b: number };
  mmPerDay: number;
}[] = [
  { rgb: { r: 213, g: 62, b: 79 }, mmPerDay: 0.432 },
  { rgb: { r: 244, g: 109, b: 67 }, mmPerDay: 6.48 },
  { rgb: { r: 253, g: 174, b: 97 }, mmPerDay: 12.528 },
  { rgb: { r: 254, g: 224, b: 139 }, mmPerDay: 18.576 },
  { rgb: { r: 230, g: 245, b: 152 }, mmPerDay: 24.624 },
  { rgb: { r: 171, g: 221, b: 164 }, mmPerDay: 30.672 },
  { rgb: { r: 102, g: 194, b: 165 }, mmPerDay: 36.72 },
  { rgb: { r: 50, g: 136, b: 189 }, mmPerDay: 42.768 },
];

const scale = PROBE_SCALES.precip;
const spec = LEGENDS.precip as GradientLegendSpec;

/** Run a rendered colour through the production inversion, as the probe does. */
function invertToMmPerDay(rgb: {
  r: number;
  g: number;
  b: number;
}): number | null {
  const pos = invertColormap(rgb, buildColormapLut(spec.stops));
  return pos === null ? null : scaleValue(pos, scale);
}

describe("precipitation legend ↔ the GIBS ramp it inverts", () => {
  it("recovers every sampled ramp colour to within 1 mm/day", () => {
    for (const { rgb, mmPerDay } of GIBS_RAMP) {
      const got = invertToMmPerDay(rgb);
      expect(got, `${mmPerDay} mm/day was rejected as no-data`).not.toBeNull();
      expect(
        Math.abs(got! - mmPerDay),
        `${mmPerDay} mm/day inverted to ${got?.toFixed(2)}`
      ).toBeLessThan(1);
    }
  });

  it("does not read GIBS's mid-range rates as no rain", () => {
    // The regression this legend was rebuilt for: under the old tan → blue
    // gradient, GIBS's pale-yellow mid-range colours sat nearest the legend's
    // dry end, so genuine monsoon-level rain inverted to 0.0 mm/day.
    const paleYellow = { r: 254, g: 224, b: 139 }; // 18.576 mm/day
    const got = invertToMmPerDay(paleYellow);
    expect(got).not.toBeNull();
    expect(got!).toBeGreaterThan(10);
  });

  it("rejects no ramp colour as no-data", () => {
    // A rejected colour is not a small error — the month silently leaves the
    // series, biasing every statistic computed over it.
    const rejected = GIBS_RAMP.filter(
      ({ rgb }) => invertToMmPerDay(rgb) === null
    );
    expect(rejected).toEqual([]);
    expect(MEASURED_INVERSION.precip.nulls).toBe(0);
  });

  it("keeps the stops ordered and spanning the full 0..1 bar", () => {
    const positions = spec.stops.map((s) => s.at);
    expect(positions[0]).toBe(0);
    expect(positions[positions.length - 1]).toBe(1);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
  });

  it("warns that this ramp renders dry as red, not heavy rain", () => {
    // Red reads as "extreme" on most rainfall maps; on this one it is the
    // driest colour. The legend must say so or the globe misleads.
    expect(spec.interpretationNote).toBeTruthy();
    expect(spec.interpretationNote!.toLowerCase()).toContain("red");
    expect(spec.stops[0].color).toBe("#d53e4f"); // GIBS's driest rendered colour
  });
});
