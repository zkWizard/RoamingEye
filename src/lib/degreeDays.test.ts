import { describe, expect, it } from "vitest";
import { CLIMATE_METRICS, summarizeMonthlyClimate } from "./climate";
import {
  DEFAULT_DEGREE_DAY_BASE_C,
  DEGREE_DAYS_LIMITATIONS,
  KELVIN_TO_CELSIUS_OFFSET,
  monthlyDegreeDays,
} from "./degreeDays";
import type { YearMonth } from "./timeline";

/** Build a published, usable 2 m air-temperature summary at a chosen month. */
function airTempSummary(kelvin: number | null, dataMonth: YearMonth) {
  return summarizeMonthlyClimate(
    { metricId: "air-temperature-2m", dataMonth, value: kelvin },
    { year: dataMonth.year + 1, month: dataMonth.month }
  );
}

/** Convert a Celsius temperature to the native kelvin the summary carries. */
function celsiusToKelvin(celsius: number): number {
  return celsius + KELVIN_TO_CELSIUS_OFFSET;
}

describe("monthly degree-days", () => {
  it("scales a below-base mean into heating degree-days over the month", () => {
    // 8 °C monthly mean, 10 °C below the 18 °C base, over a 31-day January.
    const result = monthlyDegreeDays(
      airTempSummary(celsiusToKelvin(8), { year: 2026, month: 1 })
    );

    expect(result).not.toBeNull();
    expect(result).toMatchObject({
      kind: "derived-monthly-degree-days",
      isForecast: false,
      baseC: DEFAULT_DEGREE_DAY_BASE_C,
      dataMonth: { year: 2026, month: 1 },
      monthDays: 31,
    });
    expect(result?.meanTemperatureC).toBeCloseTo(8, 9);
    expect(result?.heatingDegreeDays).toBeCloseTo(31 * (18 - 8), 9);
    // A below-base month contributes no cooling demand.
    expect(result?.coolingDegreeDays).toBe(0);
  });

  it("scales an above-base mean into cooling degree-days over the month", () => {
    // 26 °C monthly mean, 8 °C above the base, over a 31-day July.
    const result = monthlyDegreeDays(
      airTempSummary(celsiusToKelvin(26), { year: 2026, month: 7 })
    );

    expect(result?.coolingDegreeDays).toBeCloseTo(31 * (26 - 18), 9);
    expect(result?.heatingDegreeDays).toBe(0);
  });

  it("yields zero of both totals when the mean sits exactly on the base", () => {
    const result = monthlyDegreeDays(
      airTempSummary(celsiusToKelvin(18), { year: 2026, month: 4 })
    );

    expect(result?.heatingDegreeDays).toBe(0);
    expect(result?.coolingDegreeDays).toBe(0);
  });

  it("honours a caller-supplied base temperature", () => {
    // 12 °C mean against a US 18.3 °C base over a 30-day September.
    const result = monthlyDegreeDays(
      airTempSummary(celsiusToKelvin(12), { year: 2026, month: 9 }),
      { baseC: 18.3 }
    );

    expect(result?.baseC).toBe(18.3);
    expect(result?.heatingDegreeDays).toBeCloseTo(30 * (18.3 - 12), 9);
  });

  it("honours leap Februaries when scaling the mean deficit (29 vs 28 days)", () => {
    const leap = monthlyDegreeDays(
      airTempSummary(celsiusToKelvin(0), { year: 2024, month: 2 })
    );
    const common = monthlyDegreeDays(
      airTempSummary(celsiusToKelvin(0), { year: 2026, month: 2 })
    );

    expect(leap?.monthDays).toBe(29);
    expect(common?.monthDays).toBe(28);
    expect(leap?.heatingDegreeDays).toBeCloseTo(29 * 18, 9);
    expect(common?.heatingDegreeDays).toBeCloseTo(28 * 18, 9);
  });

  it("preserves the cited air-temperature dataset provenance", () => {
    const result = monthlyDegreeDays(
      airTempSummary(celsiusToKelvin(5), { year: 2026, month: 11 })
    );

    expect(result?.source).toBe(CLIMATE_METRICS["air-temperature-2m"].source);
  });

  it("returns null for metrics outside the air-temperature domain", () => {
    const precip = summarizeMonthlyClimate(
      {
        metricId: "precipitation-rate",
        dataMonth: { year: 2026, month: 1 },
        value: 0.0001,
      },
      { year: 2026, month: 5 }
    );
    const soil = summarizeMonthlyClimate(
      {
        metricId: "soil-moisture",
        dataMonth: { year: 2026, month: 1 },
        value: 7.2,
      },
      { year: 2026, month: 5 }
    );

    expect(monthlyDegreeDays(precip)).toBeNull();
    expect(monthlyDegreeDays(soil)).toBeNull();
  });

  it("withholds totals for a not-yet-published month", () => {
    const future = summarizeMonthlyClimate(
      {
        metricId: "air-temperature-2m",
        dataMonth: { year: 2026, month: 8 },
        value: celsiusToKelvin(20),
      },
      { year: 2026, month: 5 }
    );

    expect(future.publicationStatus).toBe("not-yet-published");
    expect(monthlyDegreeDays(future)).toBeNull();
  });

  it("withholds totals when coverage is absent or invalid", () => {
    const noData = summarizeMonthlyClimate(
      {
        metricId: "air-temperature-2m",
        dataMonth: { year: 2026, month: 1 },
        value: null,
      },
      { year: 2026, month: 5 }
    );
    const zeroCoverage = summarizeMonthlyClimate(
      {
        metricId: "air-temperature-2m",
        dataMonth: { year: 2026, month: 1 },
        value: celsiusToKelvin(5),
        validFraction: 0,
      },
      { year: 2026, month: 5 }
    );

    expect(monthlyDegreeDays(noData)).toBeNull();
    expect(monthlyDegreeDays(zeroCoverage)).toBeNull();
  });

  it("withholds totals for a non-finite base temperature", () => {
    const result = monthlyDegreeDays(
      airTempSummary(celsiusToKelvin(5), { year: 2026, month: 1 }),
      { baseC: Number.NaN }
    );

    expect(result).toBeNull();
  });

  it("underestimates true degree-days for a base-straddling month (Jensen)", () => {
    // Two days at 8 °C and 28 °C average to an 18 °C monthly mean sitting on
    // the base, so the monthly-mean method reports zero heating AND zero
    // cooling. The true daily-integrated sums are strictly positive, which is
    // exactly the convex-clipping underestimate the limitations warn about.
    const meanOnBase = monthlyDegreeDays(
      airTempSummary(celsiusToKelvin(18), { year: 2026, month: 6 })
    );
    expect(meanOnBase?.heatingDegreeDays).toBe(0);
    expect(meanOnBase?.coolingDegreeDays).toBe(0);

    const trueHdd = Math.max(0, 18 - 8) + Math.max(0, 18 - 28);
    const trueCdd = Math.max(0, 8 - 18) + Math.max(0, 28 - 18);
    expect(trueHdd).toBeGreaterThan(0);
    expect(trueCdd).toBeGreaterThan(0);
  });

  it("documents the monthly-mean approximation and its downward bias", () => {
    expect(DEGREE_DAYS_LIMITATIONS).toMatch(/monthly-mean/i);
    expect(DEGREE_DAYS_LIMITATIONS).toMatch(/underestimate/i);
    expect(DEGREE_DAYS_LIMITATIONS).toMatch(/not a .*forecast/i);
  });
});
