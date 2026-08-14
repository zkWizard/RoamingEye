import { describe, expect, it } from "vitest";
import { CLIMATE_METRICS } from "./climate";
import { SCALE_CONVERSIONS } from "./colormap";
import {
  PRECIP_ACCUMULATION_RESOLVABILITY_LIMITATIONS,
  PRECIP_INVERSION_REPORTED_UNIT,
  PRECIPITATION_RATE_METRIC_ID,
  describePrecipitationAccumulationResolvability,
  precipitationInversionRmseMmPerDay,
} from "./precipitationAccumulationResolvability";
import { PRECIP_ACCUMULATION_CHANGE_THRESHOLD_MM } from "./precipitationAccumulationChange";
import { MEASURED_INVERSION } from "./validation";

/** The published rate-error figure this module reads at runtime, in mm/day. */
const RATE_RMSE = MEASURED_INVERSION.precip.rmse as number;
const SOURCE = CLIMATE_METRICS["precipitation-rate"].source;

/** Floor for a pair of month lengths, derived the same way the module does. */
const floorFor = (earlierDays: number, laterDays: number) =>
  RATE_RMSE * Math.hypot(earlierDays, laterDays);

describe("describePrecipitationAccumulationResolvability", () => {
  it("reads the published figure in the unit it is documented in", () => {
    // The module scales a *rate* error by a day count, so it must use the
    // reported mm/day figure and never the native kg/m²/s value.
    expect(SCALE_CONVERSIONS.precip?.unit).toBe(PRECIP_INVERSION_REPORTED_UNIT);
    expect(MEASURED_INVERSION.precip.rmse).not.toBeNull();

    const result = describePrecipitationAccumulationResolvability(
      5,
      31,
      28,
      SOURCE
    );
    expect(result?.rateRmseMmPerDay).toBe(RATE_RMSE);
    expect(result?.earlierTotalRmseMm).toBeCloseTo(RATE_RMSE * 31, 10);
    expect(result?.laterTotalRmseMm).toBeCloseTo(RATE_RMSE * 28, 10);
  });

  it("scales the floor with both months' own integration lengths", () => {
    // A rate error integrated over a month grows with that month's day count,
    // so a longer pair is held to a higher bar than a shorter one.
    const longPair = describePrecipitationAccumulationResolvability(
      0,
      31,
      31,
      SOURCE
    );
    const shortPair = describePrecipitationAccumulationResolvability(
      0,
      28,
      28,
      SOURCE
    );
    expect(longPair?.differenceFloorMm).toBeCloseTo(floorFor(31, 31), 10);
    expect(shortPair?.differenceFloorMm).toBeCloseTo(floorFor(28, 28), 10);
    expect(longPair!.differenceFloorMm!).toBeGreaterThan(
      shortPair!.differenceFloorMm!
    );
    // Equal-length months collapse to the familiar sqrt(2) x per-total error.
    expect(longPair?.differenceFloorMm).toBeCloseTo(
      Math.SQRT2 * RATE_RMSE * 31,
      10
    );
  });

  it("resolves a difference larger than the floor and reports it", () => {
    const floor = floorFor(31, 28);
    const result = describePrecipitationAccumulationResolvability(
      -(floor + 1),
      31,
      28,
      SOURCE
    );
    expect(result?.resolution).toBe("resolved");
    expect(result?.statement).toContain("exceeds the");
    expect(result?.statement).toContain("31-day and 28-day pair");
    expect(result?.statement).toContain("GLDAS_NOAH025_M v2.1");
  });

  it("does not resolve a difference inside the floor, and asserts no equality", () => {
    const floor = floorFor(31, 28);
    const result = describePrecipitationAccumulationResolvability(
      floor - 1,
      31,
      28,
      SOURCE
    );
    expect(result?.resolution).toBe("unresolved");
    expect(result?.statement).toContain("cannot separate it");
    expect(result?.statement).toContain(
      "does not assert that the two months delivered the same water"
    );
    // A verdict is never an assertion that the totals were equal, nor a
    // reversal of the sign the caller already reported.
    expect(result?.changeMm).toBe(floor - 1);
  });

  it("treats a difference exactly at the floor as unresolved", () => {
    const floor = floorFor(30, 30);
    const result = describePrecipitationAccumulationResolvability(
      floor,
      30,
      30,
      SOURCE
    );
    expect(result?.resolution).toBe("unresolved");
  });

  it("puts the reporting threshold far inside the measured floor", () => {
    // The whole point of the descriptor: the 1 mm band the change module names
    // little-change inside is an order of magnitude below what the measured
    // inversion can separate for any real pair of calendar months.
    const shortestFloor = floorFor(28, 28);
    expect(shortestFloor).toBeGreaterThan(
      PRECIP_ACCUMULATION_CHANGE_THRESHOLD_MM * 5
    );
    const atThreshold = describePrecipitationAccumulationResolvability(
      PRECIP_ACCUMULATION_CHANGE_THRESHOLD_MM,
      28,
      28,
      SOURCE
    );
    expect(atThreshold?.resolution).toBe("unresolved");
  });

  it("withholds a verdict for a missing or non-finite difference", () => {
    expect(
      describePrecipitationAccumulationResolvability(null, 31, 30, SOURCE)
    ).toBeNull();
    expect(
      describePrecipitationAccumulationResolvability(Number.NaN, 31, 30, SOURCE)
    ).toBeNull();
  });

  it("withholds a verdict for a day count that is not a calendar month", () => {
    for (const days of [0, 27, 32, 30.5, Number.NaN]) {
      expect(
        describePrecipitationAccumulationResolvability(5, days, 30, SOURCE)
      ).toBeNull();
      expect(
        describePrecipitationAccumulationResolvability(5, 30, days, SOURCE)
      ).toBeNull();
    }
  });

  it("carries the caller's provenance and the shared limits unchanged", () => {
    const result = describePrecipitationAccumulationResolvability(
      5,
      31,
      30,
      SOURCE
    );
    expect(result?.source).toBe(SOURCE);
    expect(result?.isForecast).toBe(false);
    expect(result?.unit).toBe("mm");
    expect(result?.limitations).toBe(
      PRECIP_ACCUMULATION_RESOLVABILITY_LIMITATIONS
    );
    // The floor is inversion error only; the limits must not let a reader take
    // it for a total error budget or for the month-length caveat.
    expect(
      PRECIP_ACCUMULATION_RESOLVABILITY_LIMITATIONS.some((limit) =>
        limit.includes("not added to the land-model product's own")
      )
    ).toBe(true);
  });
});

