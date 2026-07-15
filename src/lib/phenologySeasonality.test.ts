import { describe, expect, it } from "vitest";
import {
  NDVI_SEASONAL_CONCENTRATION_LIMITATIONS,
  summarizeNdviSeasonalConcentration,
  type NdviSeasonalConcentration,
} from "./phenologySeasonality";
import { NDVI_SOURCE, type NdviMonthlyObservation } from "./phenology";

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

/** A pronounced northern-summer greenness bump: low in winter, high mid-year. */
const NORTHERN_SEASONAL = [
  0.15, 0.18, 0.28, 0.45, 0.62, 0.78, 0.82, 0.7, 0.5, 0.32, 0.2, 0.14,
];

/** Near-constant greenness: a weakly seasonal, near-evergreen signal. */
const NEAR_EVERGREEN = [
  0.71, 0.7, 0.72, 0.71, 0.73, 0.72, 0.71, 0.72, 0.7, 0.71, 0.72, 0.71,
];

function onlyYear(
  observations: NdviMonthlyObservation[],
  latitude: number
): NdviSeasonalConcentration {
  const summaries = summarizeNdviSeasonalConcentration(observations, latitude);
  expect(summaries).toHaveLength(1);
  return summaries[0];
}

describe("summarizeNdviSeasonalConcentration", () => {
  it("reports a mid-year centroid and high concentration for a peaked northern year", () => {
    const result = onlyYear(yearObservations(2021, NORTHERN_SEASONAL), 45);

    expect(result.status).toBe("available");
    expect(result.year).toBe(2021);
    expect(result.hemisphere).toBe("northern");
    expect(result.concentration).not.toBeNull();
    // Greenness is packed around mid-year, so R sits well above the aseasonal
    // floor; the centroid lands in the northern summer.
    expect(result.concentration as number).toBeGreaterThan(0.35);
    expect(result.centroidMonth).toBeGreaterThanOrEqual(6);
    expect(result.centroidMonth).toBeLessThanOrEqual(7);
    expect(result.centroidSeason).toBe("summer");
    expect(result.reason).toBeNull();
  });

  it("flips the centroid season for the same cycle in the southern hemisphere", () => {
    const north = onlyYear(yearObservations(2021, NORTHERN_SEASONAL), 45);
    const south = onlyYear(yearObservations(2021, NORTHERN_SEASONAL), -33);

    // Same calendar shape → identical centroid month and concentration; only the
    // hemisphere-dependent season label changes.
    expect(south.centroidMonth).toBe(north.centroidMonth);
    expect(south.concentration).toBeCloseTo(north.concentration as number, 12);
    expect(south.hemisphere).toBe("southern");
    expect(south.centroidSeason).toBe("winter");
  });

  it("gives no season label to an equatorial location but still measures R", () => {
    const result = onlyYear(yearObservations(2021, NORTHERN_SEASONAL), 0);

    expect(result.hemisphere).toBe("equatorial");
    expect(result.centroidSeason).toBe("not-assigned");
    expect(result.concentration).not.toBeNull();
  });

  it("treats greenness split across the December/January turn as circular", () => {
    // Greenness concentrated in Dec and Jan must centre on the year-end turn,
    // never average to mid-year the way plain month numbers (12 and 1) would.
    const wrap = [
      0.8, 0.4, 0.12, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.12, 0.4, 0.82,
    ];
    const result = onlyYear(yearObservations(2020, wrap), 50);

    expect(result.status).toBe("available");
    const centroid = result.centroidMonth as number;
    expect(centroid === 12 || centroid === 1).toBe(true);
    expect(result.continuousCentroidMonth).not.toBeNull();
  });

  it("scores an evenly spread year lower than a peaked year", () => {
    const peaked = onlyYear(yearObservations(2021, NORTHERN_SEASONAL), 45);
    const flat = onlyYear(yearObservations(2021, NEAR_EVERGREEN), 45);

    expect(flat.status).toBe("available");
    // The near-evergreen year's above-minimum greenness is spread around the
    // calendar, so its resultant sits far below the peaked year's.
    expect(flat.concentration as number).toBeLessThan(
      peaked.concentration as number
    );
    expect(
      flat.seasonalityClass === "aseasonal" ||
        flat.seasonalityClass === "weakly-seasonal"
    ).toBe(true);
    expect(
      peaked.seasonalityClass === "seasonal" ||
        peaked.seasonalityClass === "strongly-seasonal"
    ).toBe(true);
  });

  it("returns R near zero with no centroid when greenness cancels around the year", () => {
    // Equal bumps a quarter-year apart (Jan/Apr/Jul/Oct) put four opposing unit
    // vectors on the circle: they cancel, so R collapses toward zero and the
    // centroid direction is genuinely undefined rather than fabricated.
    const symmetric = [
      0.7, 0.5, 0.5, 0.7, 0.5, 0.5, 0.7, 0.5, 0.5, 0.7, 0.5, 0.5,
    ];
    const result = onlyYear(yearObservations(2021, symmetric), 45);

    expect(result.status).toBe("available");
    expect(result.concentration as number).toBeCloseTo(0, 10);
    expect(result.seasonalityClass).toBe("aseasonal");
    expect(result.centroidMonth).toBeNull();
    expect(result.continuousCentroidMonth).toBeNull();
    expect(result.centroidSeason).toBe("not-assigned");
  });

  it("reports a flat year with no within-year variation, not a fabricated R", () => {
    const constant = Array.from({ length: 12 }, () => 0.5);
    const result = onlyYear(yearObservations(2019, constant), 45);

    expect(result.status).toBe("flat");
    expect(result.concentration).toBeNull();
    expect(result.centroidMonth).toBeNull();
    expect(result.continuousCentroidMonth).toBeNull();
    expect(result.seasonalityClass).toBeNull();
    expect(result.centroidSeason).toBe("not-assigned");
    expect(result.reason).toBe("no-within-year-variation");
  });

  it("withholds a concentration when too few valid months are supplied", () => {
    const sparse = yearObservations(2021, [
      0.2,
      0.5,
      0.8,
      0.6,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
    ]);
    const result = onlyYear(sparse, 45);

    expect(result.status).toBe("insufficient-coverage");
    expect(result.concentration).toBeNull();
    expect(result.reason).toBe("insufficient-months");
    expect(result.coverage.validMonthCount).toBe(4);
    expect(result.coverage.missingMonthCount).toBe(8);
    expect(result.coverage.requiredMonthCount).toBe(6);
  });

  it("honours a custom minimumMonths threshold", () => {
    const eightMonths = yearObservations(2021, [
      0.2,
      0.3,
      0.5,
      0.7,
      0.8,
      0.6,
      0.4,
      0.25,
      null,
      null,
      null,
      null,
    ]);

    expect(onlyYear(eightMonths, 45).status).toBe("available");
    expect(
      summarizeNdviSeasonalConcentration(eightMonths, 45, {
        minimumMonths: 10,
      })[0].status
    ).toBe("insufficient-coverage");
  });

  it("counts missing, duplicate, and out-of-range records without averaging them", () => {
    const observations: NdviMonthlyObservation[] = [
      ...yearObservations(2021, NORTHERN_SEASONAL),
      // Duplicate calendar month — rejected, never blended into the vector.
      { month: { year: 2021, month: 6 }, ndvi: 0.05 },
      // Out-of-range NDVI — rejected as invalid.
      { month: { year: 2021, month: 13 }, ndvi: 0.5 },
      { month: { year: 2021, month: 4 } as never, ndvi: 5 },
    ];
    const result = onlyYear(observations, 45);

    expect(result.coverage.validMonthCount).toBe(12);
    // One duplicate June, one invalid month 13, one duplicate April with a bad
    // value → three rejected records.
    expect(result.coverage.invalidRecordCount).toBe(3);
    expect(result.status).toBe("available");
  });

  it("treats a zero valid fraction as missing coverage", () => {
    const observations: NdviMonthlyObservation[] = yearObservations(
      2021,
      NORTHERN_SEASONAL
    ).map((observation, index) =>
      index === 5 ? { ...observation, validFraction: 0 } : observation
    );
    const result = onlyYear(observations, 45);

    expect(result.coverage.validMonthCount).toBe(11);
    expect(result.coverage.missingMonthCount).toBe(1);
  });

  it("summarizes multiple years in ascending order and retains NASA provenance", () => {
    const observations: NdviMonthlyObservation[] = [
      ...yearObservations(2022, NORTHERN_SEASONAL),
      ...yearObservations(2020, NORTHERN_SEASONAL),
      ...yearObservations(2021, NEAR_EVERGREEN),
    ];
    const summaries = summarizeNdviSeasonalConcentration(observations, 45);

    expect(summaries.map((summary) => summary.year)).toEqual([
      2020, 2021, 2022,
    ]);
    for (const summary of summaries) {
      expect(summary.isForecast).toBe(false);
      expect(summary.source).toBe(NDVI_SOURCE);
      expect(summary.unit).toBe("NDVI (unitless)");
    }
  });

  it("keeps R within [0, 1] and documents its scope", () => {
    const result = onlyYear(yearObservations(2021, NORTHERN_SEASONAL), 45);
    expect(result.concentration as number).toBeGreaterThanOrEqual(0);
    expect(result.concentration as number).toBeLessThanOrEqual(1);
    expect(NDVI_SEASONAL_CONCENTRATION_LIMITATIONS).toContain("not a");
  });
});
