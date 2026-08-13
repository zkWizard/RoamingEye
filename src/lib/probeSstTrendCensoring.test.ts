import { describe, expect, it } from "vitest";
import { probeSstExtremeCensoring } from "./probeSstExtremeCensoring";
import {
  PROBE_SST_TREND_CENSORING_LIMITATIONS,
  probeSstTrendCensoring,
  sstTrendCensoringClause,
} from "./probeSstTrendCensoring";
import { LAYER_ORDER } from "./timeline";

/** An interior SST that no cap can claim. */
const INTERIOR = 18.4;
/** What the inversion returns for the ramp's open low cap. */
const FLOOR = 0.075;
/** What the inversion returns for the ramp's open high cap. */
const CEILING = 31.9;

/** A record long enough for the seasonal test to return a verdict. */
const TESTABLE = { testable: true };
const UNTESTABLE = { testable: false };

describe("probeSstTrendCensoring", () => {
  it("is inapplicable for every layer but SST", () => {
    for (const layerId of LAYER_ORDER) {
      if (layerId === "sst") continue;
      const censoring = probeSstExtremeCensoring(layerId, [FLOOR, CEILING]);
      const trendCensoring = probeSstTrendCensoring(censoring, TESTABLE);
      expect(trendCensoring.applicable, layerId).toBe(false);
      expect(sstTrendCensoringClause(trendCensoring), layerId).toBeNull();
    }
  });

  it("stays silent for an SST record that never reached a cap", () => {
    const censoring = probeSstExtremeCensoring("sst", [17.2, INTERIOR, 21.9]);
    const trendCensoring = probeSstTrendCensoring(censoring, TESTABLE);
    expect(trendCensoring.applicable).toBe(false);
    expect(trendCensoring.censoredMonthCount).toBe(0);
    expect(sstTrendCensoringClause(trendCensoring)).toBeNull();
  });

  it("stays silent when the record is too short to report a trend", () => {
    // "trend: insufficient record" makes no numeric claim, so there is
    // nothing for the censoring to qualify.
    const censoring = probeSstExtremeCensoring("sst", [FLOOR, INTERIOR]);
    const trendCensoring = probeSstTrendCensoring(censoring, UNTESTABLE);
    expect(censoring.applicable).toBe(true);
    expect(trendCensoring.censoredMonthCount).toBe(1);
    expect(trendCensoring.applicable).toBe(false);
    expect(sstTrendCensoringClause(trendCensoring)).toBeNull();
  });

  it("qualifies a testable trend fitted through floor-capped months", () => {
    const censoring = probeSstExtremeCensoring("sst", [FLOOR, 4.5, INTERIOR]);
    const trendCensoring = probeSstTrendCensoring(censoring, TESTABLE);
    expect(trendCensoring.applicable).toBe(true);
    expect(trendCensoring.censoredMonthCount).toBe(1);
    expect(trendCensoring.observedMonthCount).toBe(3);
    expect(sstTrendCensoringClause(trendCensoring)).toContain("p-value");
  });

  it("qualifies a testable trend fitted through ceiling-capped months", () => {
    const censoring = probeSstExtremeCensoring("sst", [
      INTERIOR,
      CEILING,
      CEILING,
    ]);
    const trendCensoring = probeSstTrendCensoring(censoring, TESTABLE);
    expect(trendCensoring.applicable).toBe(true);
    expect(trendCensoring.censoredMonthCount).toBe(2);
    expect(trendCensoring.observedMonthCount).toBe(3);
  });

  it("counts months at both caps toward the same qualification", () => {
    const censoring = probeSstExtremeCensoring("sst", [
      FLOOR,
      INTERIOR,
      CEILING,
    ]);
    const trendCensoring = probeSstTrendCensoring(censoring, TESTABLE);
    expect(trendCensoring.censoredMonthCount).toBe(2);
    expect(trendCensoring.applicable).toBe(true);
  });

  it("never claims a bias direction, at either cap or both", () => {
    // The direction a capped month pushes a seasonal median depends on where
    // in the record it falls, which the cap destroyed. A future change that
    // prints an inequality in front of the slope must recover that first.
    for (const values of [
      [FLOOR, 4.5, INTERIOR],
      [INTERIOR, CEILING, CEILING],
      [FLOOR, INTERIOR, CEILING],
    ]) {
      const trendCensoring = probeSstTrendCensoring(
        probeSstExtremeCensoring("sst", values),
        TESTABLE
      );
      expect(trendCensoring.directionClaimable).toBe(false);
      const clause = sstTrendCensoringClause(trendCensoring) ?? "";
      expect(clause).not.toMatch(/≤|≥|upper bound|lower bound|attenuat/);
    }
  });

  it("makes no biological, forecast or magnitude claim", () => {
    const trendCensoring = probeSstTrendCensoring(
      probeSstExtremeCensoring("sst", [FLOOR, 4.5, INTERIOR]),
      TESTABLE
    );
    expect(trendCensoring.marineBiologyObservation).toBe(false);
    expect(trendCensoring.isForecast).toBe(false);
    const clause = sstTrendCensoringClause(trendCensoring) ?? "";
    expect(clause).not.toMatch(
      /species|habitat|ecosystem|coral|bleach|heatwave|forecast|will |expect/i
    );
    // No recovered value or corrected slope is offered anywhere.
    expect(clause).not.toMatch(/\d/);
  });

  it("stays a single status-line clause with no CSV-hostile characters", () => {
    const clause =
      sstTrendCensoringClause(
        probeSstTrendCensoring(
          probeSstExtremeCensoring("sst", [FLOOR, 4.5, INTERIOR]),
          TESTABLE
        )
      ) ?? "";
    expect(clause).not.toMatch(/[\n\r]/);
    expect(clause).not.toContain(" · ");
    expect(clause.length).toBeLessThan(220);
  });

  it("documents its limitations without promising a correction", () => {
    expect(PROBE_SST_TREND_CENSORING_LIMITATIONS.length).toBeGreaterThan(2);
    for (const limitation of PROBE_SST_TREND_CENSORING_LIMITATIONS) {
      expect(limitation.length).toBeGreaterThan(20);
    }
    expect(PROBE_SST_TREND_CENSORING_LIMITATIONS.join(" ")).toMatch(
      /no bias direction is claimed/i
    );
  });
});
