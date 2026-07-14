import { describe, expect, it } from "vitest";
import { summarizeMonthlyClimate } from "./climate";
import {
  AIR_TEMPERATURE_FAHRENHEIT_CONVERSION,
  formatFahrenheitAirTemperature,
  toFahrenheitAirTemperature,
} from "./airTemperatureFahrenheit";
import { FREEZING_POINT_K } from "./airTemperatureFreeze";

const AVAILABLE_THROUGH = { year: 2026, month: 5 } as const;

function airSummary(
  value: number | null,
  opts: { month?: { year: number; month: number }; validFraction?: number } = {}
) {
  const month = opts.month ?? { year: 2026, month: 3 };
  return summarizeMonthlyClimate(
    {
      metricId: "air-temperature-2m",
      dataMonth: month,
      value,
      ...(opts.validFraction !== undefined
        ? { validFraction: opts.validFraction }
        : {}),
    },
    AVAILABLE_THROUGH
  );
}

describe("air-temperature Fahrenheit companion", () => {
  it("re-expresses a usable kelvin observation with the exact identity", () => {
    const summary = airSummary(300);
    const companion = toFahrenheitAirTemperature(summary);

    expect(companion).toMatchObject({
      kind: "familiar-unit-air-temperature",
      isForecast: false,
      dataMonth: { year: 2026, month: 3 },
      nativeUnit: "K",
      familiarUnit: "°F",
      nativeValue: 300,
      source: summary.metric.source,
    });
    // 300 K × 9/5 − 459.67 = 80.33 °F.
    expect(companion?.value).toBeCloseTo(80.33, 10);
    expect(companion?.conversion).toBe(AIR_TEMPERATURE_FAHRENHEIT_CONVERSION);
  });

  it("maps the freezing point to exactly 32 °F", () => {
    const companion = toFahrenheitAirTemperature(airSummary(FREEZING_POINT_K));

    // 273.15 K is the water freezing point ≡ 32 °F ≡ 0 °C, an exact anchor.
    expect(companion?.value).toBeCloseTo(32, 10);
    expect(companion?.freezeCategory).toBe("at-freezing");
  });

  it("carries through the freeze-threshold category over the kelvin mean", () => {
    expect(toFahrenheitAirTemperature(airSummary(289.4))?.freezeCategory).toBe(
      "above-freezing"
    );
    expect(toFahrenheitAirTemperature(airSummary(265))?.freezeCategory).toBe(
      "below-freezing"
    );
  });

  it("preserves the cited provenance unchanged", () => {
    const summary = airSummary(295);
    const companion = toFahrenheitAirTemperature(summary);
    expect(companion?.source).toEqual(summary.metric.source);
    expect(companion?.source.shortName).toBeTruthy();
  });

  it("withholds a value for a not-yet-published month", () => {
    // Data month after the availability checkpoint is not yet published.
    const summary = airSummary(295, { month: { year: 2026, month: 8 } });
    const companion = toFahrenheitAirTemperature(summary);

    expect(companion?.value).toBeNull();
    expect(companion?.nativeValue).toBeNull();
    expect(companion?.freezeCategory).toBeNull();
    // Metadata still travels with the withheld value.
    expect(companion?.familiarUnit).toBe("°F");
    expect(companion?.source).toEqual(summary.metric.source);
  });

  it("withholds a value when coverage is unusable", () => {
    const noData = toFahrenheitAirTemperature(airSummary(null));
    expect(noData?.value).toBeNull();
    expect(noData?.nativeValue).toBeNull();

    const zeroCoverage = toFahrenheitAirTemperature(
      airSummary(295, { validFraction: 0 })
    );
    expect(zeroCoverage?.value).toBeNull();
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
        value: 30,
      },
      AVAILABLE_THROUGH
    );

    expect(toFahrenheitAirTemperature(precip)).toBeNull();
    expect(toFahrenheitAirTemperature(soil)).toBeNull();
  });

  it("uses only exact conversion constants", () => {
    expect(AIR_TEMPERATURE_FAHRENHEIT_CONVERSION.scale).toBe(9 / 5);
    expect(AIR_TEMPERATURE_FAHRENHEIT_CONVERSION.offset).toBe(-459.67);
    expect(AIR_TEMPERATURE_FAHRENHEIT_CONVERSION.nativeUnit).toBe("K");
    expect(AIR_TEMPERATURE_FAHRENHEIT_CONVERSION.familiarUnit).toBe("°F");
  });
});

describe("formatFahrenheitAirTemperature", () => {
  it("formats a usable companion with both units and the honesty note", () => {
    const text = formatFahrenheitAirTemperature(
      toFahrenheitAirTemperature(airSummary(300))!
    );
    expect(text).toContain("2 m air temperature for 2026-03");
    expect(text).toContain("80.33 °F");
    expect(text).toContain("(from 300 K)");
    expect(text).toContain("does not describe daily highs or lows");
  });

  it("reports an unusable month honestly rather than as a number", () => {
    const text = formatFahrenheitAirTemperature(
      toFahrenheitAirTemperature(airSummary(null))!
    );
    expect(text).toContain(
      "No usable °F 2 m air-temperature value for 2026-03"
    );
    expect(text).not.toMatch(/\d\s*°F/);
  });
});
