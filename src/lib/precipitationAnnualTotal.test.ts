import { describe, expect, it } from "vitest";
import { CLIMATE_METRICS, summarizeMonthlyClimate } from "./climate";
import {
  PRECIPITATION_ANNUAL_TOTAL_LIMITATIONS,
  precipitationAnnualTotal,
} from "./precipitationAnnualTotal";
import type { DatasetRef, YearMonth } from "./timeline";

function monthlySummary(
  dataMonth: YearMonth,
  value: number | null = 0.0001,
  validFraction?: number
) {
  return summarizeMonthlyClimate(
    {
      metricId: "precipitation-rate",
      dataMonth,
      value,
      validFraction,
      sourceImageDimensions: { width: 2048, height: 1024 },
    },
    { year: dataMonth.year + 1, month: dataMonth.month }
  );
}

function completeYear(year: number) {
  return Array.from({ length: 12 }, (_, index) =>
    monthlySummary({ year, month: index + 1 }, (index + 1) / 100_000)
  );
}

describe("annual precipitation total", () => {
  it("sums all twelve calendar months and retains month-specific coverage", () => {
    const summaries = completeYear(2024);
    const result = precipitationAnnualTotal([...summaries].reverse(), 2024);

    expect(result).toMatchObject({
      kind: "derived-annual-precipitation-total",
      isForecast: false,
      dataYear: 2024,
      yearDays: 366,
      inputNativeUnit: "kg/m²/s",
      source: CLIMATE_METRICS["precipitation-rate"].source,
    });
    expect(result?.monthlyCoverage).toHaveLength(12);
    expect(result?.monthlyCoverage[0]).toEqual({
      dataMonth: { year: 2024, month: 1 },
      validFraction: null,
      sourceImageDimensions: { width: 2048, height: 1024 },
    });
    expect(result?.monthlyCoverage[11]?.dataMonth).toEqual({
      year: 2024,
      month: 12,
    });
    expect(result?.totalMm).toBeCloseTo(
      summaries.reduce((sum, summary) => {
        const days = new Date(
          Date.UTC(summary.dataMonth.year, summary.dataMonth.month, 0)
        ).getUTCDate();
        return sum + (summary.observedValue ?? 0) * days * 86_400;
      }, 0),
      9
    );
  });

  it("preserves explicitly supplied partial spatial coverage instead of aggregating it", () => {
    const summaries = completeYear(2025);
    summaries[3] = monthlySummary({ year: 2025, month: 4 }, 0.0001, 0.6);

    const result = precipitationAnnualTotal(summaries, 2025);

    expect(result?.monthlyCoverage[3]?.validFraction).toBe(0.6);
    expect(result?.source).toBe(CLIMATE_METRICS["precipitation-rate"].source);
  });

  it("withholds a total for missing, duplicate, or out-of-year months", () => {
    const complete = completeYear(2026);
    const missing = complete.filter((summary) => summary.dataMonth.month !== 6);
    const duplicate = [...complete.slice(0, 11), complete[0]];
    const wrongYear = [...complete];
    wrongYear[11] = monthlySummary({ year: 2025, month: 12 });

    expect(precipitationAnnualTotal(missing, 2026)).toBeNull();
    expect(precipitationAnnualTotal(duplicate, 2026)).toBeNull();
    expect(precipitationAnnualTotal(wrongYear, 2026)).toBeNull();
  });

  it("withholds a total for unpublished or unusable source months", () => {
    const unpublished = completeYear(2026);
    unpublished[8] = summarizeMonthlyClimate(
      {
        metricId: "precipitation-rate",
        dataMonth: { year: 2026, month: 9 },
        value: 0.0001,
      },
      { year: 2026, month: 1 }
    );
    const noData = completeYear(2026);
    noData[2] = monthlySummary({ year: 2026, month: 3 }, null);

    expect(precipitationAnnualTotal(unpublished, 2026)).toBeNull();
    expect(precipitationAnnualTotal(noData, 2026)).toBeNull();
  });

  it("refuses mixed product provenance", () => {
    const summaries = completeYear(2023);
    const foreign: DatasetRef = {
      shortName: "OTHER",
      version: "001",
      doi: "10.0000/other",
      title: "Other product",
    };
    summaries[6] = {
      ...summaries[6],
      metric: { ...summaries[6].metric, source: foreign },
    };

    expect(precipitationAnnualTotal(summaries, 2023)).toBeNull();
  });

  it("documents the complete-year and non-inferential limits", () => {
    expect(PRECIPITATION_ANNUAL_TOTAL_LIMITATIONS).toMatch(/twelve/i);
    expect(PRECIPITATION_ANNUAL_TOTAL_LIMITATIONS).toMatch(/not a .*forecast/i);
  });
});
