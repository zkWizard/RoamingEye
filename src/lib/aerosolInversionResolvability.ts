import {
  AEROSOL_LOADING_BANDS,
  AEROSOL_SOURCE,
  AEROSOL_UNIT,
  AEROSOL_WAVELENGTH_NM,
  describeAerosolLoading,
  type AerosolLoadingCategory,
} from "./aerosolLoading";
import { inversionUncertaintyForLayer } from "./briefValueUncertainty";
import type { DatasetRef } from "./timeline";

/**
 * Whether an aerosol loading tier or a month-over-month change survives the
 * pipeline's own measured colormap-inversion error.
 *
 * The aerosol descriptors bin column AOD into loading tiers and call a
 * month-over-month difference increasing or decreasing at a 0.02 threshold.
 * Both decisions are made on a value RoamingEye did not measure directly: it
 * inverted a rendered GIBS pixel colour through an approximate legend gradient,
 * and that inversion has a *measured* end-to-end RMSE for this layer (METHODS
 * §3, docs/validation.md; the CI-asserted figure lives in `MEASURED_INVERSION`
 * and is read here at runtime, never copied). For the aerosol ramp that error is
 * a large fraction of the whole representable 0-0.9 range — comparable to, and
 * for the two cleanest tiers wider than, the tier widths themselves.
 *
 * Nothing previously related the two, so a reader could take "low column
 * loading, robustly inside its tier" or "increasing" as settled when the
 * retrieval error alone is enough to flip either. This module attaches that
 * comparison. It reports provenance and a documented error figure only: it never
 * re-derives an error, re-bins a value, moves a tier boundary, adjusts a
 * threshold, or infers any condition, air quality, cause, or forecast.
 *
 * Two honesty rules are load-bearing:
 *  - `unresolved` says the categorical call is *not distinguishable* from
 *    inversion error. It never asserts the opposite tier, and it never claims a
 *    change is absent — only that this pipeline cannot separate it from noise.
 *  - The difference floor assumes the two months' inversion errors are
 *    independent, which is the conservative direction. Two months of similar
 *    colour invert through the same legend and their errors largely cancel, so
 *    the true difference error is smaller and the floor over-rejects rather than
 *    over-claims.
 */

/**
 * Honest scope limits shared by both resolvability descriptors. Kept in code
 * because callers surface them alongside any resolvability verdict.
 */
export const AEROSOL_RESOLVABILITY_LIMITATIONS = [
  "Resolvability is measured against the pipeline's end-to-end colormap-inversion RMSE (METHODS §3, docs/validation.md), not against MERRA-2's own validation of column AOD.",
  "The RMSE is a single figure aggregated over the whole rendered ramp, not a per-value 1-sigma error bar; the true error at any single AOD may be larger or smaller, and it is not assumed Gaussian.",
  "An `unresolved` tier does not assert the neighbouring tier, and an unresolved change does not assert that no change occurred — both say only that this pipeline cannot separate the call from its own inversion error.",
  "The difference floor treats the two months' inversion errors as independent. Months of similar column loading invert through the same legend and their errors largely cancel, so the floor is conservative and rejects some real changes.",
  "The band is symmetric and does not model the top of the rendered ramp, where a reading is a lower bound and its uncertainty is no longer two-sided.",
] as const;

/** Whether a categorical call survives the layer's measured inversion error. */
export type AerosolResolution =
  /** Only one reading is consistent with the value's inversion-error band. */
  | "resolved"
  /** More than one reading is consistent; the call is inside the error. */
  | "unresolved"
  /** No measured inversion figure for this layer; never invented. */
  | "uncharacterized";