/**
 * The published figure is shared with a second claim on the same readout — the
 * rounding place it justifies for the absolute mm/day rate — so it is exported
 * from one definition rather than re-derived beside each consumer.
 */
describe("precipitationInversionRmseMmPerDay", () => {
  it("reports the committed figure in the unit it is documented in", () => {
    expect(precipitationInversionRmseMmPerDay()).toBe(RATE_RMSE);
    expect(PRECIP_INVERSION_REPORTED_UNIT).toBe("mm/day");
  });

  it("is the figure the accumulation floor is built from", () => {
    // One definition, two consumers: the floor a caller can observe must be
    // reconstructible from the exported figure alone, or the two have drifted.
    const result = describePrecipitationAccumulationResolvability(
      0,
      31,
      30,
      SOURCE
    );
    const rate = precipitationInversionRmseMmPerDay();
    expect(rate).not.toBeNull();
    expect(result?.rateRmseMmPerDay).toBe(rate);
    expect(result?.differenceFloorMm).toBeCloseTo(
      (rate as number) * Math.hypot(31, 30),
      10
    );
  });

  it("names the metric its figures describe", () => {
    // The rate error belongs to precipitation observations only; a consumer
    // scoping a clause by metric id must not have to spell the literal itself.
    expect(PRECIPITATION_RATE_METRIC_ID).toBe("precipitation-rate");
    expect(CLIMATE_METRICS[PRECIPITATION_RATE_METRIC_ID].source).toBe(SOURCE);
  });
});
