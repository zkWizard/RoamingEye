import { describe, expect, it } from "vitest";
import {
  describePrecipitationSeasonalTimingSeries,
  MINIMUM_PRECIP_SEASONAL_TIMING_YEARS,
  PRECIP_SEASONAL_TIMING_SERIES_LIMITATIONS,
} from "./precipitationSeasonalTimingSeries";
import { SECONDS_PER_DAY } from "./precipitationAccumulation";
import type { MonthlyClimateObservation } from "./climate";
import type { YearMonth } from "./timeline";

/**
 * Build observations the way the probe bridge does: `years` calendar years of
 * per-calendar-month mm/day rates, converted back to the metric's native
 * kg/m²/s. `null` marks a month that carried no usable value.
 */
function observations(
  years: number,
  perMonthMmPerDay: readonly (number | null)[],
  startYear = 2000
): MonthlyClimateObservation[] {
  const built: MonthlyClimateObservation[] = [];
  for (let y = 0; y < years; y++) {
    for (let month = 1; month <= 12; month++) {
      const perDay = perMonthMmPerDay[month - 1];
      built.push({
        metricId: "precipitation-rate",
        dataMonth: { year: startYear + y, month },
        value: perDay === null ? null : perDay / SECONDS_PER_DAY,
      });
    }
  }
  return built;
}

/** The publication frontier implied by a `years`-long record from `startYear`. */
function through(years: number, startYear = 2000): YearMonth {
  return { year: startYear + years - 1, month: 12 };
}

/** A flat 1 mm/day year with one wet month: unambiguous, strongly peaked. */
const ONE_WET_MONTH = [1, 1, 1, 1, 1, 1, 10, 1, 1, 1, 1, 1];

/** Equal rate every month: no calendar month is preferred. */
const FLAT = [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1];

/**
 * Two equal rainy seasons half a year apart. The wettest calendar month is a
 * real observation, but the water does not sit anywhere on the calendar.
 */
const TWO_WET_SEASONS = [1, 1, 1, 10, 1, 1, 1, 1, 1, 10, 1, 1];

