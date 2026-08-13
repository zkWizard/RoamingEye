import { describe, it, expect } from "vitest";
import { LEGENDS, type GradientLegendSpec } from "./legend";
import { snapshotColormapEntries } from "./gibsColormapSnapshot";
import { buildColormapLut, invertColormap, NO_DATA_DISTANCE } from "./probe";
import { MEASURED_INVERSION } from "./validation";

/**
 * The land-surface-temperature ramp, pinned against the colormap GIBS renders
 * it with (`MODIS_Land_Surface_Temp`, snapshot in gibsColormaps.json).
 *
 * This layer was the app's only fully broken one: its hand-drawn blue → red
 * gradient bore so little resemblance to GIBS's full-spectrum rainbow that all
 * 250 published ramp colours were rejected as no-data, so the probe recovered
 * nothing for any land pixel at any date. These tests are the regression guard
 * for that repair — they fail if the stops drift back off the published ramp.
 *
 * Source: NASA GIBS colormap `MODIS_Land_Surface_Temp` (v1.3), the document the
 * MODIS Terra daytime LST tiles are rendered with. Cited in METHODS.md §3 and
 * docs/validation.md.
 */

const lst = LEGENDS.lst as GradientLegendSpec;
const entries = snapshotColormapEntries("lst");
const SCALE_MIN = 200;
const SCALE_MAX = 350;

const rgbDistance = (
  a: { r: number; g: number; b: number },
  b: { r: number; g: number; b: number }
): number => Math.hypot(a.r - b.r, a.g - b.g, a.b - b.b);

describe("LST legend follows the GIBS ramp", () => {
  it("spans the probe scale and stays sorted", () => {
    expect(lst.stops[0].at).toBe(0);
    expect(lst.stops[lst.stops.length - 1].at).toBe(1);
    for (let i = 1; i < lst.stops.length; i++) {
      expect(lst.stops[i].at).toBeGreaterThan(lst.stops[i - 1].at);
    }
  });

  it("opens on GIBS's magenta cold end, not a blue one", () => {
    // The defect this pins: the previous ramp opened on #2c3ea8, a muted blue.
    // GIBS paints 200 K magenta, and nothing on the old gradient was within
    // reach of it — which is what made the whole ramp unreadable.
    const cold = lst.stops[0].color;
    expect(cold).toBe("#c200ff");
  });

  it("recovers every published ramp colour", () => {
    const lut = buildColormapLut(lst.stops);
    const rejected = entries.filter(
      (e) => invertColormap(e.rgb, lut) === null
    ).length;
    expect(
      rejected,
      `${rejected} of ${entries.length} GIBS ramp colours read as no-data — the legend has drifted off MODIS_Land_Surface_Temp`
    ).toBe(0);
    expect(MEASURED_INVERSION.lst.nulls).toBe(0);
    expect(MEASURED_INVERSION.lst.total).toBe(entries.length);
  });

  it("inverts the published ramp to within the committed RMSE", () => {
    const lut = buildColormapLut(lst.stops);
    let sumSq = 0;
    let n = 0;
    for (const entry of entries) {
      const t = invertColormap(entry.rgb, lut);
      if (t === null) continue;
      const recovered = SCALE_MIN + t * (SCALE_MAX - SCALE_MIN);
      sumSq += (recovered - entry.value) ** 2;
      n++;
    }
    const rmse = Math.sqrt(sumSq / n);
    expect(n).toBe(entries.length);
    expect(rmse).toBeCloseTo(MEASURED_INVERSION.lst.rmse as number, 3);
    // Sanity floor: a kelvin of error would mean the ramp had drifted badly,
    // whatever the committed figure happens to say.
    expect(rmse).toBeLessThan(1);
  });

  it("keeps pure magenta off the ramp so it cannot read as 200 K", () => {
    // GIBS's own cold colour (#c500ff) is only 58 units from pure magenta —
    // inside NO_DATA_DISTANCE — so the stop is held at #c200ff. Without that
    // nudge an off-gradient magenta pixel inverts to a real temperature.
    const magenta = { r: 255, g: 0, b: 255 };
    const cold = { r: 0xc2, g: 0x00, b: 0xff };
    expect(rgbDistance(magenta, cold)).toBeGreaterThan(NO_DATA_DISTANCE);
    expect(invertColormap(magenta, buildColormapLut(lst.stops))).toBeNull();
  });

  it("keeps black off the ramp (undrawn tile pixels are black)", () => {
    expect(
      invertColormap({ r: 0, g: 0, b: 0 }, buildColormapLut(lst.stops))
    ).toBeNull();
  });

  it("places every interior stop on a colour GIBS actually publishes", () => {
    // Each interior stop is a hue corner sampled from the colormap document;
    // an invented colour would show up here as a large distance.
    for (const stop of lst.stops.slice(1, -1)) {
      const rgb = {
        r: parseInt(stop.color.slice(1, 3), 16),
        g: parseInt(stop.color.slice(3, 5), 16),
        b: parseInt(stop.color.slice(5, 7), 16),
      };
      const nearest = Math.min(...entries.map((e) => rgbDistance(rgb, e.rgb)));
      expect(nearest, `${stop.color} is not a published ramp colour`).toBe(0);
    }
  });
});
