import { describe, it, expect } from "vitest";
import { LEGENDS, type GradientLegendSpec } from "./legend";
import {
  buildColormapLut,
  invertColormap,
  NO_DATA_DISTANCE,
  PROBE_SCALES,
} from "./probe";
import { MEASURED_INVERSION } from "./validation";

/**
 * Calibration pin for the 2 m air-temperature legend.
 *
 * The probe reconstructs a temperature by inverting a sampled pixel through
 * `LEGENDS.airtemp`, so that gradient is not decoration — it is the instrument.
 * These cases hold it against the ramp GIBS actually renders MERRA-2 2 m air
 * temperature with (colormaps/v1.3/MERRA2_2m_Air_Temperature_Monthly.xml,
 * read 2026-08-11), so a later freehand edit to the stops cannot quietly
 * re-open the ~19 K error this calibration closed.
 *
 * Offline by construction: the sampled ramp colours below are transcribed from
 * that document. The live re-measurement is the weekly contract test
 * (contract/inversion-validation.contract.test.ts).
 */

const SPEC = LEGENDS.airtemp as GradientLegendSpec;
const LUT = buildColormapLut(SPEC.stops);
const SCALE = PROBE_SCALES.airtemp;

/** Invert a colour to kelvin on the pinned scale, or null for no-data. */
function invertToKelvin(rgb: {
  r: number;
  g: number;
  b: number;
}): number | null {
  const pos = invertColormap(rgb, LUT);
  return pos === null ? null : SCALE.min + pos * (SCALE.max - SCALE.min);
}

/**
 * Every tenth entry of the colormap's continuous ramp, plus its warm end.
 * `kelvin` is the bin midpoint, exactly as the validation harness scores it.
 */
const RAMP_SAMPLE: {
  rgb: { r: number; g: number; b: number };
  kelvin: number;
}[] = [
  { rgb: { r: 50, g: 136, b: 189 }, kelvin: 220 },
  { rgb: { r: 73, g: 162, b: 178 }, kelvin: 225.5 },
  { rgb: { r: 97, g: 188, b: 167 }, kelvin: 230 },
  { rgb: { r: 127, g: 203, b: 164 }, kelvin: 235.5 },
  { rgb: { r: 158, g: 216, b: 164 }, kelvin: 240 },
  { rgb: { r: 187, g: 227, b: 160 }, kelvin: 245.5 },
  { rgb: { r: 213, g: 238, b: 155 }, kelvin: 250 },
  { rgb: { r: 234, g: 246, b: 159 }, kelvin: 255.5 },
  { rgb: { r: 245, g: 251, b: 176 }, kelvin: 260 },
  { rgb: { r: 254, g: 252, b: 186 }, kelvin: 265.5 },
  { rgb: { r: 254, g: 238, b: 162 }, kelvin: 270 },
  { rgb: { r: 254, g: 224, b: 139 }, kelvin: 275.5 },
  { rgb: { r: 253, g: 201, b: 119 }, kelvin: 280 },
  { rgb: { r: 253, g: 178, b: 100 }, kelvin: 285.5 },
  { rgb: { r: 249, g: 150, b: 86 }, kelvin: 290 },
  { rgb: { r: 245, g: 120, b: 72 }, kelvin: 295.5 },
  { rgb: { r: 235, g: 96, b: 70 }, kelvin: 300 },
  { rgb: { r: 221, g: 74, b: 75 }, kelvin: 305.5 },
  { rgb: { r: 205, g: 53, b: 77 }, kelvin: 310 },
];

/**
 * The colormap's open end caps. `[-INF,220)` and `[310,+INF)` are real
 * observations, but the ramp gives them no position — they are bounds, not
 * values — so the inversion must withhold them rather than name a number.
 */
const END_CAPS = {
  belowScale: { r: 94, g: 79, b: 162 }, // #5e4fa2, tooltip "< 220"
  aboveScale: { r: 158, g: 1, b: 66 }, // #9e0142, tooltip "≥ 310"
};

