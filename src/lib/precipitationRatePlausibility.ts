import type { MonthlyClimateSummary } from "./climate";
import type { DatasetRef, YearMonth } from "./timeline";

/**
 * Gross-error plausibility band for monthly precipitation-rate observations.
 *
 * The precipitation layer stores a monthly-mean total precipitation rate (GLDAS
 * Noah land model) as a mass flux in kg/m²/s — a tiny number (a wet month is on
 * the order of 1e-4 kg/m²/s). `climate.ts` only guards that a usable value is
 * non-negative, which still admits physically impossible readings: a value left
 * in mm/day (say 20) passes as "20 kg/m²/s", a value in mm/month passes as
 * hundreds of kg/m²/s, and a mis-scaled or sign-flipped decode passes unchecked.
 * This module adds a conservative outer sanity band so such gross unit/decode
 * mistakes can be flagged before a caller surfaces them as a real observation.
 *
 * Scientific honesty (kept in the code because callers will surface it):
 *  - This is a *gross-error* check, NOT a climatological range and NOT a
 *    correctness guarantee. A value inside the band can still be wrong; the band
 *    only rejects readings no monthly-mean precipitation rate could produce.
 *  - The observations are monthly means from a land-surface model, which never
 *    reach the instantaneous rainfall records the upper bound is anchored to.
 *    The band is therefore deliberately wider than any real monthly mean, so it
 *    never flags a genuine extreme — only impossible ones.
 *  - The bounds are fixed reference values, not derived from the sampled data.
 *  - A monthly mean of exactly zero (a rainless arid month) is legitimately
 *    plausible; only a negative rate — impossible for precipitation — is flagged
 *    on the low side. Upstream `climate.ts` already rejects negatives, but the
 *    band is kept self-contained so it does not assume that guard ran.
 */

/**
 * Documented rainfall extreme used only to anchor the (wider) upper bound below.
 * This is a record, not a limit this module claims a monthly mean should
 * approach. Cherrapunji (Sohra), Meghalaya recorded ≈ 9,300 mm of rain in the
 * single calendar month of July 1861 — the wettest calendar month on record.
 * Spread across 31 days that is a ≈ 300 mm/day mean, i.e. ≈ 3.47e-3 kg/m²/s
 * (300 mm/day ÷ 86,400 s/day, with 1 mm ≡ 1 kg/m² of liquid water).
 */
export const PRECIPITATION_RATE_RECORD_ANCHOR = {
  /** Wettest recorded calendar-month total, in millimetres. */
  wettestCalendarMonthMm: 9_300,
  /** That total as a monthly-mean mass-flux rate, in kg/m²/s. */
  wettestCalendarMonthKgM2S: 9_300 / (31 * 86_400), // ≈ 3.47e-3
} as const;

/**
 * Inclusive plausibility band for a monthly precipitation-rate reading, in
 * kg/m²/s. The upper bound sits well above the wettest recorded calendar month's
 * mean rate (≈ 3.47e-3 kg/m²/s ≈ 300 mm/day) so a real monthly mean is never
 * flagged; only impossible values (an unconverted mm/day or mm/month figure, a
 * mis-scaled sample, a decode error) fall outside it.
 */
export const PLAUSIBLE_PRECIPITATION_RATE_KG_M2_S = {
  /** A rainless month is real; a negative rate is a sign/decode error. */
  minKgM2S: 0,
  /** ≈ 864 mm/day monthly mean — ≈ 2.9× the wettest recorded calendar month. */
  maxKgM2S: 0.01,
} as const;

const PLAUSIBILITY_BASIS =
  "conservative gross-error band (0–0.01 kg/m²/s ≈ 0–864 mm/day monthly mean), " +
  "wider than the wettest recorded calendar month (≈ 9,300 mm, Cherrapunji " +
  "July 1861 ≈ 300 mm/day ≈ 3.47e-3 kg/m²/s); flags impossible values (an " +
  "unconverted mm/day or mm/month figure, a mis-scaled sample), not " +
  "climatological limits";

export type PrecipitationRatePlausibilityStatus =
  "plausible" | "implausibly-negative" | "implausibly-wet" | "not-usable";

export interface PrecipitationRatePlausibility {
  kind: "precipitation-rate-plausibility";
  /** Explicitly prevents consumers from treating this as a forecast. */
  isForecast: false;
  /** Same cited product as the observation; provenance is unchanged. */
  source: DatasetRef;
  dataMonth: YearMonth;
  /** The observed rate in kg/m²/s, or null when there was none to check. */
  observedKgM2S: number | null;
  status: PrecipitationRatePlausibilityStatus;
  /** Inclusive band the value was checked against. */
  bounds: { minKgM2S: number; maxKgM2S: number };
  /** The dimensional/record basis for the band; never a data-derived estimate. */
  basis: string;
  /** Why a value could not be checked, or null when one was. */
  reason: string | null;
}

/**
 * Check a monthly climate summary's precipitation-rate value against the
 * gross-error plausibility band. Returns null for any other metric so a caller
 * cannot mistakenly apply a precipitation band to air temperature or soil
 * moisture. A not-yet-published, invalid, or no-data month yields a `not-usable`
 * status rather than a fabricated verdict.
 */
export function precipitationRatePlausibility(
  summary: MonthlyClimateSummary
): PrecipitationRatePlausibility | null {
  if (summary.metric.id !== "precipitation-rate") {
    return null;
  }

  const bounds = {
    minKgM2S: PLAUSIBLE_PRECIPITATION_RATE_KG_M2_S.minKgM2S,
    maxKgM2S: PLAUSIBLE_PRECIPITATION_RATE_KG_M2_S.maxKgM2S,
  };
  const base = {
    kind: "precipitation-rate-plausibility" as const,
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
      observedKgM2S: null,
      status: "not-usable",
      reason: unusableReason(summary),
    };
  }

  const status: PrecipitationRatePlausibilityStatus =
    value < bounds.minKgM2S
      ? "implausibly-negative"
      : value > bounds.maxKgM2S
        ? "implausibly-wet"
        : "plausible";

  return { ...base, observedKgM2S: value, status, reason: null };
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
export function formatPrecipitationRatePlausibility(
  result: PrecipitationRatePlausibility
): string {
  const source = `${result.source.shortName} v${result.source.version}`;
  if (result.status === "not-usable" || result.observedKgM2S === null) {
    return `No usable precipitation-rate value to check (${result.reason ?? "unspecified"}); source ${source}`;
  }
  const value = `${formatNumber(result.observedKgM2S)} kg/m²/s`;
  if (result.status === "plausible") {
    return `${value} within plausible precipitation-rate band ${result.bounds.minKgM2S}–${result.bounds.maxKgM2S} kg/m²/s (gross-error sanity pass, not a correctness guarantee); source ${source}`;
  }
  const side = result.status === "implausibly-negative" ? "below" : "above";
  return `${value} is ${side} the plausible precipitation-rate band ${result.bounds.minKgM2S}–${result.bounds.maxKgM2S} kg/m²/s; likely a unit or decode error, not a real observation; source ${source}`;
}

function formatNumber(value: number): string {
  return Number(value.toPrecision(5)).toString();
}
