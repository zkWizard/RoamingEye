import { describe, it, expect } from "vitest";
import { LEGENDS, type GradientLegendSpec } from "./legend";
import {
  buildColormapLut,
  invertColormap,
  NO_DATA_DISTANCE,
  PROBE_SCALES,
} from "./probe";

/**
 * Offline guard for the sea-surface-temperature legend against the ramp GIBS
 * publishes for MODIS_Sea_Surface_Temperature (0–32 °C).
 *
 * The legend is what the point/area probe inverts sampled pixels through, so
 * its stops are a measurement instrument, not decoration. Before it was
 * rebuilt from that ramp it was a smooth cool-to-warm gradient while GIBS
 * renders a spectral one; the two disagreed enough that every ramp colour
 * between 20 °C and 24 °C landed outside NO_DATA_DISTANCE and probed as
 * no-data, and a true 8 °C inverted to 0 °C.
 *
 * The colours below are sampled from that published colormap (bin midpoints).
 * The live-XML re-measurement is the weekly contract
 * (contract/inversion-validation.contract.test.ts); this keeps the property
 * offline-testable and names the failure when a legend edit regresses it.
 */

/** Published GIBS SST ramp colours, ~2 °C apart, as (truth °C, rgb). */
const GIBS_SST_RAMP: {
  truth: number;
  rgb: { r: number; g: number; b: number };
}[] = [
  { truth: 0.07, rgb: { r: 45, g: 0, b: 28 } },
  { truth: 2.02, rgb: { r: 85, g: 2, b: 73 } },
  { truth: 3.97, rgb: { r: 122, g: 6, b: 119 } },
  { truth: 5.92, rgb: { r: 77, g: 9, b: 97 } },
  { truth: 8.03, rgb: { r: 30, g: 18, b: 78 } },
  { truth: 9.98, rgb: { r: 31, g: 46, b: 118 } },
  { truth: 11.93, rgb: { r: 33, g: 75, b: 158 } },
  { truth: 14.02, rgb: { r: 40, g: 120, b: 200 } },
  { truth: 15.98, rgb: { r: 46, g: 163, b: 239 } },
  { truth: 17.93, rgb: { r: 30, g: 163, b: 93 } },
  { truth: 20.02, rgb: { r: 120, g: 211, b: 0 } },
  { truth: 20.93, rgb: { r: 187, g: 232, b: 0 } },
  { truth: 21.98, rgb: { r: 248, g: 245, b: 0 } },
  { truth: 23.02, rgb: { r: 255, g: 212, b: 0 } },
  { truth: 23.93, rgb: { r: 255, g: 180, b: 0 } },
  { truth: 26.02, rgb: { r: 250, g: 109, b: 0 } },
  { truth: 27.98, rgb: { r: 224, g: 62, b: 0 } },
  { truth: 29.93, rgb: { r: 176, g: 27, b: 0 } },
  { truth: 31.9, rgb: { r: 110, g: 3, b: 0 } },
];

/** The black GIBS renders where the L3 product carries no SST. */
const NO_DATA_RGB = { r: 0, g: 0, b: 0 };

const lut = (): ReturnType<typeof buildColormapLut> =>
  buildColormapLut((LEGENDS.sst as GradientLegendSpec).stops);

/** Invert a colour to °C on the SST probe scale, or null if rejected. */
function recover(rgb: { r: number; g: number; b: number }): number | null {
  const scale = PROBE_SCALES.sst;
  const pos = invertColormap(rgb, lut());
  return pos === null ? null : scale.min + pos * (scale.max - scale.min);
}

describe("SST legend vs the GIBS ramp", () => {
  it("recovers a value for every published ramp colour", () => {
    for (const { truth, rgb } of GIBS_SST_RAMP) {
      expect(
        recover(rgb),
        `GIBS renders ${truth} °C as rgb(${rgb.r},${rgb.g},${rgb.b}); the legend rejected it as no-data`
      ).not.toBeNull();
    }
  });

  it("keeps the subtropical band that the old gradient dropped entirely", () => {
    // 20–24 °C was 27 of 27 ramp colours rejected before the rebuild.
    for (const { truth, rgb } of GIBS_SST_RAMP.filter(
      (s) => s.truth >= 20 && s.truth < 24
    )) {
      const got = recover(rgb);
      expect(got, `${truth} °C rejected`).not.toBeNull();
      expect(
        Math.abs(got! - truth),
        `${truth} °C recovered as ${got}`
      ).toBeLessThan(1);
    }
  });

  it("inverts the ramp above 4 °C to within 1 °C", () => {
    for (const { truth, rgb } of GIBS_SST_RAMP.filter((s) => s.truth >= 4)) {
      const got = recover(rgb);
      expect(got, `${truth} °C rejected`).not.toBeNull();
      expect(
        Math.abs(got! - truth),
        `${truth} °C recovered as ${got?.toFixed(2)}`
      ).toBeLessThan(1);
    }
  });

  it("holds the whole-ramp RMSE near the published 1.0 °C figure", () => {
    const errors = GIBS_SST_RAMP.map(({ truth, rgb }) => {
      const got = recover(rgb);
      expect(got, `${truth} °C rejected`).not.toBeNull();
      return got! - truth;
    });
    const rmse = Math.sqrt(
      errors.reduce((s, e) => s + e * e, 0) / errors.length
    );
    // Sampled every ~2 °C, so this is coarser than the full 213-entry figure
    // the contract test measures; it still fails loudly on a real regression.
    expect(rmse, `whole-ramp RMSE ${rmse.toFixed(2)} °C`).toBeLessThan(2.5);
  });

  it("still rejects the black GIBS renders where there is no SST", () => {
    // The load-bearing safety property: empty pixels (land, sea ice, cloud)
    // must not invert into plausible near-freezing water and be averaged in.
    expect(
      recover(NO_DATA_RGB),
      "no-data black inverted to a temperature"
    ).toBeNull();

    const stops = (LEGENDS.sst as GradientLegendSpec).stops;
    const nearest = Math.min(
      ...buildColormapLut(stops).map((c) =>
        Math.hypot(
          c.r - NO_DATA_RGB.r,
          c.g - NO_DATA_RGB.g,
          c.b - NO_DATA_RGB.b
        )
      )
    );
    expect(
      nearest,
      `the gradient's darkest colour is ${nearest.toFixed(1)} from no-data black, inside the ${NO_DATA_DISTANCE}-unit threshold`
    ).toBeGreaterThan(NO_DATA_DISTANCE);
  });
});
