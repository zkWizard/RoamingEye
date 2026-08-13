import { describe, expect, it } from "vitest";
import { LAYERS, isAvailable } from "./timeline";
import {
  SNOW_COVER_DATASET,
  SNOW_COVER_EXTENT_BINS,
  SNOW_COVER_LIMITATIONS,
  SNOW_COVER_UNDISTRIBUTED_MONTHS,
  SNOW_SEASON_CHANGE_THRESHOLD_PP,
  classifySnowCoverExtent,
  describeSnowSeasonChange,
  isSnowCoverMonthDistributed,
  summarizeSnowCover,
  type SnowCoverObservation,
} from "./snowCover";

const AVAILABLE_THROUGH = { year: 2026, month: 1 };

function observation(
  overrides: Partial<SnowCoverObservation> = {}
): SnowCoverObservation {
  return {
    dataMonth: { year: 2025, month: 1 },
    snowCoveredPercent: 72,
    ...overrides,
  };
}

describe("snow-cover provenance", () => {
  it("cites the MOD10CM product from the timeline catalog", () => {
    expect(SNOW_COVER_DATASET).toBe(LAYERS.snow.dataset);
    expect(SNOW_COVER_DATASET.shortName).toBe("MOD10CM");
  });
});

describe("undistributed months", () => {
  // The six months between the seven ranges GIBS advertises for the snow layer
  // (WMTS GetCapabilities, verified 2026-08-11); each answers HTTP 404.
  it("records exactly the gaps between the advertised ranges", () => {
    expect(SNOW_COVER_UNDISTRIBUTED_MONTHS).toEqual([
      { year: 2000, month: 8 },
      { year: 2001, month: 6 },
      { year: 2002, month: 3 },
      { year: 2003, month: 12 },
      { year: 2016, month: 2 },
      { year: 2022, month: 10 },
    ]);
  });

  it("places every recorded gap inside the layer's own record", () => {
    const start = LAYERS.snow.start;
    for (const gap of SNOW_COVER_UNDISTRIBUTED_MONTHS) {
      // A gap outside the record would be described by `start`, not by this
      // catalog — the catalog asserts interior absences only.
      expect(gap.year * 12 + gap.month).toBeGreaterThan(
        start.year * 12 + start.month
      );
      expect(gap.month).toBeGreaterThanOrEqual(1);
      expect(gap.month).toBeLessThanOrEqual(12);
    }
  });

  it("treats months outside the recorded gaps as distributed", () => {
    expect(isSnowCoverMonthDistributed({ year: 2016, month: 2 })).toBe(false);
    expect(isSnowCoverMonthDistributed({ year: 2016, month: 1 })).toBe(true);
    expect(isSnowCoverMonthDistributed({ year: 2016, month: 3 })).toBe(true);
    // Same calendar month, a different year: never generalised across years.
    expect(isSnowCoverMonthDistributed({ year: 2017, month: 2 })).toBe(true);
  });

  it("agrees with the timeline catalog the scrubber enumerates from", () => {
    // Two catalogs record the same six months: this one, which explains a
    // month the summary layer must report as `not-distributed`, and
    // LAYERS.snow.unpublished, which keeps the scrubber from offering it at
    // all. timeline.ts restates them rather than importing this module so it
    // stays dependency-free, so pin the two together here — a gap fixed in
    // one place and not the other would put a 404 month back on the slider.
    expect(LAYERS.snow.unpublished).toEqual(SNOW_COVER_UNDISTRIBUTED_MONTHS);
    for (const month of SNOW_COVER_UNDISTRIBUTED_MONTHS) {
      expect(isSnowCoverMonthDistributed(month)).toBe(false);
      expect(isAvailable(LAYERS.snow, month)).toBe(false);
    }
  });
});

describe("classifySnowCoverExtent", () => {
  it("maps values to bins at their inclusive lower bounds", () => {
    expect(classifySnowCoverExtent(0)?.id).toBe("snow-free");
    expect(classifySnowCoverExtent(4.9)?.id).toBe("snow-free");
    expect(classifySnowCoverExtent(5)?.id).toBe("patchy");
    expect(classifySnowCoverExtent(25)?.id).toBe("broken");
    expect(classifySnowCoverExtent(50)?.id).toBe("extensive");
    expect(classifySnowCoverExtent(90)?.id).toBe("complete");
    expect(classifySnowCoverExtent(100)?.id).toBe("complete");
  });

  it("returns null for values outside the physical 0-100% range", () => {
    expect(classifySnowCoverExtent(-1)).toBeNull();
    expect(classifySnowCoverExtent(101)).toBeNull();
    expect(classifySnowCoverExtent(Number.NaN)).toBeNull();
    expect(classifySnowCoverExtent(Number.POSITIVE_INFINITY)).toBeNull();
  });

  it("keeps bins ordered high-to-low so the first satisfied bound wins", () => {
    const mins = SNOW_COVER_EXTENT_BINS.map((bin) => bin.minPercent);
    const sorted = [...mins].sort((a, b) => b - a);
    expect(mins).toEqual(sorted);
  });
});

