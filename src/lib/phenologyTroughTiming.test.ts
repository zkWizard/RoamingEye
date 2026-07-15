import { describe, expect, it } from "vitest";
import {
  MINIMUM_YEARS_FOR_TROUGH_TIMING,
  WEAK_TROUGH_LOCALIZATION_RANGE,
  summarizeTroughGreennessTiming,
} from "./phenologyTroughTiming";
import {
  NDVI_SOURCE,
  NDVI_UNIT,
  summarizeAnnualNdviPhenology,
  type NdviAnnualPhenology,
  type NdviMonthlyObservation,
} from "./phenology";

/**
 * Build one annual summary whose trough lands in `troughMonth`. A six-month arc
 * centered on the trough carries a low value at the trough month and a higher
 * plateau elsewhere; `amplitude` sets the peak-minus-trough range so tests can
 * exercise the weak-localization flag.
 */
function yearWithTrough(
  year: number,
  troughMonth: number,
  latitude: number,
  amplitude = 0.4
): NdviAnnualPhenology {
  const low = 0.2;
  const months = [0, 1, 2, 3, 4, 5].map((offset) => {
    const month = ((troughMonth - 3 + offset + 11) % 12) + 1;
    return {
      month: { year, month },
      ndvi: month === troughMonth ? low : low + amplitude,
      validFraction: 0.9,
    } satisfies NdviMonthlyObservation;
  });
  const [summary] = summarizeAnnualNdviPhenology(months, latitude);
  return summary;
}

