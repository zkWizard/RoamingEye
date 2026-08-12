/**
 * USGS magnitude-scale vocabulary for reported seismic magnitudes.
 *
 * The USGS summary feed reports one magnitude value per event together with the
 * method that produced it (GeoJSON `properties.magType`). Those methods are not
 * interchangeable. Each is calibrated over a limited magnitude range, and some
 * saturate: past a certain size the measured wave amplitude stops growing with
 * the true size of the source, so the reported value understates the event. A
 * seismicity readout that prints a bare "M 6.6" therefore mixes measurements
 * that mean different things, and silently under-reports large events whose
 * magnitude came from a saturating scale.
 *
 * This module names the scale a value was measured on and surfaces the ranges
 * and saturation caveats USGS publishes for it. It deliberately converts
 * nothing between scales: no exact conversion exists, and computing one would
 * fabricate a measurement the feed never reported. Codes outside the published
 * vocabulary stay unrecognized and are preserved verbatim rather than guessed.
 *
 * Source: USGS "Magnitude Types"
 * (https://www.usgs.gov/programs/earthquake-hazards/magnitude-types)
 */

export const MAGNITUDE_SCALE_SOURCE = {
  name: 'USGS Earthquake Hazards Program, "Magnitude Types"',
  url: "https://www.usgs.gov/programs/earthquake-hazards/magnitude-types",
} as const;

/** The measurement approach a scale belongs to, grouping related codes. */
export type MagnitudeScaleFamily =
  | "moment"
  | "body-wave"
  | "surface-wave"
  | "local"
  | "duration"
  | "energy"
  | "macroseismic"
  | "non-standard";

export interface MagnitudeScale {
  /** Lower-cased canonical lookup key, as the feed spells it (e.g. "mww"). */
  code: string;
  /** Conventional display form of the code (e.g. "Mww", "mb", "Ms_20"). */
  label: string;
  /** The measurement method, named as USGS names it. */
  method: string;
  family: MagnitudeScaleFamily;
  /**
   * Magnitude range USGS publishes as applicable for the method. A null bound
   * means USGS publishes no bound on that side, not an unbounded scale.
   */
  applicableRange: { min: number | null; max: number | null };
  /**
   * Magnitude at or above which USGS states the scale "tends to saturate", so
   * reported values understate true size. Null when USGS publishes no
   * saturation point for the method — that is an absence of a published value,
   * not evidence the scale never saturates.
   */
  saturationMagnitude: number | null;
  /**
   * Magnitude at or above which USGS states source complexity or dimension
   * limits the method's applicability. Distinct from saturation: the method
   * becomes unsuitable rather than systematically low. Null when none published.
   */
  applicabilityLimitMagnitude: number | null;
}

/**
 * The published vocabulary, keyed by canonical code. Every range and threshold
 * is transcribed from the USGS table; entries carry null where USGS states no
 * value rather than a substituted default.
 */
const SCALES: readonly MagnitudeScale[] = [
  {
    code: "mww",
    label: "Mww",
    method: "moment magnitude (W-phase)",
    family: "moment",
    applicableRange: { min: 5.0, max: null },
    saturationMagnitude: null,
    applicabilityLimitMagnitude: null,
  },
  {
    code: "mwc",
    label: "Mwc",
    method: "moment magnitude (centroid moment tensor)",
    family: "moment",
    applicableRange: { min: 5.5, max: null },
    saturationMagnitude: null,
    applicabilityLimitMagnitude: null,
  },
  {
    code: "mwb",
    label: "Mwb",
    method: "moment magnitude (teleseismic body wave)",
    family: "moment",
    applicableRange: { min: 5.5, max: 7.0 },
    saturationMagnitude: null,
    applicabilityLimitMagnitude: 7.5,
  },
  {
    code: "mwr",
    label: "Mwr",
    method: "moment magnitude (regional)",
    family: "moment",
    applicableRange: { min: 4.0, max: 6.5 },
    saturationMagnitude: null,
    applicabilityLimitMagnitude: 7.0,
  },
  {
    // The generic moment-magnitude form. USGS publishes ranges for the specific
    // Mww/Mwc/Mwb/Mwr methods rather than for the unqualified code, so both
    // bounds stay null here instead of borrowing another method's numbers.
    code: "mw",
    label: "Mw",
    method: "moment magnitude (method unqualified)",
    family: "moment",
    applicableRange: { min: null, max: null },
    saturationMagnitude: null,
    applicabilityLimitMagnitude: null,
  },
  {
    code: "ms_20",
    label: "Ms_20",
    method: "20-second surface-wave magnitude",
    family: "surface-wave",
    applicableRange: { min: 5.0, max: 8.5 },
    saturationMagnitude: 8.3,
    applicabilityLimitMagnitude: null,
  },
  {
    code: "mb",
    label: "mb",
    method: "short-period body-wave magnitude",
    family: "body-wave",
    applicableRange: { min: 4.0, max: 6.5 },
    saturationMagnitude: 6.5,
    applicabilityLimitMagnitude: null,
  },
  {
    code: "ml",
    label: "ml",
    method: "local magnitude",
    family: "local",
    applicableRange: { min: 2.0, max: 6.5 },
    saturationMagnitude: null,
    applicabilityLimitMagnitude: null,
  },
  {
    code: "mb_lg",
    label: "mb_Lg",
    method: "short-period Lg surface-wave magnitude",
    family: "surface-wave",
    applicableRange: { min: 3.5, max: 7.0 },
    saturationMagnitude: null,
    applicabilityLimitMagnitude: null,
  },
  {
    code: "md",
    label: "md",
    method: "duration magnitude",
    family: "duration",
    applicableRange: { min: null, max: 4.0 },
    saturationMagnitude: null,
    applicabilityLimitMagnitude: null,
  },
  {
    code: "mwp",
    label: "Mwp",
    method: "integrated P-wave magnitude",
    family: "body-wave",
    applicableRange: { min: 5.0, max: 8.0 },
    saturationMagnitude: null,
    applicabilityLimitMagnitude: null,
  },
  {
    code: "me",
    label: "Me",
    method: "energy magnitude",
    family: "energy",
    applicableRange: { min: 3.5, max: null },
    saturationMagnitude: null,
    applicabilityLimitMagnitude: null,
  },
  {
    code: "mfa",
    label: "Mfa",
    method: "felt-area magnitude",
    family: "macroseismic",
    applicableRange: { min: null, max: null },
    saturationMagnitude: null,
    applicabilityLimitMagnitude: null,
  },
  {
    code: "mint",
    label: "Mint",
    method: "intensity magnitude",
    family: "macroseismic",
    applicableRange: { min: null, max: null },
    saturationMagnitude: null,
    applicabilityLimitMagnitude: null,
  },
  {
    code: "mh",
    label: "Mh",
    method: "non-standard magnitude (temporary designation)",
    family: "non-standard",
    applicableRange: { min: null, max: null },
    saturationMagnitude: null,
    applicabilityLimitMagnitude: null,
  },
] as const;