export interface AerosolTierResolvability {
  kind: "aerosol-tier-resolvability";
  /** Explicitly prevents consumers from treating this as a forecast. */
  isForecast: false;
  source: DatasetRef;
  wavelengthNm: number;
  unit: string;
  /** The supplied column AOD, unchanged. */
  observedValue: number;
  /** Loading tier the value bins into (matches `describeAerosolLoading`). */
  category: AerosolLoadingCategory;
  /** Measured end-to-end inversion RMSE in AOD; null when uncharacterized. */
  inversionRmse: number | null;
  /** `observedValue - inversionRmse`, floored at 0 (AOD cannot be negative). */
  lower: number | null;
  /** `observedValue + inversionRmse`; deliberately not capped at the ramp top. */
  upper: number | null;
  /**
   * Every loading tier consistent with `[lower, upper]`, in band order. Always
   * contains `category`. A single entry means the tier is resolved.
   */
  consistentCategories: AerosolLoadingCategory[];
  resolution: AerosolResolution;
  /** Honest, source-carrying sentence; no condition or air-quality claim. */
  statement: string;
  limitations: readonly string[];
}

export interface AerosolChangeResolvability {
  kind: "aerosol-change-resolvability";
  /** Explicitly prevents consumers from treating this as a forecast. */
  isForecast: false;
  source: DatasetRef;
  wavelengthNm: number;
  unit: string;
  /** The supplied later-minus-earlier AOD difference, unchanged. */
  changeValue: number;
  /** Measured end-to-end inversion RMSE in AOD; null when uncharacterized. */
  inversionRmse: number | null;
  /**
   * Conservative noise floor for a difference of two independently inverted
   * values: `sqrt(2) x inversionRmse`. Null when uncharacterized.
   */
  differenceFloor: number | null;
  resolution: AerosolResolution;
  /** Honest, source-carrying sentence; never asserts a change is absent. */
  statement: string;
  limitations: readonly string[];
}

/** Measured inversion RMSE for the aerosol layer in AOD, or null if unmeasured. */
function aerosolInversionRmse(): number | null {
  // AOD is dimensionless and has no SCALE_CONVERSIONS entry, so the reported and
  // native figures coincide; the shared helper is still used so a future scale
  // conversion cannot silently desync this module from the published figure.
  return (
    inversionUncertaintyForLayer("aerosol", AEROSOL_UNIT)?.nativeRmse ?? null
  );
}

/**
 * Describe whether a column AOD's loading tier survives the layer's measured
 * colormap-inversion error — that is, whether the tier is the only one
 * consistent with the value once the documented retrieval error is applied.
 *
 * Returns null for values that are not usable optical thickness (negative,
 * non-finite, or null), matching `describeAerosolLoading`, so no caller reads a
 * robustness verdict off an unusable number.
 */
export function describeAerosolTierResolvability(
  value: number | null
): AerosolTierResolvability | null {
  const loading = describeAerosolLoading(value);
  if (value === null || loading === null) return null;

  const rmse = aerosolInversionRmse();
  const base = {
    kind: "aerosol-tier-resolvability" as const,
    isForecast: false as const,
    source: AEROSOL_SOURCE,
    wavelengthNm: AEROSOL_WAVELENGTH_NM,
    unit: AEROSOL_UNIT,
    observedValue: value,
    category: loading.category,
    limitations: AEROSOL_RESOLVABILITY_LIMITATIONS,
  };

  if (rmse === null) {
    return {
      ...base,
      inversionRmse: null,
      lower: null,
      upper: null,
      // The reported tier is trivially consistent with itself; with no measured
      // figure no other tier can be ruled in or out, so none is listed.
      consistentCategories: [loading.category],
      resolution: "uncharacterized",
      statement: `Column AOD ${formatNumber(value)} bins as ${loading.label}; this layer carries no measured end-to-end colormap-inversion figure, so tier robustness is not asserted; source ${sourceLabel()}.`,
    };
  }

  // AOD is a non-negative optical thickness, so the lower edge floors at zero.
  // The upper edge is deliberately uncapped: the ramp's top bounds what can be
  // *rendered*, not what the true column loading can be.
  const lower = Math.max(0, value - rmse);
  const upper = value + rmse;
  const consistentCategories = AEROSOL_LOADING_BANDS.filter(
    (band) =>
      (band.maxExclusive === null || lower < band.maxExclusive) &&
      upper >= band.minInclusive
  ).map((band) => band.category);
  const resolution: AerosolResolution =
    consistentCategories.length === 1 ? "resolved" : "unresolved";

  return {
    ...base,
    inversionRmse: rmse,
    lower,
    upper,
    consistentCategories,
    resolution,
    statement: tierStatement(
      value,
      loading.label,
      rmse,
      lower,
      upper,
      resolution,
      consistentCategories
    ),
  };
}

