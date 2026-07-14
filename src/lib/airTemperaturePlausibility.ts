import type { MonthlyClimateSummary } from "./climate";
import type { DatasetRef, YearMonth } from "./timeline";

/**
 * Gross-error plausibility band for 2 m air-temperature observations.
 *
 * The atmosphere layer stores near-surface air temperature (MERRA-2 reanalysis)
 * in kelvin. `climate.ts` only guards that a usable value is positive, which
 * still admits physically impossible readings: a value of 5 (a °C figure left
 * unconverted, or a decode error) passes as "5 K", and a mis-scaled sample of
 * 3000 passes as "3000 K". This module adds a conservative outer sanity band so
 * such gross unit/decode mistakes can be flagged before a caller surfaces them
 * as a real observation.
 *
 * Scientific honesty (kept in the code because callers will surface it):
 *  - This is a *gross-error* check, NOT a climatological range and NOT a
 *    correctness guarantee. A value inside the band can still be wrong; the
 *    band only rejects readings that no near-surface air mass could produce.
 *  - The observations are monthly means from a reanalysis, which never reach
 *    the instantaneous surface-air records the bounds are anchored to. The band
 *    is therefore deliberately wider than any real monthly mean, so it never
 *    flags a genuine extreme — only impossible ones.
 *  - The bounds are fixed reference values, not derived from the sampled data.
 */

/**
 * Documented instantaneous near-surface air-temperature extremes on Earth,
 * used only to anchor the (wider) plausibility band below. These are records,
 * not limits this module claims a monthly mean should approach.
 */
export const AIR_TEMPERATURE_RECORD_ANCHORS = {
  /** Coldest reliably recorded surface air temperature: Vostok, 1983. */
  coldestKelvin: 183.95, // -89.2 °C
  /** Hottest reliably recorded surface air temperature: Death Valley, 1913. */
  hottestKelvin: 329.85, // +56.7 °C
} as const;

/**
 * Inclusive plausibility band for a 2 m air-temperature reading, in kelvin.
 * Widened well beyond the record anchors above so a real monthly mean is never
 * flagged; only impossible values (unconverted °C, mis-scaled samples, decode
 * errors) fall outside.
 */
export const PLAUSIBLE_2M_AIR_TEMPERATURE_K = {
  minKelvin: 170, // ≈ -103 °C, below any recorded surface-air minimum
  maxKelvin: 340, // ≈ +67 °C, above any recorded surface-air maximum
} as const;

const PLAUSIBILITY_BASIS =
  "conservative gross-error band (170–340 K ≈ -103 to +67 °C), wider than " +
  "recorded surface-air extremes (-89.2 °C Vostok 1983; +56.7 °C Death " +
  "Valley 1913); flags impossible values, not climatological limits";

export type AirTemperaturePlausibilityStatus =
  "plausible" | "implausibly-cold" | "implausibly-warm" | "not-usable";

export interface AirTemperaturePlausibility {
  kind: "air-temperature-plausibility";
  /** Explicitly prevents consumers from treating this as a forecast. */
  isForecast: false;
  /** Same cited product as the observation; provenance is unchanged. */
  source: DatasetRef;
  dataMonth: YearMonth;
  /** The observed value in kelvin, or null when there was none to check. */
  observedKelvin: number | null;
  status: AirTemperaturePlausibilityStatus;
  /** Inclusive band the value was checked against. */
  bounds: { minKelvin: number; maxKelvin: number };
  /** The dimensional/record basis for the band; never a data-derived estimate. */
  basis: string;
  /** Why a value could not be checked, or null when one was. */
  reason: string | null;
}

/**
 * Check a monthly climate summary's 2 m air-temperature value against the
 * gross-error plausibility band. Returns null for any other metric so a caller
 * cannot mistakenly apply an air-temperature band to precipitation or soil
 * moisture. A not-yet-published, invalid, or no-data month yields a
 * `not-usable` status rather than a fabricated verdict.
 */
export function airTemperaturePlausibility(
  summary: MonthlyClimateSummary
): AirTemperaturePlausibility | null {
  if (summary.metric.id !== "air-temperature-2m") {
    return null;
  }

  const bounds = {
    minKelvin: PLAUSIBLE_2M_AIR_TEMPERATURE_K.minKelvin,
    maxKelvin: PLAUSIBLE_2M_AIR_TEMPERATURE_K.maxKelvin,
  };
  const base = {
    kind: "air-temperature-plausibility" as const,
    isForecast: false as const,
    source: summary.metric.source,
    dataMonth: summary.dataMonth,
    bounds,
    basis: PLAUSIBILITY_BASIS,
  };

  const value = summary.observedValue;
  const usable =
    summary.publicationStatus === "published" &&
    summary.coverage.status === "available" &&
    value !== null &&
    Number.isFinite(value);
  if (!usable || value === null) {
    return {
      ...base,
      observedKelvin: null,
      status: "not-usable",
      reason: unusableReason(summary),
    };
  }

  const status: AirTemperaturePlausibilityStatus =
    value < bounds.minKelvin
      ? "implausibly-cold"
      : value > bounds.maxKelvin
        ? "implausibly-warm"
        : "plausible";

  return { ...base, observedKelvin: value, status, reason: null };
}

function unusableReason(summary: MonthlyClimateSummary): string {
  if (summary.publicationStatus !== "published") {
    return summary.publicationStatus;
  }
  if (summary.coverage.status !== "available") {
    return summary.coverage.reason ?? "no-usable-value";
  }
  return "no-usable-value";
}

/**
 * A compact, honest readout of a plausibility verdict with its cited source.
 * Emphasizes that a "plausible" result is a sanity pass, not a correctness
 * claim, and that a flagged value is likely a unit/decode error.
 */
export function formatAirTemperaturePlausibility(
  result: AirTemperaturePlausibility
): string {
  const source = `${result.source.shortName} v${result.source.version}`;
  if (result.status === "not-usable" || result.observedKelvin === null) {
    return `No usable 2 m air-temperature value to check (${result.reason ?? "unspecified"}); source ${source}`;
  }
  const value = `${formatNumber(result.observedKelvin)} K`;
  if (result.status === "plausible") {
    return `${value} within plausible near-surface band ${result.bounds.minKelvin}–${result.bounds.maxKelvin} K (gross-error sanity pass, not a correctness guarantee); source ${source}`;
  }
  const side = result.status === "implausibly-cold" ? "below" : "above";
  return `${value} is ${side} the plausible near-surface band ${result.bounds.minKelvin}–${result.bounds.maxKelvin} K; likely a unit or decode error, not a real observation; source ${source}`;
}

function formatNumber(value: number): string {
  return Number(value.toPrecision(5)).toString();
}