describe("summarizeSnowCover", () => {
  it("describes a published, usable observation with its extent bin", () => {
    const summary = summarizeSnowCover(observation(), AVAILABLE_THROUGH);
    expect(summary.publicationStatus).toBe("published");
    expect(summary.publicationLagMonths).toBe(12);
    expect(summary.coverage.status).toBe("available");
    expect(summary.snowCoveredPercent).toBe(72);
    expect(summary.extentClass).toBe("extensive");
    expect(summary.extentLabel).toBe("Extensive snow cover");
    expect(summary.isForecast).toBe(false);
    expect(summary.sourceResolution).toContain("0.05°");
    expect(summary.limitations).toBe(SNOW_COVER_LIMITATIONS);
  });

  it("flags a not-yet-published future data month and withholds the value", () => {
    const summary = summarizeSnowCover(
      observation({ dataMonth: { year: 2026, month: 6 } }),
      AVAILABLE_THROUGH
    );
    expect(summary.publicationStatus).toBe("not-yet-published");
    expect(summary.publicationLagMonths).toBeNull();
    expect(summary.snowCoveredPercent).toBeNull();
    expect(summary.extentClass).toBeNull();
  });

  it("separates a month the service does not distribute from an observed absence", () => {
    // February 2016 falls between two of the seven ranges GIBS advertises for
    // MOD10CM; its tile answers 404 while January and March serve normally.
    const summary = summarizeSnowCover(
      observation({
        dataMonth: { year: 2016, month: 2 },
        snowCoveredPercent: null,
      }),
      AVAILABLE_THROUGH
    );
    expect(summary.publicationStatus).toBe("not-distributed");
    // Never published, so there is no publication lag to state.
    expect(summary.publicationLagMonths).toBeNull();
    expect(summary.snowCoveredPercent).toBeNull();
    expect(summary.extentClass).toBeNull();

    // The months either side of the gap are ordinary published months.
    for (const month of [1, 3]) {
      const neighbour = summarizeSnowCover(
        observation({ dataMonth: { year: 2016, month } }),
        AVAILABLE_THROUGH
      );
      expect(neighbour.publicationStatus).toBe("published");
      expect(neighbour.snowCoveredPercent).toBe(72);
    }
  });

  it("withholds a value supplied for an undistributed month rather than crediting it", () => {
    // A caller that hands over a value for a month the service does not serve
    // is mistaken about its provenance; the summary must not carry it through.
    const summary = summarizeSnowCover(
      observation({
        dataMonth: { year: 2022, month: 10 },
        snowCoveredPercent: 88,
      }),
      AVAILABLE_THROUGH
    );
    expect(summary.publicationStatus).toBe("not-distributed");
    expect(summary.snowCoveredPercent).toBeNull();
    expect(summary.extentLabel).toBeNull();
  });

  it("marks an invalid reference month", () => {
    const summary = summarizeSnowCover(
      observation({ dataMonth: { year: 2025, month: 13 } }),
      AVAILABLE_THROUGH
    );
    expect(summary.publicationStatus).toBe("invalid-reference-month");
    expect(summary.coverage.status).toBe("invalid");
    expect(summary.coverage.reason).toBe("invalid-month");
  });

  it("reports missing values and zero coverage as no-data", () => {
    const missing = summarizeSnowCover(
      observation({ snowCoveredPercent: null }),
      AVAILABLE_THROUGH
    );
    expect(missing.coverage.status).toBe("no-data");
    expect(missing.coverage.reason).toBe("missing-value");

    const zero = summarizeSnowCover(
      observation({ validFraction: 0 }),
      AVAILABLE_THROUGH
    );
    expect(zero.coverage.status).toBe("no-data");
    expect(zero.coverage.reason).toBe("zero-coverage");
    expect(zero.snowCoveredPercent).toBeNull();
  });

  it("rejects out-of-range percentages and coverage fractions", () => {
    const badValue = summarizeSnowCover(
      observation({ snowCoveredPercent: 140 }),
      AVAILABLE_THROUGH
    );
    expect(badValue.coverage.status).toBe("invalid");
    expect(badValue.coverage.reason).toBe("invalid-value");

    const badFraction = summarizeSnowCover(
      observation({ validFraction: 1.4 }),
      AVAILABLE_THROUGH
    );
    expect(badFraction.coverage.status).toBe("invalid");
    expect(badFraction.coverage.reason).toBe("invalid-coverage");
  });

  it("passes through a supplied valid coverage fraction", () => {
    const summary = summarizeSnowCover(
      observation({ validFraction: 0.8 }),
      AVAILABLE_THROUGH
    );
    expect(summary.coverage.status).toBe("available");
    expect(summary.coverage.validFraction).toBe(0.8);
  });
});

