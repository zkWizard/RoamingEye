import { describe, expect, it } from "vitest";
import {
  SST_COLD_END_ACCURACY,
  SST_COLD_END_ACCURACY_LIMITATIONS,
  SST_COLD_END_SCALE_ANCHOR,
  probeSstColdEndAccuracy,
  sstColdEndAccuracyClause,
  sstColdEndAccuracyCsvHeaders,
} from "./sstColdEndAccuracy";
import { MEASURED_INVERSION } from "./validation";
import { csvHeaderText, PROBE_SCALES } from "./probe";
import {
  inversionAccuracyCsvHeaders,
  probeInversionAccuracy,
} from "./probeInversionAccuracy";
import { probeSstExtremeCensoring } from "./probeSstExtremeCensoring";
import { SST_PUBLISHED_RAMP } from "./sstRampCensoring";

/** Ordinary subtropical water, far above the cold-end split. */
const INTERIOR = 18.4;
/** Sub-polar water inside the band the whole-ramp figure does not describe. */
const COLD = 1.2;
/** A month the published ramp collapsed into its open low cap. */
const FLOOR = SST_PUBLISHED_RAMP.floorBin.lo + 0.075;
/** A month in its open high cap, which no cold-band screen can reach. */
const CEILING = SST_PUBLISHED_RAMP.ceilingBin.lo + 0.1;

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

describe("sstColdEndAccuracyCsvHeaders", () => {
  it("writes nothing for a record the pooled figure already covers", () => {
    // Above the threshold the pooled band overstates the residual, so a
    // conservative figure needs no warning and an ordinary subtropical export
    // stays byte-identical to what it was before this qualifier existed.
    expect(
      sstColdEndAccuracyCsvHeaders(
        probeSstColdEndAccuracy("sst", [INTERIOR, 22.5])
      )
    ).toEqual([]);
    expect(
      sstColdEndAccuracyCsvHeaders(probeSstColdEndAccuracy("sst", [null]))
    ).toEqual([]);
    for (const layerId of ["ndvi", "lst", "airtemp", "precip"] as const) {
      expect(
        sstColdEndAccuracyCsvHeaders(
          probeSstColdEndAccuracy(layerId, [COLD, INTERIOR])
        )
      ).toEqual([]);
    }
  });

  it("qualifies the pooled figure once the record enters the band", () => {
    const headers = sstColdEndAccuracyCsvHeaders(
      probeSstColdEndAccuracy("sst", [COLD, INTERIOR, null])
    );
    expect(headers.length).toBe(4);
    const joined = headers.join("\n");
    // The band figure, the threshold it applies below, and the pooled figure
    // it corrects all have to be present — a qualifier that names only one of
    // the two numbers leaves the reader unable to tell which row takes which.
    expect(joined).toContain(
      `±${SST_COLD_END_ACCURACY.coldBandRmseC.toFixed(1)}`
    );
    expect(joined).toContain(
      `±${(MEASURED_INVERSION.sst.rmse as number).toFixed(1)}`
    );
    expect(joined).toContain(`below ${SST_COLD_END_ACCURACY.thresholdC} °C`);
    expect(joined).toContain(SST_COLD_END_ACCURACY.source);
    // The cause is stated so the wider residual is not read as a retrieval
    // fault in the L3 product.
    expect(joined).toContain("not a retrieval error");
    // And the screen's own imprecision is disclosed, so the count is never
    // read as exhaustive.
    expect(joined).toContain("lower bound");
  });

  it("counts the cold-band rows and names the coldest", () => {
    const headers = sstColdEndAccuracyCsvHeaders(
      probeSstColdEndAccuracy("sst", [COLD, 3.5, INTERIOR, null])
    );
    const rows = headers.find((h) =>
      h.startsWith("# inversion_validation_cold_end_rows:")
    );
    expect(rows).toBeDefined();
    expect(rows).toContain("2 sampled months");
    expect(rows).toContain(`coldest ${COLD.toFixed(1)} °C`);

    const single = sstColdEndAccuracyCsvHeaders(
      probeSstColdEndAccuracy("sst", [COLD, INTERIOR])
    ).find((h) => h.startsWith("# inversion_validation_cold_end_rows:"));
    // Singular, so the line does not report "1 sampled months".
    expect(single).toContain("1 sampled month ");
  });

  it("honours the CSV header contract on every line", () => {
    const headers = sstColdEndAccuracyCsvHeaders(
      probeSstColdEndAccuracy("sst", [COLD, INTERIOR])
    );
    for (const header of headers) {
      expect(header.startsWith("# ")).toBe(true);
      // A `#` line must never carry a delimiter, a quote, or a line break, or
      // it splits the file it is meant to document.
      expect(header).not.toContain(",");
      expect(header).not.toContain('"');
      expect(header).not.toMatch(/[\r\n]/);
      expect(csvHeaderText(header)).toBe(header);
    }
  });

  it("sits beside the pooled accuracy lines it corrects", () => {
    // The two builders are concatenated at the export call sites, so their
    // keys have to share a prefix for the qualifier to read as a continuation
    // of the figure above it rather than an unrelated block.
    const pooled = inversionAccuracyCsvHeaders(probeInversionAccuracy("sst"));
    expect(pooled.length).toBeGreaterThan(0);
    expect(pooled[0].startsWith("# inversion_validation:")).toBe(true);
    for (const header of sstColdEndAccuracyCsvHeaders(
      probeSstColdEndAccuracy("sst", [COLD])
    )) {
      expect(header.startsWith("# inversion_validation_cold_end")).toBe(true);
    }
  });
});

