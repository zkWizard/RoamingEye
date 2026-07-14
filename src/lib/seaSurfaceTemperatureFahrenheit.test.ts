import { describe, expect, it } from "vitest";
import {
  summarizeOceanConditions,
  type SeaSurfaceTemperatureObservation,
} from "./oceanConditions";
import {
  formatFahrenheitSeaSurfaceTemperature,
  SEA_SURFACE_TEMPERATURE_FAHRENHEIT_CONVERSION,
  toFahrenheitSeaSurfaceTemperature,
} from "./seaSurfaceTemperatureFahrenheit";

function waterObservation(
  overrides: Partial<SeaSurfaceTemperatureObservation> = {}
): SeaSurfaceTemperatureObservation {
  return {
    dataMonth: { year: 2026, month: 3 },
    value: 18,
    footprint: "water",
    ...overrides,
  };
}

describe("sea-surface-temperature Fahrenheit companion", () => {
  it("re-expresses a usable °C observation in °F with the exact identity and unchanged provenance", () => {
    const summary = summarizeOceanConditions(waterObservation({ value: 18 }));

    const companion = toFahrenheitSeaSurfaceTemperature(summary);

    expect(companion).toMatchObject({
      kind: "familiar-unit-sea-surface-temperature",
      isForecast: false,
      marineBiologyObservation: false,
      nativeUnit: "°C",
      familiarUnit: "°F",
      source: summary.metric.source,
      dataMonth: { year: 2026, month: 3 },
      nativeValue: 18,
    });
    // 18 °C × 9/5 + 32 = 64.4 °F.
    expect(companion.value).toBeCloseTo(64.4, 10);
    expect(companion.conversion).toBe(
      SEA_SURFACE_TEMPERATURE_FAHRENHEIT_CONVERSION
    );
  });

  it("anchors on the freezing and body-temperature identities", () => {
    const freezing = toFahrenheitSeaSurfaceTemperature(
      summarizeOceanConditions(waterObservation({ value: 0 }))
    );
    // 0 °C is exactly 32 °F.
    expect(freezing.value).toBeCloseTo(32, 10);

    const warm = toFahrenheitSeaSurfaceTemperature(
      summarizeOceanConditions(waterObservation({ value: 30 }))
    );
    // 30 °C × 9/5 + 32 = 86 °F.
    expect(warm.value).toBeCloseTo(86, 10);
  });

  it("carries the source's descriptive band through verbatim, not re-derived from °F", () => {
    const summary = summarizeOceanConditions(waterObservation({ value: 25 }));

    const companion = toFahrenheitSeaSurfaceTemperature(summary);

    // 25 °C is the source summary's "warm" band; the companion never invents
    // its own band over the 77 °F number.
    expect(summary.temperatureBand).toBe("warm");
    expect(companion.temperatureBand).toBe("warm");
    expect(companion.value).toBeCloseTo(77, 10);
  });

  it("withholds a value for a land footprint rather than converting nothing", () => {
    const summary = summarizeOceanConditions(
      waterObservation({ footprint: "land", value: 12 })
    );

    const companion = toFahrenheitSeaSurfaceTemperature(summary);

    expect(summary.observedValue).toBeNull();
    expect(companion.nativeValue).toBeNull();
    expect(companion.value).toBeNull();
    expect(companion.temperatureBand).toBeNull();
    // Provenance and unit metadata survive even without a value.
    expect(companion.familiarUnit).toBe("°F");
    expect(companion.source).toBe(summary.metric.source);
  });

  it("withholds a value for a missing SST observation", () => {
    const summary = summarizeOceanConditions(
      waterObservation({ value: null, validFraction: 0 })
    );

    const companion = toFahrenheitSeaSurfaceTemperature(summary);

    expect(companion.value).toBeNull();
    expect(companion.nativeValue).toBeNull();
  });

  it("preserves the coastal/land-mixed value that the summary still exposes", () => {
    const summary = summarizeOceanConditions(
      waterObservation({ footprint: "land-mixed-coastal", value: 21 })
    );

    const companion = toFahrenheitSeaSurfaceTemperature(summary);

    // 21 °C × 9/5 + 32 = 69.8 °F; a coastal footprint still yields a value.
    expect(companion.value).toBeCloseTo(69.8, 10);
  });

  it("formats usable and unusable readouts honestly with the cited source", () => {
    const summary = summarizeOceanConditions(waterObservation({ value: 18 }));
    const companion = toFahrenheitSeaSurfaceTemperature(summary);
    const source = `${summary.metric.source.shortName} v${summary.metric.source.version}`;

    expect(formatFahrenheitSeaSurfaceTemperature(companion)).toBe(
      `Sea surface temperature for Mar 2026: 64.4 °F (from 18 °C); source ${source}. This is an SST observation, not a marine-biology observation.`
    );

    const land = summarizeOceanConditions(
      waterObservation({ footprint: "land", value: 18 })
    );
    const landCompanion = toFahrenheitSeaSurfaceTemperature(land);
    expect(formatFahrenheitSeaSurfaceTemperature(landCompanion)).toBe(
      `No usable °F value; source ${source}. This is an SST observation, not a marine-biology observation.`
    );
  });
});
