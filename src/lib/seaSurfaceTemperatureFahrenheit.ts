import type {
  OceanConditionSummary,
  SeaSurfaceTemperatureBand,
} from "./oceanConditions";
import { formatYm, type DatasetRef, type YearMonth } from "./timeline";

/**
 * A familiar-unit (Fahrenheit) companion for a summarized sea-surface
 * temperature observation.
 *
 * The MODIS/Aqua SST layer, and every marine descriptor built on it, reports
 * degrees Celsius — the scientific convention for ocean temperature. For a
 * general (often US) audience, degrees Fahrenheit is the more legible scale.
 * This helper re-expresses an already-summarized SST value in °F using only the
 * exact dimensional identity °F = °C × 9/5 + 32. It adds no estimate, band,
 * anomaly, comparison, biological inference, or forecast: the companion carries
 * the same information and the same cited provenance as the °C observation it
 * wraps, on a more familiar scale.
 *
 * The value is populated only when the source summary already exposes a usable
 * observed value. Land, missing, invalid, and not-usable months convert to a
 * null value so no caller mistakes an absent conversion for a fabricated
 * reading — mirroring how {@link OceanConditionSummary} withholds a value.
 */

/** Exact Celsius-to-Fahrenheit identity; never a fitted approximation. */
export const SEA_SURFACE_TEMPERATURE_FAHRENHEIT_CONVERSION = {
  nativeUnit: "°C",
  familiarUnit: "°F",
  /** Exact multiplier applied to the °C value before {@link offset}. */
  scale: 9 / 5,
  /** Exact addend applied after {@link scale}. */
  offset: 32,
  basis: "°F = °C × 9/5 + 32 is an exact dimensional identity",
} as const;

export interface SeaSurfaceTemperatureFahrenheitCompanion {
  kind: "familiar-unit-sea-surface-temperature";
  /** Explicitly prevents consumers from treating this as a forecast. */
  isForecast: false;
  /** This re-expresses an SST value; it is not a marine-biology observation. */
  marineBiologyObservation: false;
  /** Same cited product as the °C observation; provenance is unchanged. */
  source: DatasetRef;
  dataMonth: YearMonth;
  nativeUnit: typeof SEA_SURFACE_TEMPERATURE_FAHRENHEIT_CONVERSION.nativeUnit;
  familiarUnit: typeof SEA_SURFACE_TEMPERATURE_FAHRENHEIT_CONVERSION.familiarUnit;
  conversion: typeof SEA_SURFACE_TEMPERATURE_FAHRENHEIT_CONVERSION;
  /** The observed °C value carried through unchanged, or null when unusable. */
  nativeValue: number | null;
  /**
   * The observed value re-expressed in °F, or null when the source summary had
   * no usable observation to convert.
   */
  value: number | null;
  /**
   * The descriptive temperature band carried through verbatim from the source
   * summary. It is a category over the °C value, never re-derived from °F, and
   * never a hazard, comfort, or biological claim.
   */
  temperatureBand: SeaSurfaceTemperatureBand | null;
}

/**
 * Re-express a summarized SST condition in degrees Fahrenheit. The observed
 * value is converted only when {@link OceanConditionSummary.observedValue} is a
 * finite number the summary already deemed usable; otherwise the companion
 * carries a null value while still exposing the unit and provenance metadata.
 */
export function toFahrenheitSeaSurfaceTemperature(
  summary: OceanConditionSummary
): SeaSurfaceTemperatureFahrenheitCompanion {
  const native = summary.observedValue;
  const usable = native !== null && Number.isFinite(native);
  const conversion = SEA_SURFACE_TEMPERATURE_FAHRENHEIT_CONVERSION;

  return {
    kind: "familiar-unit-sea-surface-temperature",
    isForecast: false,
    marineBiologyObservation: false,
    source: summary.metric.source,
    dataMonth: summary.dataMonth,
    nativeUnit: conversion.nativeUnit,
    familiarUnit: conversion.familiarUnit,
    conversion,
    nativeValue: usable ? native : null,
    value: usable ? native * conversion.scale + conversion.offset : null,
    temperatureBand: usable ? summary.temperatureBand : null,
  };
}

/**
 * A compact readout of the Fahrenheit companion with its cited source, matching
 * the marine panel's native readout style. Unusable months are reported
 * honestly rather than shown as a number.
 */
export function formatFahrenheitSeaSurfaceTemperature(
  companion: SeaSurfaceTemperatureFahrenheitCompanion
): string {
  const source = `${companion.source.shortName} v${companion.source.version}`;
  if (companion.value === null) {
    return `No usable ${companion.familiarUnit} value; source ${source}. This is an SST observation, not a marine-biology observation.`;
  }
  const month = isYearMonth(companion.dataMonth)
    ? formatYm(companion.dataMonth)
    : "an invalid month";
  return `Sea surface temperature for ${month}: ${formatNumber(companion.value)} ${companion.familiarUnit} (from ${formatNumber(companion.nativeValue!)} ${companion.nativeUnit}); source ${source}. This is an SST observation, not a marine-biology observation.`;
}

function formatNumber(value: number): string {
  return Number(value.toPrecision(5)).toString();
}

function isYearMonth(value: YearMonth): boolean {
  return (
    Number.isInteger(value.year) &&
    Number.isInteger(value.month) &&
    value.month >= 1 &&
    value.month <= 12
  );
}
