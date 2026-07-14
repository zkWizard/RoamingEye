import { describe, expect, it } from "vitest";
import {
  NDVI_SOURCE,
  NDVI_UNIT,
  summarizeAnnualNdviPhenology,
  type NdviMonthlyObservation,
} from "./phenology";
import {
  MINIMUM_YEARS_FOR_AMPLITUDE_SUMMARY,
  summarizeNdviSeasonalAmplitude,
} from "./phenologyAmplitude";

/** Build one year of month/ndvi pairs at a fixed latitude and year. */
function yearOf(
  year: number,
  months: readonly (readonly [number, number])[]
): NdviMonthlyObservation[] {
  return months.map(([month, ndvi]) => ({ month: { year, month }, ndvi }));
}

/** A full northern-hemisphere seasonal cycle with a chosen peak amplitude. */
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

describe("summarizeNdviSeasonalAmplitude", () => {
  it("summarizes the interannual amplitude distribution across usable years", () => {
    const annuals = summarizeAnnualNdviPhenology(
      [
        ...cycle(2021, 0.8, 0.2), // amplitude 0.6
        ...cycle(2022, 0.7, 0.3), // amplitude 0.4
        ...cycle(2023, 0.9, 0.4), // amplitude 0.5
      ],
      LAT
    );

    const summary = summarizeNdviSeasonalAmplitude(annuals);

    expect(summary).toMatchObject({
      kind: "observed-ndvi-seasonal-amplitude",
      isForecast: false,
      hemisphere: "northern",
      status: "available",
      requiredYearCount: MINIMUM_YEARS_FOR_AMPLITUDE_SUMMARY,
      coverage: {
        suppliedYearCount: 3,
        usableYearCount: 3,
        unusableYearCount: 0,
      },
      unit: NDVI_UNIT,
      reason: null,
    });
    expect(summary.years.map((y) => [y.year, y.amplitude])).toEqual([
      [2021, expect.closeTo(0.6, 12)],
      [2022, expect.closeTo(0.4, 12)],
      [2023, expect.closeTo(0.5, 12)],
    ]);
    expect(summary.statistics?.mean).toBeCloseTo(0.5, 12);
    expect(summary.statistics?.min).toBeCloseTo(0.4, 12);
    expect(summary.statistics?.max).toBeCloseTo(0.6, 12);
    expect(summary.statistics?.spread).toBeCloseTo(0.2, 12);
    // Sample (n-1) standard deviation of {0.6, 0.4, 0.5} is exactly 0.1.
    expect(summary.statistics?.sampleStandardDeviation).toBeCloseTo(0.1, 12);
    expect(summary.smallestAmplitudeYear?.year).toBe(2022);
    expect(summary.largestAmplitudeYear?.year).toBe(2021);
  });

  it("carries the peak and trough months of each usable year through unchanged", () => {
    const annuals = summarizeAnnualNdviPhenology(
      [...cycle(2021, 0.8, 0.2), ...cycle(2022, 0.7, 0.3)],
      LAT
    );

    const summary = summarizeNdviSeasonalAmplitude(annuals);

    expect(summary.largestAmplitudeYear).toMatchObject({
      year: 2021,
      peakMonth: { year: 2021, month: 6 },
      troughMonth: { year: 2021, month: 1 },
    });
  });

  it("preserves NASA MOD13A3 provenance and never drops the dataset reference", () => {
    const annuals = summarizeAnnualNdviPhenology(
      [...cycle(2021, 0.8, 0.2), ...cycle(2022, 0.7, 0.3)],
      LAT
    );

    expect(summarizeNdviSeasonalAmplitude(annuals).source).toBe(NDVI_SOURCE);
  });

  it("ignores sparse years and only aggregates years with an observed range", () => {
    const annuals = summarizeAnnualNdviPhenology(
      [
        ...cycle(2021, 0.8, 0.2),
        ...cycle(2022, 0.7, 0.3),
        // 2023 has fewer than the annual-extrema threshold of valid months.
        ...yearOf(2023, [
          [5, 0.4],
          [6, 0.7],
          [7, 0.5],
        ]),
      ],
      LAT
    );

    const summary = summarizeNdviSeasonalAmplitude(annuals);

    expect(summary.coverage).toMatchObject({
      suppliedYearCount: 3,
      usableYearCount: 2,
      unusableYearCount: 1,
    });
    expect(summary.years.map((y) => y.year)).toEqual([2021, 2022]);
    expect(summary.status).toBe("available");
  });

  it("reports insufficient-years when fewer than two usable years remain", () => {
    const annuals = summarizeAnnualNdviPhenology(cycle(2021, 0.8, 0.2), LAT);

    const summary = summarizeNdviSeasonalAmplitude(annuals);

    expect(summary.status).toBe("insufficient-years");
    expect(summary.statistics).toBeNull();
    expect(summary.smallestAmplitudeYear).toBeNull();
    expect(summary.largestAmplitudeYear).toBeNull();
    expect(summary.reason).toBe("insufficient-years");
    // The single usable year is still surfaced for transparency.
    expect(summary.years.map((y) => y.year)).toEqual([2021]);
    expect(summary.coverage.usableYearCount).toBe(1);
  });

  it("resolves amplitude ties to the earliest year for both extremes", () => {
    const annuals = summarizeAnnualNdviPhenology(
      [
        ...cycle(2021, 0.8, 0.3), // amplitude 0.5
        ...cycle(2022, 0.9, 0.4), // amplitude 0.5 (tie)
        ...cycle(2023, 0.85, 0.35), // amplitude 0.5 (tie)
      ],
      LAT
    );

    const summary = summarizeNdviSeasonalAmplitude(annuals);

    expect(summary.smallestAmplitudeYear?.year).toBe(2021);
    expect(summary.largestAmplitudeYear?.year).toBe(2021);
    expect(summary.statistics?.spread).toBeCloseTo(0, 12);
  });

  it("returns an honest empty summary for no supplied years", () => {
    const summary = summarizeNdviSeasonalAmplitude([]);

    expect(summary.status).toBe("insufficient-years");
    expect(summary.hemisphere).toBe("unknown");
    expect(summary.coverage).toMatchObject({
      suppliedYearCount: 0,
      usableYearCount: 0,
      unusableYearCount: 0,
    });
    expect(summary.years).toEqual([]);
    expect(summary.statistics).toBeNull();
    // Provenance is still present even with no data.
    expect(summary.source).toBe(NDVI_SOURCE);
  });

  it("keeps the equatorial hemisphere without inventing seasonal labels", () => {
    const annuals = summarizeAnnualNdviPhenology(
      [...cycle(2021, 0.6, 0.2), ...cycle(2022, 0.55, 0.25)],
      0
    );

    const summary = summarizeNdviSeasonalAmplitude(annuals);

    expect(summary.hemisphere).toBe("equatorial");
    expect(summary.status).toBe("available");
  });
});
