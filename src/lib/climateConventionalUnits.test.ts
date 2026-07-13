import { describe, expect, it } from "vitest";
import { summarizeMonthlyClimate } from "./climate";
import {
  conventionalUnitConversionFor,
  formatConventionalClimateValue,
  toConventionalClimateValue,
} from "./climateConventionalUnits";

const AVAILABLE_THROUGH = { year: 2026, month: 5 } as const;

describe("conventional-unit climate companions", () => {
  it("converts a precipitation rate to mm/day with an exact factor and unchanged provenance", () => {
    const summary = summarizeMonthlyClimate(
      {
        metricId: "precipitation-rate",
        dataMonth: { year: 2026, month: 1 },
        value: 0.0002, // kg/m²/s
        validFraction: 0.74,
      },
      AVAILABLE_THROUGH
    );

    const converted = toConventionalClimateValue(summary);

    expect(converted).toMatchObject({
      kind: "conventional-unit-climate-value",
      isForecast: false,
      metricId: "precipitation-rate",
      nativeUnit: "kg/m²/s",
      conventionalUnit: "mm/day",
      source: summary.metric.source,
      dataMonth: { year: 2026, month: 1 },
    });
    // 0.0002 kg/m²/s × 86,400 s/day = 17.28 mm/day.
    expect(converted?.value).toBeCloseTo(17.28, 10);
  });

  it("converts a 2 m air temperature from kelvin to Celsius with the fixed offset", () => {
    const summary = summarizeMonthlyClimate(
      {
        metricId: "air-temperature-2m",
        dataMonth: { year: 2026, month: 3 },
        value: 289.4, // K
      },
      AVAILABLE_THROUGH
    );

    const converted = toConventionalClimateValue(summary);

    expect(converted?.conventionalUnit).toBe("°C");
    expect(converted?.value).toBeCloseTo(16.25, 10);
    expect(converted?.conversion).toMatchObject({ scale: 1, offset: -273.15 });
  });

  it("returns null for metrics outside the atmospheric domain it owns", () => {
    const soil = summarizeMonthlyClimate(
      {
        metricId: "soil-moisture",
        dataMonth: { year: 2026, month: 1 },
        value: 7.2,
      },
      AVAILABLE_THROUGH
    );

    expect(toConventionalClimateValue(soil)).toBeNull();
    expect(conventionalUnitConversionFor("soil-moisture")).toBeNull();
  });

  it("never fabricates a value for an unpublished or unusable month", () => {
    const future = summarizeMonthlyClimate(
      {
        metricId: "precipitation-rate",
        dataMonth: { year: 2026, month: 8 },
        value: 0.0001,
      },
      AVAILABLE_THROUGH
    );
    const missing = summarizeMonthlyClimate(
      {
        metricId: "air-temperature-2m",
        dataMonth: { year: 2026, month: 2 },
        value: null,
        validFraction: 0,
      },
      AVAILABLE_THROUGH
    );

    const futureConverted = toConventionalClimateValue(future);
    const missingConverted = toConventionalClimateValue(missing);

    // The summary withholds observedValue for these, so the companion is null
    // while still carrying the unit and provenance metadata.
    expect(futureConverted?.value).toBeNull();
    expect(futureConverted?.conventionalUnit).toBe("mm/day");
    expect(missingConverted?.value).toBeNull();
  });

  it("formats usable and unusable readouts honestly with the cited source", () => {
    const summary = summarizeMonthlyClimate(
      {
        metricId: "air-temperature-2m",
        dataMonth: { year: 2026, month: 3 },
        value: 300, // K
      },
      AVAILABLE_THROUGH
    );
    const converted = toConventionalClimateValue(summary);
    expect(converted).not.toBeNull();
    const source = `${summary.metric.source.shortName} v${summary.metric.source.version}`;

    expect(formatConventionalClimateValue(converted!)).toBe(
      `26.85 °C (from K); source ${source}`
    );

    const unavailable = summarizeMonthlyClimate(
      {
        metricId: "air-temperature-2m",
        dataMonth: { year: 2026, month: 3 },
        value: -5, // invalid kelvin → withheld
      },
      AVAILABLE_THROUGH
    );
    const unavailableConverted = toConventionalClimateValue(unavailable);
    expect(unavailableConverted).not.toBeNull();
    expect(formatConventionalClimateValue(unavailableConverted!)).toBe(
      `No usable °C value; source ${source}`
    );
  });
});
