import { describe, it, expect } from "vitest";
import { momentFromMagnitude } from "./seismicMoment";
import {
  seismicMomentConcentration,
  minEventsForMomentShare,
  SEISMIC_MOMENT_CONCENTRATION_UNITS,
  DEFAULT_MOMENT_SHARE,
} from "./seismicMomentConcentration";

describe("minEventsForMomentShare", () => {
  it("counts the largest events needed to reach a cumulative share", () => {
    // One M8 carries ~10^6 times the moment of an M4, so it alone clears any
    // share up to ~0.9999; the tiny events only matter near a share of 1.
    const magnitudes = [8, 4, 4, 4];
    expect(minEventsForMomentShare(magnitudes, 0.9)).toBe(1);
    expect(minEventsForMomentShare(magnitudes, 0.5)).toBe(1);
  });

  it("needs every event to reach the full total (share = 1)", () => {
    expect(minEventsForMomentShare([6, 6, 6], 1)).toBe(3);
  });

  it("spreads across events when moments are equal", () => {
    // Four equal M6 events each contribute 25% of the moment: reaching 50%
    // needs two, reaching 75% needs three.
    const equal = [6, 6, 6, 6];
    expect(minEventsForMomentShare(equal, 0.5)).toBe(2);
    expect(minEventsForMomentShare(equal, 0.75)).toBe(3);
    expect(minEventsForMomentShare(equal, 0.76)).toBe(4);
  });

  it("is order-independent", () => {
    expect(minEventsForMomentShare([4, 8, 5, 4], 0.9)).toBe(
      minEventsForMomentShare([8, 5, 4, 4], 0.9)
    );
  });

  it("rejects shares outside (0, 1] and empty input", () => {
    expect(minEventsForMomentShare([6], 0)).toBeNull();
    expect(minEventsForMomentShare([6], -0.1)).toBeNull();
    expect(minEventsForMomentShare([6], 1.1)).toBeNull();
    expect(minEventsForMomentShare([6], NaN)).toBeNull();
    expect(minEventsForMomentShare([], 0.9)).toBeNull();
    expect(minEventsForMomentShare([NaN, Infinity], 0.9)).toBeNull();
  });
});

describe("seismicMomentConcentration", () => {
  it("reports the single-largest-event moment fraction", () => {
    // Two identical M6 events: each is exactly half the total moment.
    const result = seismicMomentConcentration([6, 6]);
    expect(result.contributingCount).toBe(2);
    expect(result.totalMomentNm).toBeCloseTo(2 * momentFromMagnitude(6)!, 3);
    expect(result.largestMagnitude).toBe(6);
    expect(result.largestEventMomentFraction).toBeCloseTo(0.5, 12);
  });

  it("shows a top-heavy release dominated by one event", () => {
    const result = seismicMomentConcentration([8, 5, 4]);
    expect(result.largestMagnitude).toBe(8);
    // The M8 carries virtually all of the moment.
    expect(result.largestEventMomentFraction).toBeGreaterThan(0.999);
    expect(result.eventsForShare).toBe(1);
  });

  it("uses the default 90% share for the headline count", () => {
    const result = seismicMomentConcentration([6, 6, 6, 6]);
    expect(result.share).toBe(DEFAULT_MOMENT_SHARE);
    // Four equal events: reaching 90% of the moment needs all four.
    expect(result.eventsForShare).toBe(4);
  });

  it("honors a custom share and leaves the rest intact", () => {
    const result = seismicMomentConcentration([6, 6, 6, 6], 0.5);
    expect(result.share).toBe(0.5);
    expect(result.eventsForShare).toBe(2);
    expect(result.largestEventMomentFraction).toBeCloseTo(0.25, 12);
  });

  it("leaves the count null for an unusable share but still summarizes", () => {
    const result = seismicMomentConcentration([6, 7], 1.5);
    expect(result.eventsForShare).toBeNull();
    expect(result.contributingCount).toBe(2);
    expect(result.largestMagnitude).toBe(7);
    expect(result.largestEventMomentFraction).not.toBeNull();
  });

  it("skips non-finite magnitudes but summarizes the rest", () => {
    const result = seismicMomentConcentration([6, NaN, 6, Infinity]);
    expect(result.contributingCount).toBe(2);
    expect(result.skippedCount).toBe(2);
    expect(result.largestEventMomentFraction).toBeCloseTo(0.5, 12);
  });

  it("makes an empty basis explicit rather than manufacturing a zero", () => {
    const empty = seismicMomentConcentration([]);
    expect(empty.contributingCount).toBe(0);
    expect(empty.totalMomentNm).toBe(0);
    expect(empty.largestMagnitude).toBeNull();
    expect(empty.largestEventMomentFraction).toBeNull();
    expect(empty.eventsForShare).toBeNull();

    const allSkipped = seismicMomentConcentration([NaN, Infinity]);
    expect(allSkipped.contributingCount).toBe(0);
    expect(allSkipped.skippedCount).toBe(2);
    expect(allSkipped.largestMagnitude).toBeNull();
  });

  it("carries the moment-magnitude reference, units, and honest limitations", () => {
    const result = seismicMomentConcentration([5]);
    expect(result.kind).toBe("seismic-moment-concentration");
    expect(result.isForecast).toBe(false);
    expect(result.reference.assumesMomentMagnitude).toBe(true);
    expect(result.units).toBe(SEISMIC_MOMENT_CONCENTRATION_UNITS);
    // The dominant caveat — no hazard/forecast claim — must be stated.
    expect(
      result.limitations.some((line) => /forecast|hazard/i.test(line))
    ).toBe(true);
  });
});