function tierStatement(
  value: number,
  label: string,
  rmse: number,
  lower: number,
  upper: number,
  resolution: AerosolResolution,
  consistent: readonly AerosolLoadingCategory[]
): string {
  const band = `${formatNumber(value)} +/- ${formatNumber(rmse)} (${formatNumber(lower)}-${formatNumber(upper)})`;
  if (resolution === "resolved") {
    return `Column AOD ${band} bins as ${label}, the only tier consistent with the end-to-end colormap-inversion error; source ${sourceLabel()}.`;
  }
  return `Column AOD ${band} bins as ${label}, but ${consistent.length} tiers (${consistent.join(", ")}) are consistent with the end-to-end colormap-inversion error, so the tier is not resolved by this pipeline; source ${sourceLabel()}.`;
}

/**
 * Describe whether a month-over-month column-AOD difference is larger than the
 * error the pipeline's own colormap inversion introduces into a difference of
 * two independently inverted values.
 *
 * `changeValue` is a later-minus-earlier AOD difference (e.g. the `changeValue`
 * of an aerosol loading change). Returns null when no finite difference was
 * supplied, so no caller reads a verdict off a missing comparison.
 */
export function describeAerosolChangeResolvability(
  changeValue: number | null
): AerosolChangeResolvability | null {
  if (changeValue === null || !Number.isFinite(changeValue)) return null;

  const rmse = aerosolInversionRmse();
  const base = {
    kind: "aerosol-change-resolvability" as const,
    isForecast: false as const,
    source: AEROSOL_SOURCE,
    wavelengthNm: AEROSOL_WAVELENGTH_NM,
    unit: AEROSOL_UNIT,
    changeValue,
    limitations: AEROSOL_RESOLVABILITY_LIMITATIONS,
  };

  if (rmse === null) {
    return {
      ...base,
      inversionRmse: null,
      differenceFloor: null,
      resolution: "uncharacterized",
      statement: `Month-over-month column AOD change ${formatSignedNumber(changeValue)}; this layer carries no measured end-to-end colormap-inversion figure, so the change is not tested against a noise floor; source ${sourceLabel()}.`,
    };
  }

  // Independent errors of equal size add in quadrature: sqrt(2) x RMSE. Shared
  // legend error between two similar months cancels rather than adds, so this
  // over-states the real difference error and the test errs toward rejection.
  const differenceFloor = Math.SQRT2 * rmse;
  const resolution: AerosolResolution =
    Math.abs(changeValue) > differenceFloor ? "resolved" : "unresolved";

  return {
    ...base,
    inversionRmse: rmse,
    differenceFloor,
    resolution,
    statement:
      resolution === "resolved"
        ? `Month-over-month column AOD change ${formatSignedNumber(changeValue)} exceeds the ${formatNumber(differenceFloor)} conservative inversion-difference floor, so its direction is distinguishable from colormap-inversion error; source ${sourceLabel()}.`
        : `Month-over-month column AOD change ${formatSignedNumber(changeValue)} is within the ${formatNumber(differenceFloor)} conservative inversion-difference floor, so this pipeline cannot separate it from colormap-inversion error; this does not assert that column loading was unchanged; source ${sourceLabel()}.`,
  };
}

/** Compact fixed-significant-figure format; keeps small AOD bands readable. */
function formatNumber(value: number): string {
  return Number(value.toPrecision(4)).toString();
}

function formatSignedNumber(value: number): string {
  return `${value >= 0 ? "+" : ""}${formatNumber(value)}`;
}

function sourceLabel(): string {
  return `${AEROSOL_SOURCE.shortName} v${AEROSOL_SOURCE.version}`;
}
