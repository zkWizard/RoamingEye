import { describe, expect, it } from "vitest";
import {
  NDVI_SOURCE,
  NDVI_UNIT,
  summarizeAnnualNdviPhenology,
  type NdviMonthlyObservation,
} from "./phenology";
import {
  MINIMUM_YEARS_FOR_EXTREMUM_LEVEL_SUMMARY,
  summarizeNdviExtremumLevels,
} from "./phenologyExtremumLevels";

/** Build one year of month/ndvi pairs at a fixed year. */
function yearOf(
  year: number,
  months: readonly (readonly [number, number])[]
): NdviMonthlyObservation[] {
  return months.map(([month, ndvi]) => ({ month: { year, month }, ndvi }));
}

/** A full northern-hemisphere seasonal cycle with a chosen peak and trough. */
function cycle(year: number, peak: number, trough: number) {
  const mid = (peak + trough) / 2;
  return yearOf(year, [
    [1, trough],
    [2, trough + 0.02],
    [3, mid],
    [4, mid + 0.05],
    [5, peak - 0.05],
    [6, peak],
    [7, peak - 0.05],
    [8, mid],
    [9, mid - 0.05],
    [10, trough + 0.03],
    [11, trough + 0.01],
    [12, trough],
  ]);
}

const LAT = 45;

describe("summarizeNdviExtremumLevels", () => {
  it("summarizes the interannual peak and trough level distributions", () => {
    const annuals = summarizeAnnualNdviPhenology(
      [
        ...cycle(2021, 0.8, 0.2),
        ...cycle(2022, 0.7, 0.3),
        ...cycle(2023, 0.9, 0.4),
      ],
      LAT
    );

    const summary = summarizeNdviExtremumLevels(annuals);

    expect(summary).toMatchObject({
      kind: "observed-ndvi-seasonal-extremum-levels",
      isForecast: false,
      hemisphere: "northern",
      status: "available",
      requiredYearCount: MINIMUM_YEARS_FOR_EXTREMUM_LEVEL_SUMMARY,
      coverage: {
        suppliedYearCount: 3,
        usableYearCount: 3,
        unusableYearCount: 0,
      },
      unit: NDVI_UNIT,
      reason: null,
    });

    expect(summary.years.map((y) => [y.year, y.peak, y.trough])).toEqual([
      [2021, expect.closeTo(0.8, 12), expect.closeTo(0.2, 12)],
      [2022, expect.closeTo(0.7, 12), expect.closeTo(0.3, 12)],
      [2023, expect.closeTo(0.9, 12), expect.closeTo(0.4, 12)],
    ]);

    // Peak levels 0.8, 0.7, 0.9 -> mean 0.8, spread 0.2.
    expect(summary.peakLevel).toMatchObject({
      mean: expect.closeTo(0.8, 12),
      min: expect.closeTo(0.7, 12),
      max: expect.closeTo(0.9, 12),
      spread: expect.closeTo(0.2, 12),
    });
    // Trough levels 0.2, 0.3, 0.4 -> mean 0.3, spread 0.2.
    expect(summary.troughLevel).toMatchObject({
      mean: expect.closeTo(0.3, 12),
      min: expect.closeTo(0.2, 12),
      max: expect.closeTo(0.4, 12),
      spread: expect.closeTo(0.2, 12),
    });
    // Sample SD of {0.7,0.8,0.9} is 0.1.
    expect(summary.peakLevel?.sampleStandardDeviation).toBeCloseTo(0.1, 12);

    expect(summary.greenestPeakYear).toMatchObject({
      year: 2023,
      ndvi: expect.closeTo(0.9, 12),
      month: { year: 2023, month: 6 },
    });
    expect(summary.leastGreenTroughYear).toMatchObject({
      year: 2021,
      ndvi: expect.closeTo(0.2, 12),
      month: { year: 2021, month: 1 },
    });
    expect(summary.source).toEqual(NDVI_SOURCE);
  });

  it("preserves a common level shift that amplitude would cancel", () => {
    // Both years share amplitude 0.5, but every level is 0.2 higher in 2022.
    const annuals = summarizeAnnualNdviPhenology(
      [...cycle(2021, 0.6, 0.1), ...cycle(2022, 0.8, 0.3)],
      LAT
    );

    const summary = summarizeNdviExtremumLevels(annuals);

    expect(summary.status).toBe("available");
    expect(summary.peakLevel?.spread).toBeCloseTo(0.2, 12);
    expect(summary.troughLevel?.spread).toBeCloseTo(0.2, 12);
    expect(summary.greenestPeakYear?.year).toBe(2022);
    expect(summary.leastGreenTroughYear?.year).toBe(2021);
  });

  it("resolves extremum-year ties to the earliest year", () => {
    const annuals = summarizeAnnualNdviPhenology(
      [
        ...cycle(2020, 0.9, 0.2),
        ...cycle(2021, 0.7, 0.2), // same trough as 2020
        ...cycle(2022, 0.9, 0.5), // same peak as 2020
      ],
      LAT
    );

    const summary = summarizeNdviExtremumLevels(annuals);

    // Peak 0.9 occurs in 2020 and 2022; earliest wins.
    expect(summary.greenestPeakYear?.year).toBe(2020);
    // Trough 0.2 occurs in 2020 and 2021; earliest wins.
    expect(summary.leastGreenTroughYear?.year).toBe(2020);
  });

  it("counts sparse / no-data years as unusable without inventing levels", () => {
    const annuals = summarizeAnnualNdviPhenology(
      [
        ...cycle(2021, 0.8, 0.2),
        // 2022 has only three months -> sparse -> no extrema.
        ...yearOf(2022, [
          [6, 0.7],
          [7, 0.6],
          [8, 0.5],
        ]),
        ...cycle(2023, 0.85, 0.25),
      ],
      LAT
    );

    const summary = summarizeNdviExtremumLevels(annuals);

    expect(summary.coverage).toMatchObject({
      suppliedYearCount: 3,
      usableYearCount: 2,
      unusableYearCount: 1,
    });
    expect(summary.years.map((y) => y.year)).toEqual([2021, 2023]);
    expect(summary.status).toBe("available");
  });

  it("reports insufficient-years with a single usable year", () => {
    const annuals = summarizeAnnualNdviPhenology(cycle(2021, 0.8, 0.2), LAT);

    const summary = summarizeNdviExtremumLevels(annuals);

    expect(summary).toMatchObject({
      status: "insufficient-years",
      peakLevel: null,
      troughLevel: null,
      greenestPeakYear: null,
      leastGreenTroughYear: null,
      reason: "insufficient-years",
    });
    expect(summary.coverage.usableYearCount).toBe(1);
  });

  it("reports insufficient-years for an empty record and defaults hemisphere", () => {
    const summary = summarizeNdviExtremumLevels([]);

    expect(summary.status).toBe("insufficient-years");
    expect(summary.hemisphere).toBe("unknown");
    expect(summary.source).toEqual(NDVI_SOURCE);
    expect(summary.coverage).toMatchObject({
      suppliedYearCount: 0,
      usableYearCount: 0,
      unusableYearCount: 0,
    });
  });
});