describe("airtemp legend is anchored on the rendered GIBS ramp", () => {
  it("starts at the 220 K ramp colour, not the under-range cap", () => {
    // The regression this pins: the previous cold stop (#4a2e8f) approximated
    // #5e4fa2, the "colder than the scale" cap, so the whole gradient was
    // shifted off the ramp it is supposed to invert.
    expect(SPEC.stops[0]).toEqual({ color: "#3288bd", at: 0 });
    expect(SPEC.stops[SPEC.stops.length - 1]).toEqual({
      color: "#d53e4f",
      at: 1,
    });
  });

  it("spans 0 → 1 with stops in ascending position", () => {
    expect(SPEC.stops[0].at).toBe(0);
    expect(SPEC.stops[SPEC.stops.length - 1].at).toBe(1);
    for (let i = 1; i < SPEC.stops.length; i++) {
      expect(SPEC.stops[i].at).toBeGreaterThan(SPEC.stops[i - 1].at);
    }
  });

  it("recovers every sampled ramp colour to within 2 K", () => {
    for (const { rgb, kelvin } of RAMP_SAMPLE) {
      const recovered = invertToKelvin(rgb);
      expect(recovered, `${kelvin} K colour read as no-data`).not.toBeNull();
      expect(
        Math.abs(recovered! - kelvin),
        `${kelvin} K recovered as ${recovered?.toFixed(2)} K`
      ).toBeLessThan(2);
    }
  });

  it("keeps the recovered values ordered with temperature", () => {
    // Monotonicity is what the trend and anomaly maths actually rests on; an
    // inversion can be biased and still honest about ordering, but not this.
    const recovered = RAMP_SAMPLE.map(({ rgb }) => invertToKelvin(rgb));
    for (let i = 1; i < recovered.length; i++) {
      expect(recovered[i]!).toBeGreaterThan(recovered[i - 1]!);
    }
  });

  it("withholds the open end caps instead of naming a value", () => {
    expect(invertToKelvin(END_CAPS.belowScale)).toBeNull();
    expect(invertToKelvin(END_CAPS.aboveScale)).toBeNull();
  });

  it("still rejects the colours that are not observations", () => {
    // GIBS's declared no-data entry, plus the opaque-JPEG background the probe
    // sees where a tile carries no drawn pixel.
    expect(invertToKelvin({ r: 255, g: 0, b: 255 })).toBeNull();
    expect(invertToKelvin({ r: 0, g: 0, b: 0 })).toBeNull();
    expect(invertToKelvin({ r: 10, g: 10, b: 10 })).toBeNull();
    expect(invertToKelvin({ r: 255, g: 255, b: 255 })).toBeNull();
  });

  it("keeps every reading under JPEG channel noise, at a stated cost", () => {
    // The probe samples JPEG tiles, so a recovered colour must survive the
    // ±10 per-channel wobble NO_DATA_DISTANCE is sized for.
    expect(NO_DATA_DISTANCE).toBeGreaterThan(17); // hypot(10,10,10) ≈ 17.3

    // Anchoring the gradient removes the *systematic* error; it does not make
    // the inversion noise-free, and the residual is not uniform along the
    // ramp. Spectral changes hue slowly through its pale-yellow midpoint, so a
    // small RGB perturbation there slides a long way in temperature. Measured
    // worst case over all eight sign combinations of the sampled ramp:
    //
    //   ±4/channel →  3.5 K (at 265.5 K)   ±8/channel → 13.3 K (at 270 K)
    //   ±6/channel →  9.1 K (at 260 K)     ±10/channel → 18.1 K (at 255.5 K)
    //
    // Coverage is what stays robust: no perturbation drops a sample. That is
    // the property the trend and anomaly maths depends on, and the reason
    // per-value uncertainty is reported rather than implied.
    let worst = 0;
    for (const { rgb, kelvin } of RAMP_SAMPLE) {
      for (const sr of [-1, 1]) {
        for (const sg of [-1, 1]) {
          for (const sb of [-1, 1]) {
            const noisy = {
              r: Math.min(255, Math.max(0, rgb.r + sr * 8)),
              g: Math.min(255, Math.max(0, rgb.g + sg * 8)),
              b: Math.min(255, Math.max(0, rgb.b + sb * 8)),
            };
            const recovered = invertToKelvin(noisy);
            expect(
              recovered,
              `${kelvin} K + noise read as no-data`
            ).not.toBeNull();
            worst = Math.max(worst, Math.abs(recovered! - kelvin));
          }
        }
      }
    }
    expect(worst, "noise sensitivity regressed").toBeLessThan(15);
  });

  it("matches the committed inversion figures", () => {
    // MEASURED_INVERSION is what METHODS.md §3, docs/validation.md and the
    // probe's reported ± band all quote; keep the pin and the published
    // accuracy from drifting apart.
    expect(MEASURED_INVERSION.airtemp.nulls).toBe(0);
    expect(MEASURED_INVERSION.airtemp.rmse).not.toBeNull();
    expect(MEASURED_INVERSION.airtemp.rmse!).toBeLessThan(2);

    const errors = RAMP_SAMPLE.map(
      ({ rgb, kelvin }) => invertToKelvin(rgb)! - kelvin
    );
    const rmse = Math.sqrt(
      errors.reduce((s, e) => s + e * e, 0) / errors.length
    );
    // The sampled RMSE is not the full-ramp figure, but it must not sit an
    // order of magnitude away from the number the docs publish.
    expect(rmse).toBeLessThan(MEASURED_INVERSION.airtemp.rmse! * 3);
  });
});
