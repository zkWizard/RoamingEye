import { describe, expect, it } from "vitest";
import { summarizeMonthlyClimate } from "./climate";
import {
  describeAirTemperatureFreezeThreshold,
  FREEZING_POINT_K,
} from "./airTemperatureFreeze";

const AVAILABLE_THROUGH = { year: 2026, month: 5 } as const;

function airSummary(value: number | null, month = { year: 2026, month: 3 }) {
  return summarizeMonthlyClimate(
    { metricId: "air-temperature-2m", dataMonth: month, value },
    AVAILABLE_THROUGH
  );
}

describe("air-temperature freeze-threshold context", () => {
  it("classifies a mean above freezing with an exact margin and unchanged provenance", () => {
    const summary = airSummary(289.4);
    const context = describeAirTemperatureFreezeThreshold(summary);

    expect(context).toMatchObject({
      kind: "air-temperature-freeze-threshold",
      isForecast: false,
      status: "classified",
      dataMonth: { year: 2026, month: 3 },
      category: "above-freezing",
      observedKelvin: 289.4,
      source: summary.metric.source,
      reason: null,
    });
    // 289.4 K − 273.15 K = 16.25 K above freezing (also the °C reading).
    expect(context?.marginKelvin).toBeCloseTo(16.25, 10);
    expect(context?.statement).toContain("above the 273.15 K freezing point");
    expect(context?.statement).toContain(
      "does not describe daily highs or lows"
    );
  });

  it("classifies a mean below freezing with a signed margin", () => {
    const context = describeAirTemperatureFreezeThreshold(airSummary(265));

    expect(context?.category).toBe("below-freezing");
    // 265 K − 273.15 K = −8.15 K.
    expect(context?.marginKelvin).toBeCloseTo(-8.15, 10);
    expect(context?.statement).toContain(
      "below the 273.15 K freezing point by 8.15 K"
    );
  });

  it("classifies a mean exactly at the freezing point", () => {
    const context = describeAirTemperatureFreezeThreshold(
      airSummary(FREEZING_POINT_K)
    );

    expect(context?.category).toBe("at-freezing");
    expect(context?.marginKelvin).toBe(0);
    expect(context?.statement).toContain("at the 273.15 K freezing point");
  });

  it("returns null for metrics outside the 2 m air-temperature scope", () => {
    const precip = summarizeMonthlyClimate(
      {
        metricId: "precipitation-rate",
        dataMonth: { year: 2026, month: 1 },
        value: 0.0002,
      },
      AVAILABLE_THROUGH
    );
    const soil = summarizeMonthlyClimate(
      {
        metricId: "soil-moisture",
        dataMonth: { year: 2026, month: 1 },
        value: 7.2,
      },
      AVAILABLE_THROUGH
    );

    expect(describeAirTemperatureFreezeThreshold(precip)).toBeNull();
    expect(describeAirTemperatureFreezeThreshold(soil)).toBeNull();
  });

  it("withholds classification for an unpublished month but keeps provenance", () => {
    const future = airSummary(280, { year: 2026, month: 8 });
    const context = describeAirTemperatureFreezeThreshold(future);

    expect(context).not.toBeNull();
    expect(context?.status).toBe("unavailable");
    expect(context?.category).toBeNull();
    expect(context?.observedKelvin).toBeNull();
    expect(context?.marginKelvin).toBeNull();
    expect(context?.reason).toBe("not-yet-published");
    expect(context?.statement).toContain("classification withheld");
    expect(context?.source).toEqual(future.metric.source);
  });

  it("withholds classification when the observation carries no usable value", () => {
    const missing = summarizeMonthlyClimate(
      {
        metricId: "air-temperature-2m",
        dataMonth: { year: 2026, month: 2 },
        value: null,
        validFraction: 0,
      },
      AVAILABLE_THROUGH
    );
    const context = describeAirTemperatureFreezeThreshold(missing);

    expect(context?.status).toBe("unavailable");
    expect(context?.category).toBeNull();
    expect(context?.reason).toBe("missing-value");
  });

  it("never classifies a physically invalid (non-positive kelvin) value", () => {
    // climate.ts flags value <= 0 K as invalid, so no usable value survives.
    const invalid = airSummary(-5);
    const context = describeAirTemperatureFreezeThreshold(invalid);

    expect(context?.status).toBe("unavailable");
    expect(context?.category).toBeNull();
    expect(context?.reason).toBe("invalid-value");
  });
});
