import { describe, expect, it } from "vitest";
import { NDVI_SOURCE, NDVI_UNIT } from "./phenology";
import { summarizeNdviMonthlyChange } from "./phenologyChange";
import {
  DEFAULT_NDVI_AMPLITUDE_THRESHOLD_FRACTION,
  MINIMUM_NDVI_AMPLITUDE_FOR_CROSSINGS,
  NDVI_THRESHOLD_CROSSING_LIMITATIONS,
  summarizeNdviThresholdCrossings,
} from "./phenologyThresholdCrossing";

/** Build a validated change summary from a bare monthly NDVI series. */
function changeFor(
  series: readonly { month: number; ndvi: number | null }[],
  latitude = 48.8,
  options?: { stabilityThreshold?: number }
) {
  return summarizeNdviMonthlyChange(
    series.map(({ month, ndvi }) => ({
      month: { year: 2025, month },
      ndvi,
      validFraction: 0.9,
    })),
    latitude,
    options
  );
}

/** A single-season rise-then-fall trace: trough 0.1, peak 0.6, level 0.35. */
const RISE_THEN_FALL = [
  { month: 1, ndvi: 0.1 },
  { month: 2, ndvi: 0.3 },
  { month: 3, ndvi: 0.6 },
  { month: 4, ndvi: 0.4 },
  { month: 5, ndvi: 0.15 },
];

/**
 * A near-flat trace whose amplitude (0.0625) falls below the default floor.
 * The values are exactly representable in binary, so the derived level lands
 * exactly on March's value rather than a rounding artefact either side of it.
 */
const NEAR_FLAT = [
  { month: 1, ndvi: 0.25 },
  { month: 2, ndvi: 0.3125 },
  { month: 3, ndvi: 0.28125 },
];

