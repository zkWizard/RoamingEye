import { describe, expect, it } from "vitest";
import {
  probeSstExtremeCensoring,
  sstExtremeCensoringClause,
} from "./probeSstExtremeCensoring";
import {
  PROBE_SST_TREND_CENSORING_LIMITATIONS,
  probeSstTrendCensoring,
  sstTrendCensored,
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

/**
 * Exactly the text the trend judgement adds to the cap disclosure.
 *
 * The trend rider is no longer a clause of its own — it rides inside
 * `sstExtremeCensoringClause` so both facts share one `source …` attribution.
 * Rendering the clause with the flag off and on and taking the inserted segment
 * isolates the trend's own wording, which is what these disclosure assertions
 * are about: the surrounding sentence legitimately names bounds and prints the
 * cap thresholds, and the rider must still claim no direction and no number.
 */
function trendRider(
  values: number[],
  trend: { testable: boolean },
  layerId = "sst"
): string {
  const censoring = probeSstExtremeCensoring(
    layerId as Parameters<typeof probeSstExtremeCensoring>[0],
    values
  );
  const off = sstExtremeCensoringClause(censoring, false) ?? "";
  const on =
    sstExtremeCensoringClause(
      censoring,
      sstTrendCensored(probeSstTrendCensoring(censoring, trend))
    ) ?? "";
  if (on === off) return "";
  let start = 0;
  while (on[start] === off[start]) start += 1;
  let end = 0;
  while (on[on.length - 1 - end] === off[off.length - 1 - end]) end += 1;
  return on.slice(start, on.length - end);
}

describe("probeSstTrendCensoring", () => {
  it("is inapplicable for every layer but SST", () => {
    for (const layerId of LAYER_ORDER) {
      if (layerId === "sst") continue;
      const censoring = probeSstExtremeCensoring(layerId, [FLOOR, CEILING]);
      const trendCensoring = probeSstTrendCensoring(censoring, TESTABLE);
      expect(trendCensoring.applicable, layerId).toBe(false);
      expect(sstTrendCensored(trendCensoring), layerId).toBe(false);
      expect(trendRider([FLOOR, CEILING], TESTABLE, layerId), layerId).toBe("");
    }
  });

  it("stays silent for an SST record that never reached a cap", () => {
    const values = [17.2, INTERIOR, 21.9];
    const censoring = probeSstExtremeCensoring("sst", values);
    const trendCensoring = probeSstTrendCensoring(censoring, TESTABLE);
    expect(trendCensoring.applicable).toBe(false);
    expect(trendCensoring.censoredMonthCount).toBe(0);
    expect(sstTrendCensored(trendCensoring)).toBe(false);
    expect(trendRider(values, TESTABLE)).toBe("");
  });

  it("stays silent when the record is too short to report a trend", () => {
    // "trend: insufficient record" makes no numeric claim, so there is
    // nothing for the censoring to qualify.
    const values = [FLOOR, INTERIOR];
    const censoring = probeSstExtremeCensoring("sst", values);
    const trendCensoring = probeSstTrendCensoring(censoring, UNTESTABLE);
    expect(censoring.applicable).toBe(true);
    expect(trendCensoring.censoredMonthCount).toBe(1);
    expect(trendCensoring.applicable).toBe(false);
    expect(sstTrendCensored(trendCensoring)).toBe(false);
    expect(trendRider(values, UNTESTABLE)).toBe("");
    // The extremes are still disclosed — only the trend rider is absent.
    expect(sstExtremeCensoringClause(censoring, false)).toContain(
      "upper bound"
    );
  });

  it("qualifies a testable trend fitted through floor-capped months", () => {
    const values = [FLOOR, 4.5, INTERIOR];
    const censoring = probeSstExtremeCensoring("sst", values);
    const trendCensoring = probeSstTrendCensoring(censoring, TESTABLE);
    expect(trendCensoring.applicable).toBe(true);
    expect(trendCensoring.censoredMonthCount).toBe(1);
    expect(trendCensoring.observedMonthCount).toBe(3);
    expect(trendRider(values, TESTABLE)).toContain("p-value");
    // The rider says the trend is not exempt, and says it inside the sentence
    // that already cited the colormap — so the citation is not repeated.
    const clause = sstExtremeCensoringClause(censoring, true) ?? "";
    expect(clause).toContain("trend");
    expect(clause.match(/source /g)).toHaveLength(1);
    expect(clause.indexOf("trend")).toBeLessThan(clause.indexOf("source "));
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
      expect(trendRider(values, TESTABLE)).not.toMatch(
        /≤|≥|upper bound|lower bound|attenuat/
      );
    }
  });

  it("makes no biological, forecast or magnitude claim", () => {
    const values = [FLOOR, 4.5, INTERIOR];
    const trendCensoring = probeSstTrendCensoring(
      probeSstExtremeCensoring("sst", values),
      TESTABLE
    );
    expect(trendCensoring.marineBiologyObservation).toBe(false);
    expect(trendCensoring.isForecast).toBe(false);
    const rider = trendRider(values, TESTABLE);
    expect(rider).not.toMatch(
      /species|habitat|ecosystem|coral|bleach|heatwave|forecast|will |expect/i
    );
    // No recovered value or corrected slope is offered anywhere.
    expect(rider).not.toMatch(/\d/);
  });

  it("stays part of a single status-line clause with no CSV-hostile characters", () => {
    const rider = trendRider([FLOOR, 4.5, INTERIOR], TESTABLE);
    expect(rider).not.toMatch(/[\n\r]/);
    expect(rider).not.toContain(" · ");
    expect(rider.length).toBeLessThan(220);
    // It is a rider, not a second clause: merging it must not have introduced a
    // separator that would split it back onto its own line.
    const clause =
      sstExtremeCensoringClause(
        probeSstExtremeCensoring("sst", [FLOOR, 4.5, INTERIOR]),
        true
      ) ?? "";
    expect(clause).not.toContain(" · ");
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
