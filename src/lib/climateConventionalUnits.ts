import type { ClimateMetricId, MonthlyClimateSummary } from "./climate";
import type { DatasetRef, YearMonth } from "./timeline";

/**
 * Conventional-unit companions for native atmospheric climate observations.
 *
 * Source products store atmospheric values in machine-native units that are
 * hard to read: precipitation as a kg/m²/s mass flux, 2 m air temperature in
 * kelvin. These helpers re-express a usable native observation in the unit
 * scientific convention prefers (mm/day, °C) using only *exact, dimensional*
 * conversions. They add no estimate, anomaly, forecast, or interpretation: a
 * converted value carries the same information and the same cited provenance
 * as the native observation it wraps, just on a more legible scale.
 *
 * Only the atmospheric metrics this module owns are converted. Metrics outside
 * that scope (soil moisture) return null so no caller mistakes an absent
 * conversion for a claim about them.
 */

export interface ConventionalUnitConversion {
  metricId: ClimateMetricId;
  /** Native product unit the observation is stored in. */
  nativeUnit: string;
  /** Conventional unit the native value is exactly re-expressed in. */
  conventionalUnit: string;
  /** Exact multiplier applied to the native value before {@link offset}. */
  scale: number;
  /** Exact addend applied after {@link scale}. */
  offset: number;
  /** The exact dimensional basis for the conversion; never an estimate. */
  basis: string;
}

/**
 * Exact conversions for the atmospheric climate metrics. Both are dimensional
 * identities, not fitted approximations:
 * - Precipitation rate: 1 kg/m² of liquid water is a 1 mm water-equivalent
 *   depth (water density 1000 kg/m³), and there are 86,400 s in a day, so
 *   kg/m²/s × 86,400 gives mm/day with no loss.
 * - 2 m air temperature: kelvin to Celsius is a fixed −273.15 offset.
 */
const CONVENTIONAL_UNIT_CONVERSIONS: Partial<
  Record<ClimateMetricId, ConventionalUnitConversion>
> = {
  "precipitation-rate": {
    metricId: "precipitation-rate",
    nativeUnit: "kg/m²/s",
    conventionalUnit: "mm/day",
    scale: 86_400,
    offset: 0,
    basis: "1 kg/m² of liquid water ≡ 1 mm depth; × 86,400 s/day",
  },
  "air-temperature-2m": {
    metricId: "air-temperature-2m",
    nativeUnit: "K",
    conventionalUnit: "°C",
    scale: 1,
    offset: -273.15,
    basis: "kelvin to Celsius is an exact −273.15 offset",
  },
};

/**
 * The exact conventional-unit conversion for a metric, or null when this
 * module defines none (metrics outside the atmospheric domain it owns).
 */
export function conventionalUnitConversionFor(
  metricId: ClimateMetricId
): ConventionalUnitConversion | null {
  return CONVENTIONAL_UNIT_CONVERSIONS[metricId] ?? null;
}

export interface ConventionalClimateValue {
  kind: "conventional-unit-climate-value";
  /** Explicitly prevents consumers from treating this as a forecast. */
  isForecast: false;
  metricId: ClimateMetricId;
  /** Same cited product as the native observation; provenance is unchanged. */
  source: DatasetRef;
  dataMonth: YearMonth;
  nativeUnit: string;
  conventionalUnit: string;
  /** The exact conversion applied to reach {@link value}. */
  conversion: ConventionalUnitConversion;
  /**
   * The native observed value re-expressed in `conventionalUnit`, or null when
   * the source summary had no usable published observation to convert.
   */
  value: number | null;
}

/**
 * Re-express a monthly climate summary's native observation in its conventional
 * unit. Returns null for metrics this module does not convert. The publication,
 * coverage, and value guards mirror the native place-panel readout exactly: a
 * value is only populated for a published, fully usable observation. A not-yet-
 * published, invalid, or no-data month converts to a null value rather than a
 * fabricated or prematurely surfaced number.
 */
export function toConventionalClimateValue(
  summary: MonthlyClimateSummary
): ConventionalClimateValue | null {
  const conversion = conventionalUnitConversionFor(summary.metric.id);
  if (!conversion) {
    return null;
  }
  const native = summary.observedValue;
  const usable =
    summary.publicationStatus === "published" &&
    summary.coverage.status === "available" &&
    native !== null &&
    Number.isFinite(native);
  return {
    kind: "conventional-unit-climate-value",
    isForecast: false,
    metricId: summary.metric.id,
    source: summary.metric.source,
    dataMonth: summary.dataMonth,
    nativeUnit: summary.metric.nativeUnit,
    conventionalUnit: conversion.conventionalUnit,
    conversion,
    value: usable ? native * conversion.scale + conversion.offset : null,
  };
}

/**
 * A compact readout of a conventional value with its cited source, matching the
 * place panel's native readout style. Unusable months are reported honestly
 * rather than shown as a number.
 */
export function formatConventionalClimateValue(
  converted: ConventionalClimateValue
): string {
  const source = `${converted.source.shortName} v${converted.source.version}`;
  if (converted.value === null) {
    return `No usable ${converted.conventionalUnit} value; source ${source}`;
  }
  return `${formatNumber(converted.value)} ${converted.conventionalUnit} (from ${converted.nativeUnit}); source ${source}`;
}

function formatNumber(value: number): string {
  return Number(value.toPrecision(5)).toString();
}
