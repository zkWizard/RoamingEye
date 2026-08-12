import { describe, it, expect } from "vitest";
import { LEGENDS, type GradientLegendSpec } from "./legend";
import { buildColormapLut, invertColormap, PROBE_SCALES } from "./probe";
import { MEASURED_INVERSION } from "./validation";

/**
 * The 2 m air-temperature legend must keep describing the ramp GIBS actually
 * renders the layer with.
 *
 * `MERRA2_2m_Air_Temperature_Monthly` paints 220–310 K by interpolating nine
 * ColorBrewer Spectral anchors, and the legend's stops are taken from that
 * colormap so the bar the reader sees and the LUT the probe inverts describe
 * the same imagery. Before that, five hand-drawn stops opened on violet —
 * GIBS's *below-220 K* overflow colour, not the blue it paints at 220 K — and
 * ran to a dark red GIBS never paints, so half the ramp fell outside the
 * no-data threshold and was discarded, and what survived inverted at 18.95 K
 * RMSE.
 *
 * The weekly contract test (`contract/inversion-validation.contract.test.ts`)
 * re-measures this against the live colormap. This offline guard pins the
 * behaviour that matters to a reader — every rendered temperature inverts, and
 * inverts to roughly the right temperature — so a legend edit that
 * reintroduces the old drift fails in ordinary CI rather than a week later.
 *
 * The fixture is copied from the live colormap document (fetched 2026-08-11);
 * it is provenance, not a re-derivation.
 */

/** Colours MERRA-2 renders at ten temperatures spanning the ramp. */
const GIBS_RAMP: readonly {
  kelvin: number;
  rgb: { r: number; g: number; b: number };
}[] = [
  { kelvin: 220.5, rgb: { r: 52, g: 138, b: 187 } },
  { kelvin: 230.5, rgb: { r: 99, g: 191, b: 166 } },
  { kelvin: 240.5, rgb: { r: 161, g: 217, b: 164 } },
  { kelvin: 250.5, rgb: { r: 216, g: 239, b: 154 } },
  { kelvin: 260.5, rgb: { r: 247, g: 251, b: 178 } },
  { kelvin: 270.5, rgb: { r: 254, g: 236, b: 160 } },
  { kelvin: 280.5, rgb: { r: 253, g: 199, b: 118 } },
  { kelvin: 290.5, rgb: { r: 249, g: 147, b: 84 } },
  { kelvin: 300.5, rgb: { r: 234, g: 94, b: 70 } },
  { kelvin: 309.5, rgb: { r: 207, g: 56, b: 77 } },
];

/**
 * The two bins GIBS paints outside the probe's scale: violet below 220 K and
 * dark crimson at or above 310 K. Neither is a temperature the bar can place,
 * so both must be withheld rather than pinned to an endpoint.
 */
const OUT_OF_RANGE = {
  belowMinimum: { r: 94, g: 79, b: 162 },
  aboveMaximum: { r: 158, g: 1, b: 66 },
};

/**
 * Per-colour tolerance. The full-ramp residual is 0.51 K RMSE with a 1.03 K
 * 95th percentile, and the worst of the sampled colours (260.5 K, on the
 * ramp's low-contrast pale-yellow shoulder) lands 1.15 K out — the 256-step
 * LUT alone quantizes to 0.35 K. 1.5 K keeps that headroom while still failing
 * an order of magnitude before the 18.95 K the hand-drawn gradient produced.
 */
const KELVIN_TOLERANCE = 1.5;

const spec = LEGENDS.airtemp as GradientLegendSpec;
const scale = PROBE_SCALES.airtemp;
const lut = buildColormapLut(spec.stops);

/** Invert a rendered colour to kelvin, or null when it is off the gradient. */
function invertToKelvin(rgb: {
  r: number;
  g: number;
  b: number;
}): number | null {
  const position = invertColormap(rgb, lut);
  return position === null
    ? null
    : scale.min + position * (scale.max - scale.min);
}

describe("2 m air-temperature legend vs the GIBS colormap", () => {
  it("spans exactly the temperatures the probe scale reports", () => {
    expect(scale.min).toBe(220);
    expect(scale.max).toBe(310);
    expect(spec.stops[0].at).toBe(0);
    expect(spec.stops[spec.stops.length - 1].at).toBe(1);
  });

  it("recovers every sampled rendered temperature to within 1.5 K", () => {
    for (const { kelvin, rgb } of GIBS_RAMP) {
      const recovered = invertToKelvin(rgb);
      expect(
        recovered,
        `${kelvin} K is rendered as rgb(${rgb.r},${rgb.g},${rgb.b}) but the legend rejects it as no-data`
      ).not.toBeNull();
      expect(
        Math.abs(recovered! - kelvin),
        `${kelvin} K inverted to ${recovered?.toFixed(2)} K`
      ).toBeLessThanOrEqual(KELVIN_TOLERANCE);
    }
  });

  it("keeps the recovered ramp strictly increasing", () => {
    const recovered = GIBS_RAMP.map((entry) => invertToKelvin(entry.rgb)!);
    for (let i = 1; i < recovered.length; i++) {
      expect(
        recovered[i],
        `${GIBS_RAMP[i].kelvin} K did not invert warmer than ${GIBS_RAMP[i - 1].kelvin} K`
      ).toBeGreaterThan(recovered[i - 1]);
    }
  });

  it("withholds the colours GIBS paints outside the scale", () => {
    // A violet Antarctic winter pixel is colder than 220 K by an unknown
    // margin; reporting it as 220 K would invent a measurement. Same at the
    // hot end. Both must read as no-data.
    expect(invertToKelvin(OUT_OF_RANGE.belowMinimum)).toBeNull();
    expect(invertToKelvin(OUT_OF_RANGE.aboveMaximum)).toBeNull();
  });

  it("keeps the published accuracy figure consistent with a full-ramp legend", () => {
    const measured = MEASURED_INVERSION.airtemp;
    // Every ramp colour inverts, so nothing is discarded as no-data...
    expect(measured.nulls).toBe(0);
    // ...and the residual is well inside the ramp's own 1 K binning.
    expect(measured.rmse).not.toBeNull();
    expect(measured.rmse!).toBeLessThan(1);
  });

  it("tells the reader that off-ramp colours are not the ends of the scale", () => {
    // The bar cannot show the overflow bins, so the note has to.
    expect(spec.interpretationNote).toBeDefined();
    expect(spec.interpretationNote).toContain("220");
    expect(spec.interpretationNote).toContain("310");
  });
});