/**
 * Spellings USGS lists as equivalent for one method, mapped to its canonical
 * code. Only documented equivalences appear here; near-misses are left
 * unrecognized so an unfamiliar code is never silently folded into a scale.
 */
const CODE_ALIASES: Readonly<Record<string, string>> = {
  ms: "ms_20",
  ms20: "ms_20",
  mblg: "mb_lg",
  mlg: "mb_lg",
  mi: "mwp",
};

const BY_CODE: ReadonlyMap<string, MagnitudeScale> = new Map(
  SCALES.map((scale) => [scale.code, scale])
);

/** Every published scale, in USGS table order, for deterministic iteration. */
export const MAGNITUDE_SCALES: readonly MagnitudeScale[] = SCALES;

/**
 * Resolve a feed-reported magnitude type to its published scale. Returns null
 * for absent, blank, or unrecognized codes so callers can report the raw string
 * verbatim instead of attributing it to a method USGS never named.
 */
export function magnitudeScale(
  magnitudeType: string | null | undefined
): MagnitudeScale | null {
  if (typeof magnitudeType !== "string") return null;
  const normalized = magnitudeType.trim().toLowerCase();
  if (normalized === "") return null;
  return BY_CODE.get(CODE_ALIASES[normalized] ?? normalized) ?? null;
}

/**
 * How a reported value sits against its scale's published limits.
 *
 * - `at-or-above-saturation`: the scale saturates here, so the value is a lower
 *   bound on true size rather than a measurement of it.
 * - `above-published-applicability`: source complexity makes the method
 *   unsuitable at this size; the value's direction of error is not published.
 * - `above-published-range` / `below-published-range`: outside the calibrated
 *   range with no separate saturation or applicability statement.
 * - `within-published-range`: inside the published range.
 * - `no-published-range`: the scale resolved but USGS publishes no bounds.
 */
export type MagnitudeRangeState =
  | "at-or-above-saturation"
  | "above-published-applicability"
  | "above-published-range"
  | "below-published-range"
  | "within-published-range"
  | "no-published-range";

/**
 * Classify a reported magnitude against its scale's published limits. Ordered
 * most to least consequential: saturation is reported ahead of a bare range
 * exceedance because it carries a known direction of error.
 *
 * This is a statement about the measurement method's published limits, not
 * about the earthquake's effects, and never a corrected magnitude.
 */
export function magnitudeRangeState(
  magnitude: number,
  scale: MagnitudeScale | null
): MagnitudeRangeState | null {
  if (!Number.isFinite(magnitude) || scale === null) return null;
  const { min, max } = scale.applicableRange;
  if (
    scale.saturationMagnitude !== null &&
    magnitude >= scale.saturationMagnitude
  ) {
    return "at-or-above-saturation";
  }
  if (
    scale.applicabilityLimitMagnitude !== null &&
    magnitude >= scale.applicabilityLimitMagnitude
  ) {
    return "above-published-applicability";
  }
  if (max !== null && magnitude > max) return "above-published-range";
  if (min !== null && magnitude < min) return "below-published-range";
  if (min === null && max === null) return "no-published-range";
  return "within-published-range";
}

/**
 * Compact attribution for a reported magnitude, naming the scale it was
 * measured on and flagging a saturated value as a lower bound. Unrecognized or
 * absent types fall back to the reported value alone, so no readout implies a
 * method the feed did not supply.
 */
export function formatReportedMagnitude(
  magnitude: number,
  magnitudeType: string | null | undefined
): string {
  const scale = magnitudeScale(magnitudeType);
  if (scale === null) return `M ${magnitude} (reported)`;
  const state = magnitudeRangeState(magnitude, scale);
  if (state === "at-or-above-saturation") {
    return `M ${magnitude} (${scale.label}, reported; ${scale.label} saturates at this size — a lower bound)`;
  }
  return `M ${magnitude} (${scale.label}, reported)`;
}

/** Limits that travel with any summary built on this vocabulary. */
export const MAGNITUDE_SCALE_LIMITATIONS = [
  "Names the magnitude method a value was reported on; magnitudes from different methods are not directly comparable.",
  "Converts nothing between scales — no exact conversion is published.",
  "Ranges and saturation points are transcribed from the USGS magnitude-types table; a null threshold means USGS publishes none, not that the scale never saturates.",
  "Describes the measurement method's published limits, never ground shaking, damage, or hazard.",
] as const;
