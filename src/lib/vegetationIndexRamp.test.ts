import { describe, it, expect } from "vitest";
import {
  MEASURED_VEGETATION_RAMP,
  VEGETATION_INDEX_COLORMAP_DOCS,
  VEGETATION_RAMP_LIMITS,
  describeVegetationRampFidelity,
  exceedsLinearityCeiling,
  linearityCeilingMultiple,
  vegetationIndexId,
  vegetationRampFidelity,
  vegetationRampTickCaveat,
} from "./vegetationIndexRamp";
import { COLORMAP_DOCS, MAX_LINEARITY_DEVIATION } from "./colormap";
import { PROBE_SCALES } from "./probe";

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

  it("keeps the vegetation indices out of the calibrated colormap set", () => {
    // The load-bearing invariant: membership in COLORMAP_DOCS asserts a linear
    // position-to-value ramp, and these two measurably violate it. If a future
    // edit adds them there, the probe-scale contract's linearity assertion
    // would start failing against live GIBS — fail here first, with the reason.
    for (const index of ["ndvi", "evi"] as const) {
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

  it("records a positive bias: reported values read greener than the ramp", () => {
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
    // The probe's "±..." is half a colormap step. The end-to-end error is
    // orders of magnitude larger, which is the reason this module exists.
    const step = 1 / 255;
    for (const index of ["ndvi", "evi"] as const) {
      expect(MEASURED_VEGETATION_RAMP[index].rmse).toBeGreaterThan(step * 10);
    }
  });

  it("names an authoritative GIBS colormap document for each index", () => {
    expect(VEGETATION_INDEX_COLORMAP_DOCS.ndvi).toBe("MODIS_L3_NDVI");
    expect(VEGETATION_INDEX_COLORMAP_DOCS.evi).toBe("MODIS_L3_EVI");
  });

  it("qualifies the mid tick while leaving the exact end labels alone", () => {
    const caveat = vegetationRampTickCaveat("ndvi");
    expect(caveat).toContain("Mid-scale NDVI");
    expect(caveat).toContain("MODIS_L3_NDVI");
    expect(caveat).toContain("13% of span");
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
    expect(ndvi).toContain("RMSE of 0.23");
    expect(ndvi).toContain("mean error of +0.13");
    expect(ndvi).toContain("read greener than the ramp");
    expect(ndvi).toContain("108 of 140 ramp colours");
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
