import { describe, expect, it } from "vitest";
import { CLIMATE_METRICS, summarizeMonthlyClimate } from "./climate";
import {
  PRECIP_ACCUMULATION_LIMITATIONS,
  SECONDS_PER_DAY,
  precipitationAccumulation,
} from "./precipitationAccumulation";
import type { YearMonth } from "./timeline";

/** Build a published, usable precipitation-rate summary at a chosen month. */
function precipSummary(rate: number | null, dataMonth: YearMonth) {
  return summarizeMonthlyClimate(
    { metricId: "precipitation-rate", dataMonth, value: rate },
    { year: dataMonth.year + 1, month: dataMonth.month }
  );
}

describe("precipitation monthly accumulation", () => {
  it("integrates the monthly-mean rate over the month's actual length", () => {
    // 0.0001 kg/m²/s over a 31-day January.
    const result = precipitationAccumulation(
      precipSummary(0.0001, { year: 2026, month: 1 })
    );

    expect(result).not.toBeNull();
    expect(result).toMatchObject({
      kind: "derived-monthly-precip-accumulation",
      isForecast: false,
      dataMonth: { year: 2026, month: 1 },
      monthDays: 31,
      monthSeconds: 31 * SECONDS_PER_DAY,
    });
    expect(result?.totalMm).toBeCloseTo(0.0001 * 31 * SECONDS_PER_DAY, 9);
  });

  it("preserves the cited precipitation dataset provenance", () => {
    const result = precipitationAccumulation(
      precipSummary(0.00005, { year: 2026, month: 6 })
    );

    expect(result?.source).toBe(CLIMATE_METRICS["precipitation-rate"].source);
  });

  it("honours leap Februaries when integrating (29 vs 28 days)", () => {
    const leap = precipitationAccumulation(
      precipSummary(0.0002, { year: 2024, month: 2 })
    );
    const common = precipitationAccumulation(
      precipSummary(0.0002, { year: 2026, month: 2 })
    );

    expect(leap?.monthDays).toBe(29);
    expect(common?.monthDays).toBe(28);
    expect(leap?.totalMm).toBeCloseTo(0.0002 * 29 * SECONDS_PER_DAY, 9);
    expect(common?.totalMm).toBeCloseTo(0.0002 * 28 * SECONDS_PER_DAY, 9);
  });

  it("treats a genuine zero rate as a real zero total, not a null", () => {
    const result = precipitationAccumulation(
      precipSummary(0, { year: 2026, month: 4 })
    );

    expect(result?.totalMm).toBe(0);
    expect(result?.monthDays).toBe(30);
  });

  it("returns null for metrics outside the precipitation domain", () => {
    const soil = summarizeMonthlyClimate(
      {
        metricId: "soil-moisture",
        dataMonth: { year: 2026, month: 1 },
        value: 7.2,
      },
      { year: 2026, month: 5 }
    );
    const air = summarizeMonthlyClimate(
      {
        metricId: "air-temperature-2m",
        dataMonth: { year: 2026, month: 1 },
        value: 289.4,
      },
      { year: 2026, month: 5 }
    );

    expect(precipitationAccumulation(soil)).toBeNull();
    expect(precipitationAccumulation(air)).toBeNull();
  });

  it("withholds a total for a not-yet-published month", () => {
    const future = summarizeMonthlyClimate(
      {
        metricId: "precipitation-rate",
        dataMonth: { year: 2026, month: 8 },
        value: 0.0001,
      },
      { year: 2026, month: 5 }
    );

    expect(future.publicationStatus).toBe("not-yet-published");
    expect(precipitationAccumulation(future)).toBeNull();
  });

  it("withholds a total when coverage is absent or invalid", () => {
    const noData = summarizeMonthlyClimate(
      {
        metricId: "precipitation-rate",
        dataMonth: { year: 2026, month: 1 },
        value: null,
      },
      { year: 2026, month: 5 }
    );
    const zeroCoverage = summarizeMonthlyClimate(
      {
        metricId: "precipitation-rate",
        dataMonth: { year: 2026, month: 1 },
        value: 0.0001,
        validFraction: 0,
      },
      { year: 2026, month: 5 }
    );

    expect(precipitationAccumulation(noData)).toBeNull();
    expect(precipitationAccumulation(zeroCoverage)).toBeNull();
  });

  it("documents that the total is a re-expression, not an inference", () => {
    expect(PRECIP_ACCUMULATION_LIMITATIONS).toMatch(/monthly-mean/i);
    expect(PRECIP_ACCUMULATION_LIMITATIONS).toMatch(/not a .*forecast/i);
  });
});