describe("NDVI amplitude threshold crossings", () => {
  it("brackets the upward and downward half-amplitude crossings", () => {
    const summary = summarizeNdviThresholdCrossings(changeFor(RISE_THEN_FALL));

    expect(summary).toMatchObject({
      kind: "observed-ndvi-threshold-crossings",
      isForecast: false,
      hemisphere: "northern",
      status: "available",
      thresholdFraction: DEFAULT_NDVI_AMPLITUDE_THRESHOLD_FRACTION,
      minimumAmplitude: MINIMUM_NDVI_AMPLITUDE_FOR_CROSSINGS,
      requiredValidFraction: 0,
      upwardCount: 1,
      downwardCount: 1,
      source: NDVI_SOURCE,
      unit: NDVI_UNIT,
      reason: null,
    });

    expect(summary.reference).toMatchObject({
      peakMonth: { year: 2025, month: 3 },
      troughMonth: { year: 2025, month: 1 },
    });
    expect(summary.reference?.peak).toBeCloseTo(0.6, 10);
    expect(summary.reference?.trough).toBeCloseTo(0.1, 10);
    expect(summary.reference?.amplitude).toBeCloseTo(0.5, 10);
    expect(summary.reference?.level).toBeCloseTo(0.35, 10);

    expect(summary.crossings).toHaveLength(2);
    expect(summary.crossings[0]).toMatchObject({
      direction: "upward",
      from: { year: 2025, month: 2 },
      to: { year: 2025, month: 3 },
      toSeason: "spring",
      minimumValidFraction: 0.9,
    });
    // The level sits a sixth of the way from February's 0.3 to March's 0.6.
    expect(summary.crossings[0].linearFractionWithinInterval).toBeCloseTo(
      1 / 6,
      10
    );
    expect(summary.crossings[1]).toMatchObject({
      direction: "downward",
      from: { year: 2025, month: 4 },
      to: { year: 2025, month: 5 },
      toSeason: "spring",
    });
    expect(summary.crossings[1].linearFractionWithinInterval).toBeCloseTo(
      0.2,
      10
    );
  });

  it("reports coverage inherited from the parent change summary", () => {
    const summary = summarizeNdviThresholdCrossings(changeFor(RISE_THEN_FALL));

    expect(summary.coverage).toEqual({
      transitionCount: 4,
      observedMonthCount: 5,
      gapFreeRunCount: 1,
      runBreakCount: 0,
      gapCount: 0,
      usableMonthCount: 5,
      missingMonthCount: 0,
      lowCoverageMonthCount: 0,
      invalidRecordCount: 0,
    });
  });

  it("carries missing and rejected records through without re-parsing them", () => {
    const summary = summarizeNdviThresholdCrossings(
      changeFor([
        { month: 1, ndvi: 0.1 },
        { month: 2, ndvi: 0.3 },
        { month: 2, ndvi: 0.31 },
        { month: 3, ndvi: 0.6 },
        { month: 4, ndvi: null },
      ])
    );

    expect(summary.coverage).toMatchObject({
      usableMonthCount: 3,
      missingMonthCount: 1,
      invalidRecordCount: 1,
      transitionCount: 2,
    });
    expect(summary.status).toBe("available");
    expect(summary.upwardCount).toBe(1);
  });

  it("does not record a crossing when the series only touches the level", () => {
    // Trough 0.0 and peak 1.0 put the half-amplitude level exactly on 0.5,
    // which February's value sits on before the series falls back.
    const summary = summarizeNdviThresholdCrossings(
      changeFor([
        { month: 1, ndvi: 0.0 },
        { month: 2, ndvi: 0.5 },
        { month: 3, ndvi: 0.0 },
        { month: 4, ndvi: 1.0 },
      ])
    );

    expect(summary.reference?.level).toBe(0.5);
    expect(summary.crossings).toHaveLength(1);
    expect(summary.crossings[0]).toMatchObject({
      direction: "upward",
      from: { year: 2025, month: 3 },
      to: { year: 2025, month: 4 },
      linearFractionWithinInterval: 0.5,
    });
    expect(summary.downwardCount).toBe(0);
  });

  it("never bridges a data gap, leaving the count a floor", () => {
    const summary = summarizeNdviThresholdCrossings(
      changeFor([
        { month: 1, ndvi: 0.1 },
        { month: 2, ndvi: 0.2 },
        { month: 5, ndvi: 0.7 },
        { month: 6, ndvi: 0.8 },
      ])
    );

    expect(summary.status).toBe("available");
    expect(summary.reference?.level).toBeCloseTo(0.45, 10);
    // The series clearly passes 0.45 between February and May, but no
    // consecutive-month pair brackets it, so nothing is reported.
    expect(summary.crossings).toEqual([]);
    expect(summary.coverage).toMatchObject({
      transitionCount: 2,
      gapFreeRunCount: 2,
      runBreakCount: 1,
      gapCount: 1,
    });
  });

  it("refuses a near-flat trace but still returns the reference", () => {
    const summary = summarizeNdviThresholdCrossings(changeFor(NEAR_FLAT));

    expect(summary.status).toBe("insufficient-amplitude");
    expect(summary.reason).toBe("amplitude-below-floor");
    expect(summary.reference?.amplitude).toBe(0.0625);
    expect(summary.crossings).toEqual([]);
    expect(summary.upwardCount).toBe(0);
    expect(summary.downwardCount).toBe(0);
  });

  it("honours a caller-supplied amplitude floor", () => {
    const summary = summarizeNdviThresholdCrossings(changeFor(NEAR_FLAT), {
      minimumAmplitude: 0,
    });

    expect(summary.status).toBe("available");
    expect(summary.minimumAmplitude).toBe(0);
    expect(summary.crossings).toHaveLength(1);
    expect(summary.crossings[0]).toMatchObject({
      direction: "upward",
      from: { year: 2025, month: 1 },
      to: { year: 2025, month: 2 },
    });
  });

  it("reports no crossings when no consecutive-month pair survives", () => {
    const summary = summarizeNdviThresholdCrossings(
      changeFor([
        { month: 1, ndvi: 0.1 },
        { month: 5, ndvi: 0.8 },
      ])
    );

    expect(summary).toMatchObject({
      status: "no-transitions",
      reason: "no-consecutive-month-transitions",
      reference: null,
      crossings: [],
      upwardCount: 0,
      downwardCount: 0,
      source: NDVI_SOURCE,
      unit: NDVI_UNIT,
    });
    expect(summary.coverage).toMatchObject({
      transitionCount: 0,
      observedMonthCount: 0,
      gapFreeRunCount: 0,
      runBreakCount: 0,
      gapCount: 1,
    });
  });

  it("moves the bracket when a different amplitude fraction is requested", () => {
    const summary = summarizeNdviThresholdCrossings(changeFor(RISE_THEN_FALL), {
      thresholdFraction: 0.2,
    });

    expect(summary.thresholdFraction).toBe(0.2);
    expect(summary.reference?.level).toBeCloseTo(0.2, 10);
    expect(summary.crossings).toHaveLength(2);
    expect(summary.crossings[0]).toMatchObject({
      direction: "upward",
      from: { year: 2025, month: 1 },
      to: { year: 2025, month: 2 },
    });
    expect(summary.crossings[0].linearFractionWithinInterval).toBeCloseTo(
      0.5,
      10
    );
  });

  it.each([0, 1, -0.5, 1.5, Number.NaN, Number.POSITIVE_INFINITY])(
    "falls back to the half-amplitude default for fraction %p",
    (fraction) => {
      const summary = summarizeNdviThresholdCrossings(
        changeFor(RISE_THEN_FALL),
        { thresholdFraction: fraction }
      );

      expect(summary.thresholdFraction).toBe(
        DEFAULT_NDVI_AMPLITUDE_THRESHOLD_FRACTION
      );
      expect(summary.reference?.level).toBeCloseTo(0.35, 10);
    }
  );

  it("falls back to the default amplitude floor for an invalid override", () => {
    const summary = summarizeNdviThresholdCrossings(changeFor(RISE_THEN_FALL), {
      minimumAmplitude: -1,
    });

    expect(summary.minimumAmplitude).toBe(MINIMUM_NDVI_AMPLITUDE_FOR_CROSSINGS);
  });

  it("is unaffected by the parent little-change dead band", () => {
    // A dead band wide enough to label every transition "little-change" must
    // not hide the fact that the values themselves crossed the level.
    const change = changeFor(
      [
        { month: 1, ndvi: 0.1 },
        { month: 2, ndvi: 0.3 },
        { month: 3, ndvi: 0.6 },
      ],
      48.8,
      { stabilityThreshold: 1 }
    );
    expect(change.littleChangeCount).toBe(2);

    const summary = summarizeNdviThresholdCrossings(change);
    expect(summary.upwardCount).toBe(1);
    expect(summary.crossings[0]).toMatchObject({
      from: { year: 2025, month: 2 },
      to: { year: 2025, month: 3 },
    });
  });

  it("labels the crossing month with the southern-hemisphere convention", () => {
    const summary = summarizeNdviThresholdCrossings(
      changeFor(RISE_THEN_FALL, -33.9)
    );

    expect(summary.hemisphere).toBe("southern");
    expect(summary.crossings[0].toSeason).toBe("autumn");
  });

  it("assigns no season where the calendar convention does not apply", () => {
    const summary = summarizeNdviThresholdCrossings(
      changeFor(RISE_THEN_FALL, 0)
    );

    expect(summary.hemisphere).toBe("equatorial");
    expect(summary.crossings[0].toSeason).toBe("not-assigned");
  });

  it("keeps every interpolated position inside the bracketing interval", () => {
    const summary = summarizeNdviThresholdCrossings(
      changeFor([
        { month: 1, ndvi: 0.05 },
        { month: 2, ndvi: 0.4 },
        { month: 3, ndvi: 0.2 },
        { month: 4, ndvi: 0.85 },
        { month: 5, ndvi: 0.1 },
      ])
    );

    expect(summary.crossings.length).toBeGreaterThan(0);
    for (const crossing of summary.crossings) {
      expect(crossing.linearFractionWithinInterval).toBeGreaterThanOrEqual(0);
      expect(crossing.linearFractionWithinInterval).toBeLessThanOrEqual(1);
      expect(Object.is(crossing.linearFractionWithinInterval, -0)).toBe(false);
    }
  });

  it("states the scope limits callers must surface", () => {
    expect(NDVI_THRESHOLD_CROSSING_LIMITATIONS).toContain("MOD13A3");
    expect(NDVI_THRESHOLD_CROSSING_LIMITATIONS).toContain("never dated");
    expect(NDVI_THRESHOLD_CROSSING_LIMITATIONS).toContain("start-of-season");
    expect(NDVI_THRESHOLD_CROSSING_LIMITATIONS).toContain("forecast");
  });
});