describe("describePrecipitationSeasonalTimingSeries", () => {
  it("centres the pooled timing on the month that carries the water", () => {
    const series = describePrecipitationSeasonalTimingSeries(
      observations(5, ONE_WET_MONTH),
      through(5)
    );
    expect(series).not.toBeNull();
    expect(series?.centroidMonthName).toBe("Jul");
    expect(series?.centroidCalendarMonth).toBe(7);
    expect(series?.yearsUsed).toBe(5);
    expect(series?.firstYear).toBe(2000);
    expect(series?.lastYear).toBe(2004);
    // Half the year's water lands in July, so the resultant is substantial but
    // nowhere near 1 — the other eleven months still pull in every direction.
    expect(series?.concentration).toBeGreaterThan(0.3);
    expect(series?.concentration).toBeLessThan(0.6);
  });

  it("reports a near-zero concentration when the water is spread evenly", () => {
    const series = describePrecipitationSeasonalTimingSeries(
      observations(5, FLAT),
      through(5)
    );
    expect(series).not.toBeNull();
    // A flat *rate* is not a flat *depth*: February carries three days less
    // water than January, so the resultant does not vanish exactly. It must
    // still be small enough to read as "no preferred timing".
    expect(series?.concentration).toBeLessThan(0.02);
  });

  it("collapses the concentration for two rainy seasons a half-year apart", () => {
    // The headline case for reporting R beside a wettest month: the annual
    // cycle names one of these two peaks, and R is what reveals that naming it
    // alone would hide the other.
    const series = describePrecipitationSeasonalTimingSeries(
      observations(5, TWO_WET_SEASONS),
      through(5)
    );
    expect(series).not.toBeNull();
    expect(series?.concentration).toBeLessThan(0.1);

    const peaked = describePrecipitationSeasonalTimingSeries(
      observations(5, ONE_WET_MONTH),
      through(5)
    );
    expect(series?.concentration).toBeLessThan(peaked?.concentration ?? 0);
  });

  it("weights each pooled year by the water it actually carried", () => {
    // One January-heavy year against four July-heavy years: the centroid must
    // land in July, not be dragged to the circular midpoint of the two.
    const januaryHeavy = observations(
      1,
      [10, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
      2000
    );
    const julyHeavy = observations(4, ONE_WET_MONTH, 2001);
    const series = describePrecipitationSeasonalTimingSeries(
      [...januaryHeavy, ...julyHeavy],
      through(5)
    );
    expect(series?.yearsUsed).toBe(5);
    expect(series?.centroidCalendarMonth).toBe(7);
  });

  it("drops an incomplete calendar year rather than folding it in", () => {
    const complete = observations(3, ONE_WET_MONTH, 2000);
    // A trailing half-year: real water, but it covers only Jan-Jun and would
    // drag the pooled centroid toward the months it happens to contain.
    const partial = observations(1, ONE_WET_MONTH, 2003).slice(0, 6);
    const series = describePrecipitationSeasonalTimingSeries(
      [...complete, ...partial],
      { year: 2003, month: 6 }
    );
    expect(series?.yearsUsed).toBe(3);
    expect(series?.lastYear).toBe(2002);
  });

  it("drops a year with a missing month", () => {
    const record = observations(4, ONE_WET_MONTH);
    // Blank out 2001-03: that year can no longer form an annual cycle.
    const gapped = record.map((observation) =>
      observation.dataMonth.year === 2001 && observation.dataMonth.month === 3
        ? { ...observation, value: null }
        : observation
    );
    const series = describePrecipitationSeasonalTimingSeries(
      gapped,
      through(4)
    );
    expect(series?.yearsUsed).toBe(3);
  });

  it("withholds a timing below the complete-calendar-year floor", () => {
    expect(
      describePrecipitationSeasonalTimingSeries(
        observations(MINIMUM_PRECIP_SEASONAL_TIMING_YEARS - 1, ONE_WET_MONTH),
        through(MINIMUM_PRECIP_SEASONAL_TIMING_YEARS - 1)
      )
    ).toBeNull();
    expect(
      describePrecipitationSeasonalTimingSeries(
        observations(MINIMUM_PRECIP_SEASONAL_TIMING_YEARS, ONE_WET_MONTH),
        through(MINIMUM_PRECIP_SEASONAL_TIMING_YEARS)
      )
    ).not.toBeNull();
  });

  it("honours an overridden year floor", () => {
    expect(
      describePrecipitationSeasonalTimingSeries(
        observations(2, ONE_WET_MONTH),
        through(2),
        { minimumYears: 2 }
      )?.yearsUsed
    ).toBe(2);
  });

  it("returns null for an empty record and for a non-precipitation metric", () => {
    expect(
      describePrecipitationSeasonalTimingSeries([], through(1))
    ).toBeNull();
    const wrongMetric = observations(5, ONE_WET_MONTH).map((observation) => ({
      ...observation,
      metricId: "soil-moisture" as const,
    }));
    expect(
      describePrecipitationSeasonalTimingSeries(wrongMetric, through(5))
    ).toBeNull();
  });

  it("excludes months the product has not published yet", () => {
    // The frontier sits mid-record, so the last two years are unpublished and
    // cannot be pooled.
    const series = describePrecipitationSeasonalTimingSeries(
      observations(5, ONE_WET_MONTH),
      { year: 2002, month: 12 }
    );
    expect(series?.yearsUsed).toBe(3);
    expect(series?.lastYear).toBe(2002);
  });

  it("rejects an invalid configuration rather than guessing", () => {
    const record = observations(5, ONE_WET_MONTH);
    expect(
      describePrecipitationSeasonalTimingSeries(record, through(5), {
        minimumYears: 0,
      })
    ).toBeNull();
    expect(
      describePrecipitationSeasonalTimingSeries(record, through(5), {
        minimumYears: 1.5,
      })
    ).toBeNull();
    expect(
      describePrecipitationSeasonalTimingSeries(record, through(5), {
        minimumValidFraction: 1.5,
      })
    ).toBeNull();
  });

  it("carries provenance and refuses to look like a forecast", () => {
    const series = describePrecipitationSeasonalTimingSeries(
      observations(5, ONE_WET_MONTH),
      through(5)
    );
    expect(series?.kind).toBe("derived-precip-seasonal-timing-series");
    expect(series?.isForecast).toBe(false);
    expect(series?.source.shortName).toBeTruthy();
    expect(series?.totalMm).toBeGreaterThan(0);
  });

  it("states its limits without claiming a diagnosis", () => {
    expect(PRECIP_SEASONAL_TIMING_SERIES_LIMITATIONS).toContain("Markham 1970");
    expect(PRECIP_SEASONAL_TIMING_SERIES_LIMITATIONS).toContain("not a");
    for (const forbidden of ["forecast", "drought index", "trend"]) {
      expect(PRECIP_SEASONAL_TIMING_SERIES_LIMITATIONS).toContain(forbidden);
    }
  });
});
