import { describe, it, expect } from "vitest";
import { LEGENDS, type GradientLegendSpec, type LegendStop } from "./legend";
import {
  buildColormapLut,
  invertColormap,
  NO_DATA_DISTANCE,
  type Rgb,
} from "./probe";
import type { LayerId } from "./timeline";

/**
 * CI-enforced accuracy bounds for the probe's colormap inversion — the
 * quantified version of the "approximate, good for trends" claim every CSV
 * header makes.
 *
 * For every gradient legend (new layers inherit these guards automatically):
 *  - a value rendered through the legend's LUT and inverted back lands within
 *    a stated tolerance of the original, clean and under JPEG-like noise;
 *  - inversion is monotone over the sweep (catches collided/ambiguous stops);
 *  - colors far off the gradient (ocean fill, black background) read as
 *    no-data, never as a value.
 *
 * A legend edit that silently degrades probe accuracy fails here, naming the
 * layer and the worst gradient position.
 */

/** Gradient legends only — categorical layers have no numeric inversion. */
const GRADIENT_LEGENDS = Object.entries(LEGENDS).filter(
  (entry): entry is [LayerId, GradientLegendSpec] => entry[1].kind !== "classes"
);

/**
 * Noise-free roundtrip bound, all layers: LUT quantization (1/255) plus
 * nearest-neighbor rounding. Measured worst case is ≤ 0.006 everywhere.
 */
const CLEAN_TOLERANCE = 0.01;

/**
 * Layers whose published ramp cannot meet the default bound.
 *
 * `snow` is the only one: GIBS renders it with a **discrete** colormap
 * (MODIS_NDSI_Snow_Cover) whose colours inside a 20-point band differ by a
 * single channel step, so a 256-entry LUT holds near-duplicates and inversion
 * resolves to the band rather than the step (worst 0.013 — 1.3 of 100
 * percentage points). Reproducing that ramp faithfully is still the right
 * trade: the smooth blue → white gradient it replaced met this bound while
 * rejecting all 100 colours GIBS actually renders. See lib/snowCoverRamp.ts.
 */
const CLEAN_TOLERANCE_OVERRIDES: Record<string, number> = {
  snow: 0.015,
};

const cleanTolerance = (id: string): number =>
  CLEAN_TOLERANCE_OVERRIDES[id] ?? CLEAN_TOLERANCE;

/**
 * Roundtrip bound under ±8/channel perturbation (JPEG-like), per layer —
 * measured worst case plus headroom. These ARE the honest accuracy numbers
 * behind the CSV caveat: e.g. a noisy NDVI inversion can be off by ~0.14 of
 * the color scale where the brown→tan segment is perceptually flat.
 *
 * `terrain` is documented, not defended: its tan midpoint (#b6a86a) nearly
 * collides with the brown→white summit ramp, so noisy inversion is ambiguous
 * (worst ≈ 0.48). The layer is static (no time dimension), so the probe never
 * charts it — but if its legend is ever redrawn, aim below 0.15 like the rest.
 *
 * `snow` is documented too, for a different reason: the detail inside a band
 * of GIBS's discrete ramp is a 19-step blue ripple, finer than the ±8/channel
 * noise the JPEG transport adds, so a noisy sample resolves to its band and
 * can cross into the neighbour (worst 0.378). Measured against GIBS's own ramp
 * colours the same noise costs 6–12 percentage points RMSE (METHODS.md §3):
 * for this layer the binding limit is the JPEG transport, not the legend, and
 * no gradient can recover what compression has already discarded.
 *
 * `airtemp` bought colormap fidelity with noise headroom, and the trade is
 * worth stating. Its stops now reproduce the Spectral ramp GIBS renders with
 * (inversion RMSE against the real colormap fell 18.95 K → 0.51 K, and no ramp
 * colour is rejected any more), but that ramp passes through a near-white
 * pale-yellow shoulder around t ≈ 0.57 (≈ 271 K) where consecutive
 * temperatures are only a channel or two apart. There ±8/channel noise can
 * slide the nearest LUT match by up to 0.162. It is a narrow band, not the
 * whole scale: over the sweep the noisy error is 0.014 median / 0.030 at p90,
 * and only 12 of 501 positions exceed 0.07.
 */
const NOISY_TOLERANCE: Record<string, number> = {
  ndvi: 0.16,
  evi: 0.16,
  snow: 0.4,
  lst: 0.05,
  airtemp: 0.17,
  sst: 0.07,
  precip: 0.09,
  soil: 0.11,
  aerosol: 0.08,
  terrain: 0.5,
};

const SWEEP_STEPS = 500;

const clamp255 = (v: number): number => Math.min(255, Math.max(0, v));

