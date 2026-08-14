import { describe, it, expect } from "vitest";
import {
  MEASURED_VEGETATION_RAMP,
  VEGETATION_INDEX_COLORMAP_DOCS,
  VEGETATION_RAMP_LIMITS,
  calibratedVegetationIndex,
  describeVegetationRampFidelity,
  exceedsLinearityCeiling,
  linearityCeilingMultiple,
  vegetationIndexId,
  vegetationRampFidelity,
  vegetationRampTickCaveat,
} from "./vegetationIndexRamp";
import { COLORMAP_DOCS, MAX_LINEARITY_DEVIATION } from "./colormap";
import { PROBE_SCALES, buildColormapLut, invertColormap } from "./probe";
import { LEGENDS, type GradientLegendSpec } from "./legend";
import { snapshotColormapEntries } from "./gibsColormapSnapshot";
import { MEASURED_INVERSION } from "./validation";

describe("vegetation-index ramp fidelity", () => {
  it("characterizes only the two MOD13A3 vegetation indices", () => {
    expect(vegetationIndexId("ndvi")).toBe("ndvi");
    expect(vegetationIndexId("evi")).toBe("evi");
    for (const other of [
      "lst",
      "airtemp",
      "precip",
      "soil",
      "landcover",
    ] as const) {
      expect(vegetationIndexId(other)).toBeNull();
      expect(vegetationRampFidelity(other)).toBeNull();
      expect(vegetationRampTickCaveat(other)).toBeNull();
      expect(describeVegetationRampFidelity(other)).toBeNull();
      expect(linearityCeilingMultiple(other)).toBeNull();
      expect(exceedsLinearityCeiling(other)).toBe(false);
    }
  });

  it("keeps EVI out of the calibrated colormap set", () => {
    // NDVI joined COLORMAP_DOCS in #776: its legend stops are placed at the
    // ramp's own value fractions, so the 0.28→0.30 hue jump is encoded in stop
    // position rather than assumed away, and the offline snapshot re-measure
    // (0.024 RMSE, 140/140) guards that on every change. EVI cannot follow:
    // its GIBS ramp contains pure black — indistinguishable from an undrawn
    // JPEG pixel — so no stop placement can calibrate it.
    expect(Object.prototype.hasOwnProperty.call(COLORMAP_DOCS, "ndvi")).toBe(
      true
    );
    for (const index of ["evi"] as const) {
      expect(
        Object.prototype.hasOwnProperty.call(COLORMAP_DOCS, index),
        `${index} ramp deviates ${MEASURED_VEGETATION_RAMP[index].linearityDeviation} from linear; it cannot be a calibrated colormap-inverted layer`
      ).toBe(false);
      expect(exceedsLinearityCeiling(index)).toBe(true);
      expect(
        MEASURED_VEGETATION_RAMP[index].linearityDeviation
      ).toBeGreaterThan(MAX_LINEARITY_DEVIATION);
    }
  });

  it("reports how far past the linearity ceiling each ramp sits", () => {
    // 0.129 / 0.02 = 6.45 → 6.5; 0.213 / 0.02 = 10.65 → 10.7.
    expect(linearityCeilingMultiple("ndvi")).toBeCloseTo(6.5, 5);
    expect(linearityCeilingMultiple("evi")).toBeCloseTo(10.7, 5);
    // EVI's ramp is the more distorted of the pair — the ordering is the
    // scientifically meaningful part, not the exact figure.
    expect(MEASURED_VEGETATION_RAMP.evi.linearityDeviation).toBeGreaterThan(
      MEASURED_VEGETATION_RAMP.ndvi.linearityDeviation
    );
  });

  it("keeps each pinned bias, RMSE and p95 mutually consistent", () => {
    // Only EVI's bias is large enough to be a direction a reader should act on;
    // NDVI's sits below one colormap step. The shared invariant is the ordering
    // of the three figures, not a claim that either reads green.
    expect(MEASURED_VEGETATION_RAMP.evi.bias).toBeGreaterThan(1 / 255);
    for (const index of ["ndvi", "evi"] as const) {
      const fidelity = MEASURED_VEGETATION_RAMP[index];
      expect(fidelity.bias).toBeGreaterThan(0);
      // A mean error cannot exceed the RMSE it is drawn from, and neither can
      // exceed the p95 of |error|; catches a transcription slip in the pins.
      expect(fidelity.bias).toBeLessThanOrEqual(fidelity.rmse);
      expect(fidelity.rmse).toBeLessThanOrEqual(fidelity.p95);
      expect(fidelity.recoveredSteps).toBeGreaterThan(0);
      expect(fidelity.recoveredSteps).toBeLessThanOrEqual(fidelity.totalSteps);
    }
  });

  it("dwarfs the quantization band the probe prints beside its values", () => {
    // The probe's "±..." is half a colormap step. For the UNCALIBRATED index
    // the end-to-end error is orders of magnitude larger, which is the reason
    // this module exists. NDVI is no longer in that position: its stops sit at
    // the ramp's value fractions, so its error is within a few steps and the
    // "dwarfs" framing must not be quoted for it.
    const step = 1 / 255;
    expect(MEASURED_VEGETATION_RAMP.evi.rmse).toBeGreaterThan(step * 10);
    expect(MEASURED_VEGETATION_RAMP.ndvi.rmse).toBeLessThan(step * 10);
  });

  it("never restates a calibrated layer's inversion error differently", () => {
    // The defect this guards: MEASURED_VEGETATION_RAMP kept NDVI's retired
    // hand-drawn-gradient figures (RMSE 0.23, 108 of 140 recovered) after the
    // legend was rebuilt from MODIS_L3_NDVI, and the legend's mid-tick tooltip
    // was generated from them. Two committed RMSEs for one layer is the bug;
    // MEASURED_INVERSION is the authority for anything in COLORMAP_DOCS.
    for (const index of ["ndvi", "evi"] as const) {
      const calibrated = calibratedVegetationIndex(index);
      if (calibrated === null) continue;
      const authoritative = MEASURED_INVERSION[calibrated];
      const local = MEASURED_VEGETATION_RAMP[index];
      expect(authoritative.rmse).not.toBeNull();
      expect(local.rmse).toBeCloseTo(authoritative.rmse as number, 3);
      expect(local.totalSteps).toBe(authoritative.total);
      expect(local.recoveredSteps).toBe(
        authoritative.total - authoritative.nulls
      );
    }
  });

  it("re-measures NDVI from the pinned snapshot through the production path", () => {
    // The offline guard the pins claim. Runs the same legend LUT + linear
    // position→value step validateInversion runs, against the committed GIBS
    // ramp, so a legend edit that moves the error fails here rather than on the
    // legend tooltip.
    const spec = LEGENDS.ndvi as GradientLegendSpec;
    const lut = buildColormapLut(spec.stops);
    const scale = PROBE_SCALES.ndvi;
    const span = scale.max - scale.min;
    const errors: number[] = [];
    let nulls = 0;
    for (const entry of snapshotColormapEntries("ndvi")) {
      const pos = invertColormap(entry.rgb, lut);
      if (pos === null) {
        nulls++;
        continue;
      }
      errors.push(scale.min + pos * span - entry.value);
    }
    const n = errors.length;
    const rmse = Math.sqrt(errors.reduce((s, e) => s + e * e, 0) / n);
    const bias = errors.reduce((s, e) => s + e, 0) / n;
    expect(nulls, "every published NDVI ramp colour inverts").toBe(0);
    expect(n).toBe(MEASURED_VEGETATION_RAMP.ndvi.recoveredSteps);
    expect(rmse).toBeCloseTo(MEASURED_VEGETATION_RAMP.ndvi.rmse, 3);
    expect(bias).toBeCloseTo(MEASURED_VEGETATION_RAMP.ndvi.bias, 3);
  });

  it("does not deny a calibrated index its calibration on the legend", () => {
    // NDVI is in COLORMAP_DOCS, so its mid tick IS a colormap-inverted value.
    // The tooltip must not say otherwise, and must quote the same figure the
    // probe panel and CSV quote rather than a second, larger one.
    const caveat = vegetationRampTickCaveat("ndvi") as string;
    expect(caveat).not.toContain("not a colormap-inverted value");
    expect(caveat).not.toContain("% of span");
    expect(caveat).toContain("140 of its 140 published ramp colours");
    expect(caveat).toContain(
      `RMSE of ${(MEASURED_INVERSION.ndvi.rmse as number).toFixed(2)}`
    );
    // EVI genuinely is a gradient position — its ramp ends in black, so no stop
    // placement can calibrate it. It keeps the original sentence.
    const evi = vegetationRampTickCaveat("evi") as string;
    expect(evi).toContain("not a colormap-inverted value");
    expect(Object.prototype.hasOwnProperty.call(COLORMAP_DOCS, "evi")).toBe(
      false
    );
  });

  it("names an authoritative GIBS colormap document for each index", () => {
    expect(VEGETATION_INDEX_COLORMAP_DOCS.ndvi).toBe("MODIS_L3_NDVI");
    expect(VEGETATION_INDEX_COLORMAP_DOCS.evi).toBe("MODIS_L3_EVI");
  });

  it("qualifies the mid tick while leaving the exact end labels alone", () => {
    const caveat = vegetationRampTickCaveat("ndvi");
    expect(caveat).toContain("Mid-scale NDVI");
    expect(caveat).toContain("MODIS_L3_NDVI");
    expect(caveat).toContain("The end labels are exact.");
    expect(vegetationRampTickCaveat("evi")).toContain("21% of span");
    // Both ramps span 0-1, which is what makes the end labels exact.
    for (const index of ["ndvi", "evi"] as const) {
      expect(PROBE_SCALES[index].min).toBe(0);
      expect(PROBE_SCALES[index].max).toBe(1);
    }
  });

  it("states the error, its direction, and the recovery rate in one line", () => {
    const ndvi = describeVegetationRampFidelity("ndvi");
    expect(ndvi).toContain("RMSE of 0.02");
    expect(ndvi).toContain("mean error of +0.002");
    // NDVI's residual is below one colormap step, so no direction is claimed:
    // calling a calibrated layer's scatter a green lean is the overstatement
    // this module was carrying on the legend.
    expect(ndvi).toContain("no direction is claimed");
    expect(ndvi).not.toContain("read greener than the ramp");
    expect(ndvi).toContain("140 of 140 ramp colours");
    // Never a fitness, condition, or biomass claim.
    expect(ndvi).toContain(
      "implies nothing about cover, biomass, or condition"
    );
    expect(describeVegetationRampFidelity("evi")).toContain(
      "mean error of +0.22"
    );
  });

  it("carries its method limits", () => {
    expect(VEGETATION_RAMP_LIMITS.length).toBeGreaterThan(0);
    expect(VEGETATION_RAMP_LIMITS.join(" ")).toContain("in-situ");
    expect(VEGETATION_RAMP_LIMITS.join(" ")).toContain("No bias correction");
  });
});
