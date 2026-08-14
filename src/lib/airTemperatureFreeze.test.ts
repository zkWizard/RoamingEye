import { describe, expect, it } from "vitest";
import { summarizeMonthlyClimate } from "./climate";
import {
  describeAirTemperatureFreezeSeparation,
  describeAirTemperatureFreezeThreshold,
  FREEZE_THRESHOLD_SEPARATION_LIMITATIONS,
  FREEZING_POINT_K,
} from "./airTemperatureFreeze";
import { MEASURED_INVERSION } from "./validation";

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

/**
 * The classification above is exact arithmetic on a published value. The place
 * readout never sees one: it sees a rendered pixel colour inverted through an
 * approximate legend, and the sign that decides the category is then the
 * inversion's, not the source's.
 */
describe("freeze-threshold separation against measured inversion error", () => {
  const rmse = MEASURED_INVERSION.airtemp.rmse as number;

  it("separates a mean that stands clear of the measured error", () => {
    const separation = describeAirTemperatureFreezeSeparation(
      airSummary(FREEZING_POINT_K + rmse * 2)
    );

    expect(separation).toMatchObject({
      kind: "air-temperature-freeze-separation",
      isForecast: false,
      unit: "K",
      separation: "separated",
      category: "above-freezing",
      monthRmseK: rmse,
    });
    expect(separation?.statement).toContain("clear of the");
    expect(separation?.statement).toContain("monthly mean only");
  });

  it("withholds a side when the mean is inside the measured error", () => {
    const separation = describeAirTemperatureFreezeSeparation(
      airSummary(FREEZING_POINT_K - rmse / 2)
    );

    expect(separation?.separation).toBe("within-inversion-error");
    // The reported category is never overridden or reversed.
    expect(separation?.category).toBe("below-freezing");
    expect(separation?.statement).toContain(
      "cannot place the mean above or below the threshold"
    );
    expect(separation?.statement).toContain(
      "does not assert the month averaged exactly the freezing point"
    );
  });

  it("bounds by the single-month RMSE, not the difference floor", () => {
    // A difference draws two independently inverted months and carries a
    // sqrt(2) quadrature term. This comparison draws one inverted month and an
    // exact constant, which contributes no error, so the bound is smaller — a
    // margin between the two must separate here and would not there.
    const between = FREEZING_POINT_K + rmse * 1.2;
    expect(
      describeAirTemperatureFreezeSeparation(airSummary(between))
    ).toMatchObject({ separation: "separated" });
    expect(Math.abs(between - FREEZING_POINT_K)).toBeLessThan(
      Math.SQRT2 * rmse
    );
  });

  it("treats a mean exactly at the freezing point as unseparated", () => {
    const separation = describeAirTemperatureFreezeSeparation(
      airSummary(FREEZING_POINT_K)
    );

    expect(separation?.separation).toBe("within-inversion-error");
    expect(separation?.marginKelvin).toBe(0);
    expect(separation?.category).toBe("at-freezing");
  });

  it("keeps the margin identical to the Celsius reading it qualifies", () => {
    // Kelvin to Celsius is an exact offset, so the margin the bound applies to
    // is the number the readout prints — no conversion step stands between the
    // published kelvin error and the value it qualifies.
    const separation = describeAirTemperatureFreezeSeparation(
      airSummary(289.4)
    );
    expect(separation?.marginKelvin).toBeCloseTo(289.4 - FREEZING_POINT_K, 10);
  });

  it("returns null for another metric and for an unusable month", () => {
    const soil = summarizeMonthlyClimate(
      {
        metricId: "soil-moisture",
        dataMonth: { year: 2026, month: 3 },
        value: 20,
      },
      AVAILABLE_THROUGH
    );
    expect(describeAirTemperatureFreezeSeparation(soil)).toBeNull();
    expect(describeAirTemperatureFreezeSeparation(airSummary(null))).toBeNull();
  });

  it("carries scope limits that never claim water froze", () => {
    const separation = describeAirTemperatureFreezeSeparation(
      airSummary(FREEZING_POINT_K)
    );
    expect(separation?.limitations).toEqual(
      FREEZE_THRESHOLD_SEPARATION_LIMITATIONS
    );
    expect(separation?.limitations.join(" ")).toContain(
      "does not rule out sub-freezing days"
    );
  });
});