describe("NDVI trough greenness timing", () => {
  it("reports a January circular mean and tight clustering for stable troughs", () => {
    const summaries = [2019, 2020, 2021, 2022].map((year) =>
      yearWithTrough(year, 1, 45)
    );

    const timing = summarizeTroughGreennessTiming(summaries);

    expect(timing).toMatchObject({
      kind: "ndvi-trough-greenness-timing",
      isForecast: false,
      status: "available",
      hemisphere: "northern",
      circularMeanMonth: 1,
      circularMeanSeason: "winter",
      meanResultantLength: 1,
      timingConcordance: "tightly-clustered",
      source: NDVI_SOURCE,
      unit: NDVI_UNIT,
    });
    expect(timing.dominantTroughMonth).toMatchObject({ month: 1, count: 4 });
    expect(timing.coverage).toMatchObject({
      contributingYearCount: 4,
      sparseYearCount: 0,
      invalidYearCount: 0,
      weaklyLocalizedYearCount: 0,
      firstYear: 2019,
      lastYear: 2022,
    });
    expect(timing.troughMonthCounts).toEqual([
      { month: 1, meteorologicalSeason: "winter", count: 4 },
    ]);
  });

  it("averages December and January troughs to the winter turn, not summer", () => {
    const summaries = [
      yearWithTrough(2018, 12, 45),
      yearWithTrough(2019, 12, 45),
      yearWithTrough(2020, 12, 45),
      yearWithTrough(2021, 1, 45),
      yearWithTrough(2022, 1, 45),
    ];

    const timing = summarizeTroughGreennessTiming(summaries);

    // A naive arithmetic mean of {12, 12, 12, 1, 1} would be 7.6 (August).
    expect(timing.circularMeanMonth).toBe(12);
    expect(timing.circularMeanSeason).toBe("winter");
    expect(timing.meanResultantLength).toBeGreaterThan(0.9);
    expect(timing.dominantTroughMonth).toMatchObject({ month: 12, count: 3 });
  });

  it("marks widely spread troughs as dispersed with a low resultant length", () => {
    const summaries = [
      yearWithTrough(2018, 1, 45),
      yearWithTrough(2019, 4, 45),
      yearWithTrough(2020, 7, 45),
      yearWithTrough(2021, 10, 45),
    ];

    const timing = summarizeTroughGreennessTiming(summaries);

    expect(timing.status).toBe("available");
    expect(timing.meanResultantLength).toBeLessThan(0.01);
    expect(timing.timingConcordance).toBe("dispersed");
    // Antipodal troughs leave the mean direction undefined.
    expect(timing.circularMeanMonth).toBeNull();
    expect(timing.circularMeanSeason).toBe("not-assigned");
  });

  it("uses the southern-hemisphere calendar-season convention", () => {
    const summaries = [2019, 2020, 2021].map((year) =>
      yearWithTrough(year, 7, -30)
    );

    const timing = summarizeTroughGreennessTiming(summaries);

    expect(timing.hemisphere).toBe("southern");
    expect(timing.circularMeanMonth).toBe(7);
    // July is the southern-hemisphere winter.
    expect(timing.circularMeanSeason).toBe("winter");
    expect(timing.troughMonthCounts[0].meteorologicalSeason).toBe("winter");
  });

  it("flags weakly localized troughs from near-flat years without excluding them", () => {
    const flat = WEAK_TROUGH_LOCALIZATION_RANGE / 2;
    const summaries = [
      yearWithTrough(2019, 2, 45, flat),
      yearWithTrough(2020, 2, 45, flat),
      yearWithTrough(2021, 2, 45), // well-defined (default amplitude 0.4)
    ];

    const timing = summarizeTroughGreennessTiming(summaries);

    expect(timing.status).toBe("available");
    // All three still contribute to the circular statistic.
    expect(timing.coverage.contributingYearCount).toBe(3);
    expect(timing.coverage.weaklyLocalizedYearCount).toBe(2);
    expect(timing.circularMeanMonth).toBe(2);
  });

  it("counts sparse, invalid, and duplicate years without dropping them silently", () => {
    const sparse: NdviAnnualPhenology = {
      year: 2017,
      hemisphere: "northern",
      coverage: {
        validMonthCount: 2,
        missingMonthCount: 0,
        invalidRecordCount: 0,
        minimumValidFraction: 0.9,
        isSparse: true,
      },
      peak: null,
      trough: null,
      seasonalRange: null,
      source: NDVI_SOURCE,
      unit: NDVI_UNIT,
    };
    const summaries: NdviAnnualPhenology[] = [
      sparse,
      yearWithTrough(2018, 1, 45),
      yearWithTrough(2019, 1, 45),
      { ...yearWithTrough(2019, 1, 45) }, // duplicate calendar year
      yearWithTrough(2020, 2, 45),
    ];

    const timing = summarizeTroughGreennessTiming(summaries);

    expect(timing.coverage).toMatchObject({
      contributingYearCount: 3,
      sparseYearCount: 1,
      invalidYearCount: 1,
      firstYear: 2018,
      lastYear: 2020,
    });
    expect(timing.dominantTroughMonth).toMatchObject({ month: 1, count: 2 });
  });

  it("withholds a timing summary below the minimum-year floor", () => {
    const summaries = [
      yearWithTrough(2020, 1, 45),
      yearWithTrough(2021, 1, 45),
    ];

    const timing = summarizeTroughGreennessTiming(summaries);

    expect(summaries.length).toBeLessThan(MINIMUM_YEARS_FOR_TROUGH_TIMING);
    expect(timing.status).toBe("insufficient-years");
    expect(timing.dominantTroughMonth).toBeNull();
    expect(timing.circularMeanMonth).toBeNull();
    expect(timing.meanResultantLength).toBeNull();
    expect(timing.timingConcordance).toBeNull();
    // The raw tally is still exposed for transparency.
    expect(timing.troughMonthCounts).toEqual([
      { month: 1, meteorologicalSeason: "winter", count: 2 },
    ]);
  });

  it("honors a caller-supplied minimum-year override", () => {
    const summaries = [2018, 2019, 2020, 2021, 2022].map((year) =>
      yearWithTrough(year, 6, 45)
    );

    expect(
      summarizeTroughGreennessTiming(summaries, { minimumYears: 6 }).status
    ).toBe("insufficient-years");
    expect(
      summarizeTroughGreennessTiming(summaries, { minimumYears: 5 }).status
    ).toBe("available");
  });
});