describe("describeSnowSeasonChange", () => {
  const availableThrough = { year: 2026, month: 1 };

  it("reports an advancing season across consecutive months", () => {
    const change = describeSnowSeasonChange(
      observation({
        dataMonth: { year: 2024, month: 10 },
        snowCoveredPercent: 30,
      }),
      observation({
        dataMonth: { year: 2024, month: 11 },
        snowCoveredPercent: 65,
      }),
      availableThrough
    );
    expect(change.status).toBe("available");
    expect(change.trend).toBe("advancing");
    expect(change.changePercentPoints).toBe(35);
    expect(change.isForecast).toBe(false);
  });

  it("reports a retreating season", () => {
    const change = describeSnowSeasonChange(
      observation({
        dataMonth: { year: 2025, month: 3 },
        snowCoveredPercent: 80,
      }),
      observation({
        dataMonth: { year: 2025, month: 4 },
        snowCoveredPercent: 40,
      }),
      availableThrough
    );
    expect(change.trend).toBe("retreating");
    expect(change.changePercentPoints).toBe(-40);
  });

  it("reports little-change inside the threshold band", () => {
    const change = describeSnowSeasonChange(
      observation({
        dataMonth: { year: 2025, month: 1 },
        snowCoveredPercent: 70,
      }),
      observation({
        dataMonth: { year: 2025, month: 2 },
        snowCoveredPercent: 73,
      }),
      availableThrough
    );
    expect(change.trend).toBe("little-change");
    expect(change.changePercentPoints).toBe(3);
    expect(change.thresholdPercentPoints).toBe(SNOW_SEASON_CHANGE_THRESHOLD_PP);
  });

  it("rejects non-consecutive months", () => {
    const change = describeSnowSeasonChange(
      observation({
        dataMonth: { year: 2025, month: 1 },
        snowCoveredPercent: 70,
      }),
      observation({
        dataMonth: { year: 2025, month: 3 },
        snowCoveredPercent: 40,
      }),
      availableThrough
    );
    expect(change.status).toBe("non-adjacent-months");
    expect(change.trend).toBeNull();
    expect(change.changePercentPoints).toBeNull();
    expect(change.reason).toBe("months-not-consecutive");
  });

  it("crosses a year boundary as one consecutive month", () => {
    const change = describeSnowSeasonChange(
      observation({
        dataMonth: { year: 2024, month: 12 },
        snowCoveredPercent: 55,
      }),
      observation({
        dataMonth: { year: 2025, month: 1 },
        snowCoveredPercent: 88,
      }),
      availableThrough
    );
    expect(change.status).toBe("available");
    expect(change.trend).toBe("advancing");
  });

  it("is unavailable when either endpoint has no usable value", () => {
    const change = describeSnowSeasonChange(
      observation({
        dataMonth: { year: 2025, month: 1 },
        snowCoveredPercent: null,
      }),
      observation({
        dataMonth: { year: 2025, month: 2 },
        snowCoveredPercent: 60,
      }),
      availableThrough
    );
    expect(change.status).toBe("unavailable");
    expect(change.reason).toBe("endpoint-not-available");
    expect(change.trend).toBeNull();
  });

  it("does not treat an unpublished later month as usable", () => {
    const change = describeSnowSeasonChange(
      observation({
        dataMonth: { year: 2026, month: 1 },
        snowCoveredPercent: 60,
      }),
      observation({
        dataMonth: { year: 2026, month: 2 },
        snowCoveredPercent: 80,
      }),
      availableThrough
    );
    expect(change.status).toBe("unavailable");
    expect(change.reason).toBe("endpoint-not-available");
    expect(change.later.publicationStatus).toBe("not-yet-published");
  });

  it("honors a custom threshold band", () => {
    const change = describeSnowSeasonChange(
      observation({
        dataMonth: { year: 2025, month: 1 },
        snowCoveredPercent: 60,
      }),
      observation({
        dataMonth: { year: 2025, month: 2 },
        snowCoveredPercent: 68,
      }),
      availableThrough,
      { thresholdPercentPoints: 10 }
    );
    expect(change.trend).toBe("little-change");
    expect(change.thresholdPercentPoints).toBe(10);
  });

  it("rejects an invalid threshold", () => {
    const change = describeSnowSeasonChange(
      observation({
        dataMonth: { year: 2025, month: 1 },
        snowCoveredPercent: 60,
      }),
      observation({
        dataMonth: { year: 2025, month: 2 },
        snowCoveredPercent: 80,
      }),
      availableThrough,
      { thresholdPercentPoints: -3 }
    );
    expect(change.status).toBe("unavailable");
    expect(change.reason).toBe("invalid-threshold");
    expect(change.thresholdPercentPoints).toBe(SNOW_SEASON_CHANGE_THRESHOLD_PP);
  });
});
