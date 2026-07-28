import { describe, expect, it } from "vitest";
import {
  MINIMUM_YEARS_FOR_PEAK_TIMING,
  summarizePeakGreennessTiming,
} from "./phenologyPeakTiming";
import {
  NDVI_SOURCE,
  NDVI_UNIT,
  summarizeAnnualNdviPhenology,
  type NdviAnnualPhenology,
  type NdviMonthlyObservation,
} from "./phenology";

/** Build one annual summary from a peak month with a supporting six-month arc. */
function yearWithPeak(
  year: number,
  peakMonth: number,
  latitude: number
): NdviAnnualPhenology {
  const months = [0, 1, 2, 3, 4, 5].map((offset) => {
    const month = ((peakMonth - 3 + offset + 11) % 12) + 1;
    return {
      month: { year, month },
      ndvi: month === peakMonth ? 0.8 : 0.3,
      validFraction: 0.9,
    } satisfies NdviMonthlyObservation;
  });
  const [summary] = summarizeAnnualNdviPhenology(months, latitude);
  return summary;
}

describe("NDVI peak greenness timing", () => {
  it("reports a July circular mean and tight clustering for stable peaks", () => {
    const summaries = [2019, 2020, 2021, 2022].map((year) =>
      yearWithPeak(year, 7, 45)
    );

    const timing = summarizePeakGreennessTiming(summaries);

    expect(timing).toMatchObject({
      kind: "ndvi-peak-greenness-timing",
      status: "available",
      hemisphere: "northern",
      circularMeanMonth: 7,
      circularMeanSeason: "summer",
      meanResultantLength: 1,
      timingConcordance: "tightly-clustered",
      source: NDVI_SOURCE,
      unit: NDVI_UNIT,
    });
    expect(timing.dominantPeakMonth).toMatchObject({ month: 7, count: 4 });
    expect(timing.coverage).toMatchObject({
      contributingYearCount: 4,
      sparseYearCount: 0,
      invalidYearCount: 0,
      firstYear: 2019,
      lastYear: 2022,
    });
    expect(timing.peakMonthCounts).toEqual([
      { month: 7, meteorologicalSeason: "summer", count: 4 },
    ]);
  });

  it("averages December and January peaks to the winter turn, not summer", () => {
    const summaries = [
      yearWithPeak(2018, 12, 45),
      yearWithPeak(2019, 12, 45),
      yearWithPeak(2020, 12, 45),
      yearWithPeak(2021, 1, 45),
      yearWithPeak(2022, 1, 45),
    ];

    const timing = summarizePeakGreennessTiming(summaries);

    // A naive arithmetic mean of {12, 12, 12, 1, 1} would be 7.6 (August).
    expect(timing.circularMeanMonth).toBe(12);
    expect(timing.circularMeanSeason).toBe("winter");
    expect(timing.meanResultantLength).toBeGreaterThan(0.9);
    expect(timing.dominantPeakMonth).toMatchObject({ month: 12, count: 3 });
  });

  it("marks widely spread peaks as dispersed with a low resultant length", () => {
    const summaries = [
      yearWithPeak(2018, 1, 45),
      yearWithPeak(2019, 4, 45),
      yearWithPeak(2020, 7, 45),
      yearWithPeak(2021, 10, 45),
    ];

    const timing = summarizePeakGreennessTiming(summaries);

    expect(timing.status).toBe("available");
    expect(timing.meanResultantLength).toBeLessThan(0.01);
    expect(timing.timingConcordance).toBe("dispersed");
    // Antipodal peaks leave the mean direction undefined.
    expect(timing.circularMeanMonth).toBeNull();
    expect(timing.circularMeanSeason).toBe("not-assigned");
  });

  it("uses the southern-hemisphere calendar-season convention", () => {
    const summaries = [2019, 2020, 2021].map((year) =>
      yearWithPeak(year, 1, -30)
    );

    const timing = summarizePeakGreennessTiming(summaries);

    expect(timing.hemisphere).toBe("southern");
    expect(timing.circularMeanMonth).toBe(1);
    expect(timing.circularMeanSeason).toBe("summer");
    expect(timing.peakMonthCounts[0].meteorologicalSeason).toBe("summer");
  });

  it("counts sparse, invalid, and duplicate years without dropping them silently", () => {
    const sparse: NdviAnnualPhenology = {
      year: 2017,
      hemisphere: "northern",
      coverage: {
        suppliedCalendarMonths: [1, 2],
        omittedCalendarMonths: [3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
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
      yearWithPeak(2018, 7, 45),
      yearWithPeak(2019, 7, 45),
      { ...yearWithPeak(2019, 7, 45) }, // duplicate calendar year
      yearWithPeak(2020, 8, 45),
    ];

    const timing = summarizePeakGreennessTiming(summaries);

    expect(timing.coverage).toMatchObject({
      contributingYearCount: 3,
      sparseYearCount: 1,
      invalidYearCount: 1,
      firstYear: 2018,
      lastYear: 2020,
    });
    expect(timing.dominantPeakMonth).toMatchObject({ month: 7, count: 2 });
  });

  it("withholds a timing summary below the minimum-year floor", () => {
    const summaries = [yearWithPeak(2020, 7, 45), yearWithPeak(2021, 7, 45)];

    const timing = summarizePeakGreennessTiming(summaries);

    expect(summaries.length).toBeLessThan(MINIMUM_YEARS_FOR_PEAK_TIMING);
    expect(timing.status).toBe("insufficient-years");
    expect(timing.dominantPeakMonth).toBeNull();
    expect(timing.circularMeanMonth).toBeNull();
    expect(timing.meanResultantLength).toBeNull();
    expect(timing.timingConcordance).toBeNull();
    // The raw tally is still exposed for transparency.
    expect(timing.peakMonthCounts).toEqual([
      { month: 7, meteorologicalSeason: "summer", count: 2 },
    ]);
  });

  it("honors a caller-supplied minimum-year override", () => {
    const summaries = [2018, 2019, 2020, 2021, 2022].map((year) =>
      yearWithPeak(year, 6, 45)
    );

    expect(
      summarizePeakGreennessTiming(summaries, { minimumYears: 6 }).status
    ).toBe("insufficient-years");
    expect(
      summarizePeakGreennessTiming(summaries, { minimumYears: 5 }).status
    ).toBe("available");
  });
});
