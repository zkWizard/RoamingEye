import { describe, expect, it } from "vitest";
import { CLIMATE_METRICS, summarizeMonthlyClimate } from "./climate";

describe("monthly climate summaries", () => {
  it("retains native units, cited sources, and the product publication lag", () => {
    const summary = summarizeMonthlyClimate(
      {
        metricId: "precipitation-rate",
        dataMonth: { year: 2026, month: 1 },
        value: 0.0002,
        validFraction: 0.74,
      },
      { year: 2026, month: 5 }
    );

    expect(summary).toMatchObject({
      kind: "observed-monthly-climate",
      isForecast: false,
      metric: {
        nativeUnit: "kg/m²/s",
        source: CLIMATE_METRICS["precipitation-rate"].source,
      },
      dataMonth: { year: 2026, month: 1 },
      availableThrough: { year: 2026, month: 5 },
      publicationStatus: "published",
      publicationLagMonths: 4,
      observedValue: 0.0002,
      coverage: { status: "available", validFraction: 0.74, reason: null },
    });
  });

  it("keeps air temperature and soil moisture in their native source units", () => {
    const air = summarizeMonthlyClimate(
      {
        metricId: "air-temperature-2m",
        dataMonth: { year: 2026, month: 3 },
        value: 289.4,
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

    expect(air.metric.nativeUnit).toBe("K");
    expect(air.observedValue).toBe(289.4);
    expect(soil.metric.nativeUnit).toBe("kg/m²");
    expect(soil.observedValue).toBe(7.2);
  });

  it("keeps missing, invalid, and not-yet-published values unavailable without forecasting", () => {
    const missing = summarizeMonthlyClimate(
      {
        metricId: "soil-moisture",
        dataMonth: { year: 2026, month: 1 },
        value: null,
        validFraction: 0,
      },
      { year: 2026, month: 5 }
    );
    const invalid = summarizeMonthlyClimate(
      {
        metricId: "air-temperature-2m",
        dataMonth: { year: 2026, month: 3 },
        value: -1,
      },
      { year: 2026, month: 5 }
    );
    const future = summarizeMonthlyClimate(
      {
        metricId: "precipitation-rate",
        dataMonth: { year: 2026, month: 6 },
        value: 0.0001,
      },
      { year: 2026, month: 5 }
    );

    expect(missing).toMatchObject({
      isForecast: false,
      observedValue: null,
      coverage: {
        status: "no-data",
        reason: "missing-value",
        validFraction: 0,
      },
    });
    expect(invalid).toMatchObject({
      observedValue: null,
      coverage: { status: "invalid", reason: "invalid-value" },
    });
    expect(future).toMatchObject({
      isForecast: false,
      dataMonth: { year: 2026, month: 6 },
      availableThrough: { year: 2026, month: 5 },
      metric: {
        nativeUnit: CLIMATE_METRICS["precipitation-rate"].nativeUnit,
        source: CLIMATE_METRICS["precipitation-rate"].source,
      },
      publicationStatus: "not-yet-published",
      publicationLagMonths: null,
      observedValue: null,
      coverage: { status: "available" },
    });
  });

  it("does not expose an otherwise usable value when the availability checkpoint is invalid", () => {
    const summary = summarizeMonthlyClimate(
      {
        metricId: "soil-moisture",
        dataMonth: { year: 2026, month: 4 },
        value: 8.1,
        validFraction: 0.91,
      },
      { year: 2026, month: 13 }
    );

    expect(summary).toMatchObject({
      isForecast: false,
      publicationStatus: "invalid-reference-month",
      publicationLagMonths: null,
      observedValue: null,
      coverage: {
        status: "invalid",
        validFraction: null,
        reason: "invalid-month",
      },
    });
  });
});