/** Worst |t' − t| over a dense sweep, with an optional per-channel offset. */
function maxRoundtripError(
  stops: LegendStop[],
  perturb: (i: number) => Rgb = () => ({ r: 0, g: 0, b: 0 })
): { error: number; at: number } {
  const lut = buildColormapLut(stops);
  let worst = { error: 0, at: 0 };
  for (let i = 0; i <= SWEEP_STEPS; i++) {
    const t = i / SWEEP_STEPS;
    const c = lut[Math.round(t * (lut.length - 1))];
    const d = perturb(i);
    const noisy = {
      r: clamp255(c.r + d.r),
      g: clamp255(c.g + d.g),
      b: clamp255(c.b + d.b),
    };
    const inverted = invertColormap(noisy, lut);
    const error = inverted === null ? 1 : Math.abs(inverted - t);
    if (error > worst.error) worst = { error, at: t };
  }
  return worst;
}

/** JPEG-like deterministic perturbation: ±8 per channel, varying sign mix. */
const jpegNoise = (i: number): Rgb => {
  const signs = [
    { r: 8, g: 8, b: 8 },
    { r: -8, g: -8, b: -8 },
    { r: 8, g: -8, b: 8 },
    { r: -8, g: 8, b: -8 },
  ];
  return signs[i % signs.length];
};

describe("colormap inversion accuracy (every gradient legend)", () => {
  it.each(GRADIENT_LEGENDS)(
    "%s: clean roundtrip stays within its documented bound",
    (id, spec) => {
      const tolerance = cleanTolerance(id);
      const worst = maxRoundtripError(spec.stops);
      expect(
        worst.error,
        `${id}: worst clean roundtrip error ${worst.error.toFixed(4)} at t=${worst.at.toFixed(3)} exceeds ${tolerance}`
      ).toBeLessThanOrEqual(tolerance);
    }
  );

  it.each(GRADIENT_LEGENDS)(
    "%s: roundtrip under ±8/channel noise stays within its documented bound",
    (id, spec) => {
      const tolerance = NOISY_TOLERANCE[id];
      expect(
        tolerance,
        `${id} has no noisy-tolerance entry — add one (measure with maxRoundtripError, then add headroom)`
      ).toBeDefined();
      const worst = maxRoundtripError(spec.stops, jpegNoise);
      expect(
        worst.error,
        `${id}: worst noisy roundtrip error ${worst.error.toFixed(4)} at t=${worst.at.toFixed(3)} exceeds ${tolerance}`
      ).toBeLessThanOrEqual(tolerance);
    }
  );

  it.each(GRADIENT_LEGENDS)(
    "%s: inversion is monotone over the clean sweep",
    (id, spec) => {
      const lut = buildColormapLut(spec.stops);
      let prev = -Infinity;
      for (let i = 0; i <= SWEEP_STEPS; i++) {
        const t = i / SWEEP_STEPS;
        const inverted = invertColormap(
          lut[Math.round(t * (lut.length - 1))],
          lut
        );
        expect(
          inverted,
          `${id}: clean gradient color at t=${t.toFixed(3)} read as no-data`
        ).not.toBeNull();
        expect(
          inverted as number,
          `${id}: inversion not monotone at t=${t.toFixed(3)} (${(inverted as number).toFixed(4)} < ${prev.toFixed(4)}) — two gradient segments share colors`
        ).toBeGreaterThanOrEqual(prev);
        prev = inverted as number;
      }
    }
  );

  it.each(GRADIENT_LEGENDS)(
    "%s: off-gradient colors read as no-data",
    (id, spec) => {
      const lut = buildColormapLut(spec.stops);
      // Black (the globe background / no-imagery fill) and magenta (far off
      // every earth-tone palette) must never invert to a value.
      const black = { r: 0, g: 0, b: 0 };
      const magenta = { r: 255, g: 0, b: 255 };
      expect(
        invertColormap(black, lut),
        `${id}: black inverted to a value — NO_DATA_DISTANCE (${NO_DATA_DISTANCE}) no longer separates data from background`
      ).toBeNull();
      expect(
        invertColormap(magenta, lut),
        `${id}: magenta inverted to a value`
      ).toBeNull();
    }
  );
});

describe("the suite catches bad legends", () => {
  // A gradient whose two ends share a color: inversion is ambiguous — the
  // exact failure mode a careless legend edit introduces.
  const collided: LegendStop[] = [
    { color: "#336699", at: 0 },
    { color: "#eedd88", at: 0.5 },
    { color: "#336699", at: 1 },
  ];

  it("collided stops blow the clean roundtrip bound", () => {
    const worst = maxRoundtripError(collided);
    expect(worst.error).toBeGreaterThan(CLEAN_TOLERANCE);
  });

  it("collided stops break monotonicity", () => {
    const lut = buildColormapLut(collided);
    let prev = -Infinity;
    let monotone = true;
    for (let i = 0; i <= SWEEP_STEPS; i++) {
      const inverted = invertColormap(
        lut[Math.round((i / SWEEP_STEPS) * (lut.length - 1))],
        lut
      );
      if (inverted === null || inverted < prev) {
        monotone = false;
        break;
      }
      prev = inverted;
    }
    expect(monotone).toBe(false);
  });
});
