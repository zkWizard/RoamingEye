import type { MonthlyClimateSummary } from "./climate";
import {
  describeAirTemperatureFreezeThreshold,
  type FreezeThresholdCategory,
} from "./airTemperatureFreeze";
import type { DatasetRef, YearMonth } from "./timeline";

/**
 * A familiar-unit (Fahrenheit) companion for a summarized monthly-mean 2 m
 * air-temperature observation.
 *
 * The MERRA-2 air-temperature layer, and every atmospheric descriptor built on
 * it, reports kelvin — the source product's native scientific unit. Kelvin is
 * hard to read, and while degrees Celsius (an exact −273.15 offset, see
 * climateConventionalUnits.ts) is the scientific convention, degrees Fahrenheit
 * is the more legible scale for a general (often US) audience. This helper
 * re-expresses an already-summarized 2 m air-temperature value in °F using only
 * the exact dimensional identity °F = K × 9/5 − 459.67. It adds no estimate,
 * anomaly, comparison, diagnosis, or forecast: the companion carries the same
 * information and the same cited provenance as the kelvin observation it wraps,
 * on a more familiar scale.
 *
 * Only the 2 m air-temperature metric is converted. Other metrics return null
 * so no caller mistakes an absent conversion for a claim about them, mirroring
 * the scope guards in airTemperatureFreeze.ts and precipitationAccumulation.ts.
 * The value is populated only when the source summary already exposes a usable,
 * published observation; not-yet-published, invalid, and no-data months convert
 * to a null value rather than a fabricated or prematurely surfaced number.
 */

/** Exact kelvin-to-Fahrenheit identity; never a fitted approximation. */
export const AIR_TEMPERATURE_FAHRENHEIT_CONVERSION = {
  nativeUnit: "K",
  familiarUnit: "°F",
  /** Exact multiplier applied to the kelvin value before {@link offset}. */
  scale: 9 / 5,
  /** Exact addend applied after {@link scale}. */
  offset: -459.67,
  basis: "°F = K × 9/5 − 459.67 is an exact dimensional identity",
} as const;

export interface AirTemperatureFahrenheitCompanion {
  kind: "familiar-unit-air-temperature";
  /** Explicitly prevents consumers from treating this as a forecast. */
  isForecast: false;
  /** Same cited product as the kelvin observation; provenance is unchanged. */
  source: DatasetRef;
  dataMonth: YearMonth;
  nativeUnit: typeof AIR_TEMPERATURE_FAHRENHEIT_CONVERSION.nativeUnit;
  familiarUnit: typeof AIR_TEMPERATURE_FAHRENHEIT_CONVERSION.familiarUnit;
  conversion: typeof AIR_TEMPERATURE_FAHRENHEIT_CONVERSION;
  /** The observed kelvin value carried through unchanged, or null when unusable. */
  nativeValue: number | null;
  /**
   * The observed value re-expressed in °F, or null when the source summary had
   * no usable published observation to convert.
   */
  value: number | null;
  /**
   * The freeze-threshold category carried through verbatim from the source
   * summary. It is a category over the kelvin monthly mean, never re-derived
   * from °F, and describes the monthly mean only — not daily highs or lows.
   */
  freezeCategory: FreezeThresholdCategory | null;
}

/**
 * Re-express a summarized monthly climate observation in degrees Fahrenheit.
 * Returns null for any metric other than 2 m air temperature (out of scope).
 * For that metric it always returns a companion: the observed value is
 * converted only when the summary already carries a usable, published,
 * fully-covered observation; otherwise the companion carries a null value while
 * still exposing the unit and provenance metadata.
 */
export function toFahrenheitAirTemperature(
  summary: MonthlyClimateSummary
): AirTemperatureFahrenheitCompanion | null {
  if (summary.metric.id !== "air-temperature-2m") {
    return null;
  }

  const conversion = AIR_TEMPERATURE_FAHRENHEIT_CONVERSION;
  const native = summary.observedValue;
  const usable =
    summary.publicationStatus === "published" &&
    summary.coverage.status === "available" &&
    native !== null &&
    Number.isFinite(native);

  // The freeze-threshold context is a category over the kelvin mean; carry it
  // through only for a usable observation so an absent category never reads as
  // a claim, matching how the value itself is withheld.
  const freeze = usable ? describeAirTemperatureFreezeThreshold(summary) : null;

  return {
    kind: "familiar-unit-air-temperature",
    isForecast: false,
    source: summary.metric.source,
    dataMonth: summary.dataMonth,
    nativeUnit: conversion.nativeUnit,
    familiarUnit: conversion.familiarUnit,
    conversion,
    nativeValue: usable ? native : null,
    value: usable ? native * conversion.scale + conversion.offset : null,
    freezeCategory: freeze?.category ?? null,
  };
}

/**
 * A compact readout of the Fahrenheit companion with its cited source, matching
 * the place panel's native readout style. Unusable months are reported honestly
 * rather than shown as a number.
 */
export function formatFahrenheitAirTemperature(
  companion: AirTemperatureFahrenheitCompanion
): string {
  const source = `${companion.source.shortName} v${companion.source.version}`;
  const month = formatMonth(companion.dataMonth);
  if (companion.value === null || companion.nativeValue === null) {
    return `No usable ${companion.familiarUnit} 2 m air-temperature value for ${month}; source ${source}.`;
  }
  return `2 m air temperature for ${month}: ${formatNumber(companion.value)} ${companion.familiarUnit} (from ${formatNumber(companion.nativeValue)} ${companion.nativeUnit}); monthly mean only — does not describe daily highs or lows; source ${source}.`;
}

function formatNumber(value: number): string {
  return Number(value.toPrecision(5)).toString();
}

function formatMonth(month: YearMonth): string {
  return `${month.year}-${String(month.month).padStart(2, "0")}`;
}
