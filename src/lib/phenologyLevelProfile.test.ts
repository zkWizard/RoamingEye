import { describe, expect, it } from "vitest";
import {
  NDVI_LEVEL_PROFILE_LIMITATIONS,
  summarizeNdviLevelProfile,
  type NdviLevelProfile,
} from "./phenologyLevelProfile";
import {
  NDVI_SOURCE,
  NDVI_UNIT,
  type NdviMonthlyObservation,
} from "./phenology";

/** Build a one-year observation series from a 12-value NDVI array (Jan..Dec). */
function yearObservations(
  year: number,
  monthlyNdvi: readonly (number | null)[],
  validFraction?: number
): NdviMonthlyObservation[] {
  return monthlyNdvi.map((ndvi, index) => ({
    month: { year, month: index + 1 },
    ndvi,
    ...(validFraction === undefined ? {} : { validFraction }),
  }));
}

function onlyYear(
  observations: NdviMonthlyObservation[],
  latitude: number
): NdviLevelProfile {
  const summaries = summarizeNdviLevelProfile(observations, latitude);
  expect(summaries).toHaveLength(1);
  return summaries[0];
}

describe("summarizeNdviLevelProfile", () => {
  it("reports R-7 quantiles, IQR and mean for a full year", () => {
    // Twelve evenly-spaced values 0.10..0.65 (step 0.05). Under R-7 on the
    // sorted array, ranks are (n-1)·p = 11·p: median at rank 5.5 = 0.375,
    // Q1 at rank 2.75 = 0.2375, Q3 at rank 8.25 = 0.5125.
    const monthly = [
      0.1, 0.15, 0.2, 0.25, 0.3, 0.35, 0.4, 0.45, 0.5, 0.55, 0.6, 0.65,
    ];
    const result = onlyYear(yearObservations(2021, monthly), 45);

    expect(result.status).toBe("available");
    expect(result.year).toBe(2021);
    expect(result.hemisphere).toBe("northern");
    expect(result.reason).toBeNull();
    const q = result.quantiles!;
    expect(q.min).toBeCloseTo(0.1, 10);
    expect(q.max).toBeCloseTo(0.65, 10);
    expect(q.median).toBeCloseTo(0.375, 10);
    expect(q.q1).toBeCloseTo(0.2375, 10);
    expect(q.q3).toBeCloseTo(0.5125, 10);
    expect(q.iqr).toBeCloseTo(q.q3 - q.q1, 12);
    expect(q.mean).toBeCloseTo(0.375, 10);
  });

  it("gives an outlier-resistant median where the extrema are swayed by one month", () => {
    // Eleven near-constant months plus a single anomalous high composite: the
    // peak (max) jumps to 0.95, but the median stays at the typical level.
    const monthly = [
      0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.95,
    ];
    const q = onlyYear(yearObservations(2022, monthly), 40).quantiles!;

    expect(q.max).toBeCloseTo(0.95, 10);
    expect(q.median).toBeCloseTo(0.5, 10);
    // The mean is dragged upward by the outlier; the median is not.
    expect(q.mean).toBeGreaterThan(q.median);
    expect(q.iqr).toBeCloseTo(0, 10);
  });

  it("is order-independent: shuffled input yields identical quantiles", () => {
    const monthly = [
      0.12, 0.31, 0.28, 0.44, 0.6, 0.55, 0.7, 0.66, 0.4, 0.33, 0.22, 0.18,
    ];
    const ascending = onlyYear(yearObservations(2020, monthly), 50);
    const shuffled = onlyYear(
      [...yearObservations(2020, monthly)].reverse(),
      50
    );
    expect(shuffled.quantiles).toEqual(ascending.quantiles);
  });

  it("reports insufficient-coverage when fewer than the required months are valid", () => {
    const monthly = [
      0.3,
      0.4,
      0.5,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
    ];
    const result = onlyYear(yearObservations(2019, monthly), 45);

    expect(result.status).toBe("insufficient-coverage");
    expect(result.quantiles).toBeNull();
    expect(result.reason).toBe("insufficient-months");
    expect(result.coverage.validMonthCount).toBe(3);
    expect(result.coverage.missingMonthCount).toBe(9);
    expect(result.coverage.requiredMonthCount).toBe(6);
  });

  it("honours a custom minimumMonths option", () => {
    const monthly = [
      0.3,
      0.4,
      0.5,
      0.6,
      0.7,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
    ];
    const strict = summarizeNdviLevelProfile(
      yearObservations(2019, monthly),
      45,
      { minimumMonths: 6 }
    );
    expect(strict[0].status).toBe("insufficient-coverage");

    const lenient = summarizeNdviLevelProfile(
      yearObservations(2019, monthly),
      45,
      { minimumMonths: 5 }
    );
    expect(lenient[0].status).toBe("available");
    expect(lenient[0].coverage.requiredMonthCount).toBe(5);
  });

  it("counts duplicates and out-of-range values as invalid, never averaging them in", () => {
    const observations: NdviMonthlyObservation[] = [
      ...yearObservations(2021, [
        0.2,
        0.3,
        0.4,
        0.5,
        0.6,
        0.7,
        0.8,
        null,
        null,
        null,
        null,
        null,
      ]),
      // Duplicate January and an impossible NDVI must not enter the statistics.
      { month: { year: 2021, month: 1 }, ndvi: 0.99 },
      { month: { year: 2021, month: 9 }, ndvi: 2.5 },
    ];
    const result = onlyYear(observations, 45);

    expect(result.status).toBe("available");
    expect(result.coverage.validMonthCount).toBe(7);
    expect(result.coverage.invalidRecordCount).toBe(2);
    // Median of 0.2..0.8 (seven values) is the middle value 0.5, unaffected by
    // the rejected duplicate/out-of-range records.
    expect(result.quantiles!.median).toBeCloseTo(0.5, 10);
    expect(result.quantiles!.max).toBeCloseTo(0.8, 10);
  });

  it("treats a zero-coverage month as missing even when it carries a value", () => {
    const observations: NdviMonthlyObservation[] = yearObservations(
      2021,
      [0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 0.2, 0.1, 0.15, 0.25, 0.35],
      1
    );
    observations[0] = {
      month: { year: 2021, month: 1 },
      ndvi: 0.3,
      validFraction: 0,
    };
    const result = onlyYear(observations, 45);

    expect(result.coverage.validMonthCount).toBe(11);
    expect(result.coverage.missingMonthCount).toBe(1);
    expect(result.coverage.minimumValidFraction).toBe(1);
  });

  it("retains the shared NDVI provenance and unit on every profile", () => {
    const result = onlyYear(
      yearObservations(
        2021,
        [0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.5, 0.4, 0.3, 0.2, 0.1]
      ),
      45
    );
    expect(result.source).toBe(NDVI_SOURCE);
    expect(result.unit).toBe(NDVI_UNIT);
    expect(result.isForecast).toBe(false);
    expect(result.kind).toBe("ndvi-level-profile");
  });

  it("summarizes each year independently, sorted ascending", () => {
    const observations: NdviMonthlyObservation[] = [
      ...yearObservations(
        2021,
        [0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.5, 0.4, 0.3, 0.2, 0.1]
      ),
      ...yearObservations(
        2019,
        [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.5, 0.4, 0.3, 0.2, 0.1, 0.05]
      ),
    ];
    const summaries = summarizeNdviLevelProfile(observations, 45);
    expect(summaries.map((s) => s.year)).toEqual([2019, 2021]);
    expect(summaries.every((s) => s.status === "available")).toBe(true);
  });

  it("documents its scope and limits in prose", () => {
    expect(NDVI_LEVEL_PROFILE_LIMITATIONS).toMatch(/median/i);
    expect(NDVI_LEVEL_PROFILE_LIMITATIONS).toMatch(/interquartile range/i);
    expect(NDVI_LEVEL_PROFILE_LIMITATIONS).toMatch(/not a growing-season/i);
    expect(NDVI_LEVEL_PROFILE_LIMITATIONS).toMatch(/forecast/i);
  });
});
