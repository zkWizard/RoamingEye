import { describe, expect, it } from "vitest";
import {
  SST_COLD_END_ACCURACY,
  SST_COLD_END_ACCURACY_LIMITATIONS,
  SST_COLD_END_SCALE_ANCHOR,
  probeSstColdEndAccuracy,
  sstColdEndAccuracyClause,
} from "./sstColdEndAccuracy";
import { MEASURED_INVERSION } from "./validation";
import { PROBE_SCALES } from "./probe";

/** Ordinary subtropical water, far above the cold-end split. */
const INTERIOR = 18.4;
/** Sub-polar water inside the band the whole-ramp figure does not describe. */
const COLD = 1.2;

describe("probeSstColdEndAccuracy", () => {
  it("is inapplicable for every layer but SST", () => {
    for (const layerId of ["ndvi", "lst", "airtemp", "precip"] as const) {
      const reading = probeSstColdEndAccuracy(layerId, [COLD, INTERIOR]);
      expect(reading.applies).toBe(false);
      expect(reading.coldBandRmseC).toBeNull();
      expect(reading.coldestValueC).toBeNull();
    }
    expect(probeSstColdEndAccuracy(undefined, [COLD]).applies).toBe(false);
  });

  it("is inapplicable when no month returned a usable value", () => {
    expect(probeSstColdEndAccuracy("sst", []).applies).toBe(false);
    expect(probeSstColdEndAccuracy("sst", [null, null]).applies).toBe(false);
    expect(probeSstColdEndAccuracy("sst", [NaN]).applies).toBe(false);
  });

  it("stays silent for a record that never enters the cold band", () => {
    const reading = probeSstColdEndAccuracy("sst", [INTERIOR, 22.5, null]);
    expect(reading.applies).toBe(false);
    expect(reading.coldBandMonths).toBe(0);
    // The coldest value is still reported, so a caller can see how near the
    // record came to the split without the clause claiming it crossed.
    expect(reading.coldestValueC).toBe(INTERIOR);
  });

  it("applies once any reported month sits in the cold band", () => {
    const reading = probeSstColdEndAccuracy("sst", [INTERIOR, COLD, null, 3.9]);
    expect(reading.applies).toBe(true);
    expect(reading.coldBandMonths).toBe(2);
    expect(reading.coldestValueC).toBe(COLD);
    expect(reading.coldBandRmseC).toBe(SST_COLD_END_ACCURACY.coldBandRmseC);
    expect(reading.wholeRampRmseC).toBe(MEASURED_INVERSION.sst.rmse);
  });

  it("treats the threshold itself as inside the band", () => {
    const at = probeSstColdEndAccuracy("sst", [
      SST_COLD_END_ACCURACY.thresholdC,
    ]);
    expect(at.applies).toBe(true);
    expect(at.coldBandMonths).toBe(1);
  });
});

describe("sstColdEndAccuracyClause", () => {
  it("is empty whenever the reading does not apply", () => {
    expect(sstColdEndAccuracyClause(probeSstColdEndAccuracy("sst", []))).toBe(
      ""
    );
    expect(
      sstColdEndAccuracyClause(probeSstColdEndAccuracy("sst", [INTERIOR]))
    ).toBe("");
    expect(
      sstColdEndAccuracyClause(probeSstColdEndAccuracy("lst", [COLD]))
    ).toBe("");
  });

  it("names the band residual against the whole-ramp figure it qualifies", () => {
    const clause = sstColdEndAccuracyClause(
      probeSstColdEndAccuracy("sst", [COLD])
    );
    expect(clause).toBe("±2.8 °C below 4 °C, not the whole-ramp ±1.0 °C");
  });

  it("quotes the whole-ramp figure from the committed measurement", () => {
    const clause = sstColdEndAccuracyClause(
      probeSstColdEndAccuracy("sst", [COLD])
    );
    expect(clause).toContain(
      `±${(MEASURED_INVERSION.sst.rmse as number).toFixed(1)} °C`
    );
  });
});

describe("cold-end drift guards", () => {
  it("splits the ramp inside the range the probe scales SST with", () => {
    expect(SST_COLD_END_SCALE_ANCHOR.min).toBe(PROBE_SCALES.sst.min);
    expect(SST_COLD_END_SCALE_ANCHOR.max).toBe(PROBE_SCALES.sst.max);
    expect(SST_COLD_END_ACCURACY.unit).toBe(PROBE_SCALES.sst.unit);
    expect(SST_COLD_END_ACCURACY.thresholdC).toBeGreaterThan(
      PROBE_SCALES.sst.min
    );
    expect(SST_COLD_END_ACCURACY.thresholdC).toBeLessThan(PROBE_SCALES.sst.max);
    // The legend's cold stop sits inside the band it degrades, which is the
    // whole reason the band exists.
    expect(SST_COLD_END_ACCURACY.legendColdAnchorC).toBeLessThan(
      SST_COLD_END_ACCURACY.thresholdC
    );
  });

  it("keeps the cold band worse than the whole-ramp figure it qualifies", () => {
    // If a recalibration ever lifted the whole-ramp RMSE to the cold-band
    // figure, this split would no longer describe anything and the clause would
    // be noise rather than a caveat.
    expect(MEASURED_INVERSION.sst.rmse).not.toBeNull();
    expect(SST_COLD_END_ACCURACY.coldBandRmseC).toBeGreaterThan(
      MEASURED_INVERSION.sst.rmse as number
    );
    expect(SST_COLD_END_ACCURACY.restOfRampRmseC.max).toBeLessThan(
      MEASURED_INVERSION.sst.rmse as number
    );
  });

  it("reconciles the two committed residuals with the whole-ramp figure", () => {
    // The band below the threshold is that share of the 0–32 °C ramp; pooling
    // its residual with the rest has to reproduce the committed whole-ramp
    // RMSE, or one of the three figures has gone stale.
    const span = PROBE_SCALES.sst.max - PROBE_SCALES.sst.min;
    const coldShare =
      (SST_COLD_END_ACCURACY.thresholdC - PROBE_SCALES.sst.min) / span;
    const rest =
      (SST_COLD_END_ACCURACY.restOfRampRmseC.min +
        SST_COLD_END_ACCURACY.restOfRampRmseC.max) /
      2;
    const pooled = Math.sqrt(
      coldShare * SST_COLD_END_ACCURACY.coldBandRmseC ** 2 +
        (1 - coldShare) * rest ** 2
    );
    expect(pooled).toBeCloseTo(MEASURED_INVERSION.sst.rmse as number, 1);
  });

  it("states its limits without inferring anything biological", () => {
    expect(SST_COLD_END_ACCURACY_LIMITATIONS.length).toBeGreaterThan(0);
    for (const limitation of SST_COLD_END_ACCURACY_LIMITATIONS) {
      expect(limitation.trim()).toBe(limitation);
      expect(limitation.endsWith(".")).toBe(true);
    }
    expect(SST_COLD_END_ACCURACY_LIMITATIONS.join(" ")).toContain(
      "rendering-inversion error only"
    );
  });
});