describe("cold-band months the ramp capped rather than resolved", () => {
  const censoring = (values: readonly (number | null)[]) =>
    probeSstExtremeCensoring("sst", values);

  it("co-fires with the ramp screen on every capped record", () => {
    // Not an overlap to be handled defensively but the normal case: the low cap
    // collapses water below 0.00 °C, which decodes far under the 4 °C split, so
    // a record that reaches the cap is always inside this band too.
    const values = [FLOOR, INTERIOR];
    expect(probeSstExtremeCensoring("sst", values).floorMonthCount).toBe(1);
    const reading = probeSstColdEndAccuracy("sst", values, censoring(values));
    expect(reading.applies).toBe(true);
    expect(reading.cappedMonths).toBe(1);
  });

  it("counts no capped month when the caller supplies no screen", () => {
    // The optional argument leaves the question unmeasured rather than answered
    // in the negative, and every caller that had not supplied it reads exactly
    // as it did before.
    const reading = probeSstColdEndAccuracy("sst", [FLOOR, INTERIOR]);
    expect(reading.applies).toBe(true);
    expect(reading.cappedMonths).toBe(0);
    expect(sstColdEndAccuracyClause(reading)).not.toContain("capped");
  });

  it("ignores the ceiling cap, which cannot reach this band", () => {
    const values = [CEILING, COLD];
    const screen = censoring(values);
    expect(screen.ceilingMonthCount).toBe(1);
    expect(screen.floorMonthCount).toBe(0);
    expect(probeSstColdEndAccuracy("sst", values, screen).cappedMonths).toBe(0);
  });

  it("ignores a screen that judged another layer or nothing at all", () => {
    for (const screen of [
      probeSstExtremeCensoring("ndvi", [FLOOR]),
      probeSstExtremeCensoring("sst", [null]),
    ]) {
      expect(screen.applicable).toBe(false);
      expect(
        probeSstColdEndAccuracy("sst", [FLOOR, INTERIOR], screen).cappedMonths
      ).toBe(0);
    }
  });

  it("withholds the ± band from the capped months on the status line", () => {
    const values = [FLOOR, COLD, INTERIOR];
    const clause = sstColdEndAccuracyClause(
      probeSstColdEndAccuracy("sst", values, censoring(values))
    );
    // The band figure it corrects still has to be there — the point is that the
    // ± no longer stands unqualified over a row whose error is unbounded.
    expect(clause).toContain(
      `±${SST_COLD_END_ACCURACY.coldBandRmseC.toFixed(1)} °C`
    );
    expect(clause).toContain("neither band describes the 1 capped month");
    // Singular and plural, so the clause never says "1 capped months".
    const two = [FLOOR, 0.05, INTERIOR];
    expect(
      sstColdEndAccuracyClause(
        probeSstColdEndAccuracy("sst", two, censoring(two))
      )
    ).toContain("2 capped months");
  });

  it("marks the coldest value as a bound in the exported file", () => {
    const values = [FLOOR, COLD, INTERIOR];
    const headers = sstColdEndAccuracyCsvHeaders(
      probeSstColdEndAccuracy("sst", values, censoring(values))
    );
    const rows = headers.find((h) =>
      h.startsWith("# inversion_validation_cold_end_rows:")
    );
    // The coldest month IS the series minimum, which the ramp screen elsewhere
    // in the same file declares an upper bound. Printed bare it reads as a
    // measurement — the defect the status line's inequality already prevents.
    expect(rows).toContain(`coldest ≤ ${FLOOR.toFixed(1)} °C`);
    expect(rows).not.toContain(`coldest ${FLOOR.toFixed(1)} °C`);
  });

  it("adds one export line naming the rows neither band covers", () => {
    const values = [FLOOR, COLD, INTERIOR];
    const headers = sstColdEndAccuracyCsvHeaders(
      probeSstColdEndAccuracy("sst", values, censoring(values))
    );
    expect(headers.length).toBe(5);
    const capped = headers.find((h) =>
      h.startsWith("# inversion_validation_cold_end_capped:")
    );
    expect(capped).toBeDefined();
    expect(capped).toContain("1 of those months");
    expect(capped).toContain("unbounded");
    // It points at the block that states the direction rather than restating it,
    // so the two screens cannot drift into disagreeing.
    expect(capped).toContain("sst_ramp_censoring");
    // And it sits between the row count it qualifies and the screen caveat.
    expect(headers.indexOf(capped as string)).toBe(3);
    for (const header of headers) {
      expect(header.startsWith("# inversion_validation_cold_end")).toBe(true);
      expect(header).not.toContain(",");
      expect(header).not.toContain('"');
      expect(csvHeaderText(header)).toBe(header);
    }
  });

  it("stays silent in the export when nothing was capped", () => {
    const values = [COLD, INTERIOR];
    const headers = sstColdEndAccuracyCsvHeaders(
      probeSstColdEndAccuracy("sst", values, censoring(values))
    );
    // A sub-polar record that never reached the cap is byte-identical to the
    // file it produced before this qualifier existed.
    expect(headers).toEqual(
      sstColdEndAccuracyCsvHeaders(probeSstColdEndAccuracy("sst", values))
    );
  });

  it("names the limit in the module's own disclosure list", () => {
    expect(SST_COLD_END_ACCURACY_LIMITATIONS.join(" ")).toContain(
      "open low cap"
    );
  });
});
