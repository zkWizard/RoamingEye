import type { AirTemperatureAnnualCycle } from "./airTemperatureSeasonalCycle";
import type { ClimateMetric } from "./climate";
import type { DatasetRef } from "./timeline";

/**
 * Conrad's continentality index for the mean annual 2 m air-temperature cycle.
 *
 * `airTemperatureSeasonalCycle` reports the mean annual temperature range — the
 * warmest calendar month's mean minus the coldest's. That range is the raw
 * building block of continentality, but on its own it conflates two effects: a
 * high-latitude site swings widely between summer and winter simply because the
 * Sun does, while a mid-latitude interior swings widely because it is far from
 * the moderating ocean. Conrad (1946) separated the two by dividing the annual
 * range by a latitude term, calibrating the result so that an extreme oceanic
 * station reads near 0 and the most continental interior near 100.
 *
 * This module derives that dimensionless index for a probed point from an
 * already-validated mean annual cycle plus the point's latitude, and nothing
 * more. Conrad's `A` is defined as exactly the warmest-month-mean minus
 * coldest-month-mean, so the amplitude the annual-cycle helper already computes
 * is the faithful input — no re-derivation and no analog.
 *
 *   CCI = (1.7 · A) / sin(|φ| + 10°) − 14
 *
 * where `A` is the annual range in °C (numerically the kelvin amplitude, since a
 * difference of kelvins equals the same difference of °C) and `φ` is latitude.
 * The absolute latitude is used so the astronomical correction — which grows
 * with distance from the equator in either hemisphere — is symmetric and stays
 * well defined everywhere: |φ| + 10° lies in [10°, 100°], whose sine is always
 * ≥ sin(10°) > 0, so there is no pole-to-pole singularity to guard against.
 *
 * Scientific honesty (kept in the code because callers will surface it):
 *  - The index is an empirical, dimensionless *descriptor*, not a measurement.
 *    The 1.7 coefficient and −14 offset are Conrad's calibration constants, tuned
 *    so canonical oceanic stations sit near 0 and continental ones near 100; a
 *    very oceanic site can read slightly below 0.
 *  - It inherits every limitation of the underlying mean annual cycle: the range
 *    is a difference of climatological means over the SUPPLIED years only, not a
 *    30-year normal, and shifts with the years the record happens to contain.
 *  - Using |φ| generalizes Conrad's northern-hemisphere formula symmetrically to
 *    both hemispheres. Near the equator the small sin(10°) denominator strongly
 *    amplifies a small annual range, so tropical indices are sensitive and should
 *    be read with care.
 *  - The ordinal category is a conventional readability band, NOT a standardized
 *    classification; the numeric index is the reportable quantity. Band cutoffs
 *    are documented constants, not science.
 *  - Values are area-mean MERRA-2 reanalysis at the sampled footprint and inherit
 *    its resolution and biases. Nothing here is a forecast, trend, external
 *    anomaly, attribution, or diagnosis.
 */

/** Conrad's multiplier on the annual temperature range (°C). */
export const CONRAD_RANGE_COEFFICIENT = 1.7;
/** Conrad's additive offset, calibrating extreme-oceanic stations toward 0. */
export const CONRAD_OFFSET = 14;
/** Latitude offset (degrees) inside the astronomical-correction sine term. */
export const CONRAD_LATITUDE_OFFSET_DEGREES = 10;

/**
 * Conventional readability bands for the index. These cutoffs are a convenience,
 * not a standardized classification; literature bands vary and the raw index is
 * the reportable quantity. Ordered maritime → continental.
 */
export const CONTINENTALITY_CATEGORY_CUTOFFS = {
  /** Below this, effectively oceanic (ocean-moderated seasonal range). */
  oceanic: 25,
  /** Below this but not oceanic: sub-oceanic / transitional-maritime. */
  subOceanic: 50,
  /** Below this but not sub-oceanic: sub-continental / transitional-interior. */
  subContinental: 75,
} as const;

export type ContinentalityCategory =
  "oceanic" | "sub-oceanic" | "sub-continental" | "continental";

export type ContinentalityStatus =
  "available" | "insufficient-cycle" | "invalid-latitude";

/** Honest scope limits shared by the continentality descriptor. */
export const AIR_TEMPERATURE_CONTINENTALITY_LIMITATIONS = [
  "Conrad's continentality index is an empirical, dimensionless descriptor, not a measurement; the 1.7 coefficient and 14 offset are calibration constants placing extreme-oceanic sites near 0 and continental ones near 100.",
  "The annual range is the warmest-month-mean minus coldest-month-mean over the supplied years only, not a 30-year climate normal; it shifts with the years the record contains.",
  "Absolute latitude generalizes Conrad's northern-hemisphere formula symmetrically to both hemispheres; near the equator the small denominator amplifies the range, so tropical indices are sensitive.",
  "The ordinal category is a conventional readability band, not a standardized classification; the numeric index is the reportable quantity.",
  "Values are area-mean MERRA-2 reanalysis at the sampled footprint and inherit its resolution and biases; nothing here is a forecast, trend, external-baseline anomaly, attribution, or diagnosis.",
] as const;

export interface AirTemperatureContinentality {
  kind: "air-temperature-continentality-index";
  /** Explicitly prevents consumers from treating this as a forecast. */
  isForecast: false;
  status: ContinentalityStatus;
  /** Cited MERRA-2 2 m air-temperature product; provenance is preserved. */
  metric: ClimateMetric;
  source: DatasetRef;
  /** Native unit of the annual range referenced here. */
  nativeUnit: string;
  /** Latitude used for the correction, in degrees; null when invalid. */
  latitudeDegrees: number | null;
  /**
   * Mean annual temperature range (warmest-month mean − coldest-month mean), in
   * kelvin, equivalently °C for a difference. Null when no full cycle was given.
   */
  annualRangeKelvin: number | null;
  /** Conrad's continentality index (dimensionless); null when not computable. */
  conradIndex: number | null;
  /** Conventional ordinal band; null when the index is not computed. */
  category: ContinentalityCategory | null;
  limitations: readonly string[];
  /** Short machine-readable reason when no index is produced; else null. */
  reason: string | null;
  /** Honest, provenance-tagged descriptor of the mean cycle only. */
  statement: string;
}

/**
 * Derive Conrad's continentality index from a mean annual 2 m air-temperature
 * cycle and the probed point's latitude. Accepts the output of
 * {@link describeAirTemperatureAnnualCycle} so it reuses the same validated
 * amplitude rather than re-deriving it. An index is produced only from a full
 * twelve-month cycle (`amplitudeKelvin !== null`) and a physical latitude in
 * [-90, 90]; otherwise the descriptor returns a non-computed status with the
 * cited provenance still attached.
 */
export function describeAirTemperatureContinentality(
  cycle: AirTemperatureAnnualCycle,
  latitudeDegrees: number
): AirTemperatureContinentality {
  const base = {
    kind: "air-temperature-continentality-index" as const,
    isForecast: false as const,
    metric: cycle.metric,
    source: cycle.source,
    nativeUnit: cycle.nativeUnit,
    limitations: AIR_TEMPERATURE_CONTINENTALITY_LIMITATIONS,
  };

  if (cycle.status !== "available" || cycle.amplitudeKelvin === null) {
    return {
      ...base,
      status: "insufficient-cycle",
      latitudeDegrees: null,
      annualRangeKelvin: null,
      conradIndex: null,
      category: null,
      reason: "cycle-not-full",
      statement: `No continentality index (mean annual cycle incomplete: ${cycle.calendarMonthsCovered}/12 calendar months covered); source ${sourceLabel(
        cycle.source
      )}.`,
    };
  }

  if (!isValidLatitude(latitudeDegrees)) {
    return {
      ...base,
      status: "invalid-latitude",
      latitudeDegrees: null,
      annualRangeKelvin: cycle.amplitudeKelvin,
      conradIndex: null,
      category: null,
      reason: "invalid-latitude",
      statement: `No continentality index (latitude ${String(
        latitudeDegrees
      )} is not a value in [-90, 90]); source ${sourceLabel(cycle.source)}.`,
    };
  }

  const annualRangeKelvin = cycle.amplitudeKelvin;
  // Conrad's correction uses the astronomical seasonality term sin(|φ| + 10°),
  // which grows with distance from the equator. Using |φ| keeps it symmetric
  // across hemispheres and always positive, so the index is defined everywhere.
  const latitudeTerm = Math.sin(
    ((Math.abs(latitudeDegrees) + CONRAD_LATITUDE_OFFSET_DEGREES) * Math.PI) /
      180
  );
  const conradIndex =
    (CONRAD_RANGE_COEFFICIENT * annualRangeKelvin) / latitudeTerm -
    CONRAD_OFFSET;
  const category = categorize(conradIndex);

  return {
    ...base,
    status: "available",
    latitudeDegrees,
    annualRangeKelvin,
    conradIndex,
    category,
    reason: null,
    statement: `Conrad continentality index ${formatNumber(
      conradIndex
    )} (${categoryLabel(category)}) from a ${formatNumber(
      annualRangeKelvin
    )} K mean annual temperature range at ${formatNumber(
      Math.abs(latitudeDegrees)
    )}° latitude; empirical index over the supplied years, not a climate normal; source ${sourceLabel(
      cycle.source
    )}.`,
  };
}

function categorize(conradIndex: number): ContinentalityCategory {
  if (conradIndex < CONTINENTALITY_CATEGORY_CUTOFFS.oceanic) return "oceanic";
  if (conradIndex < CONTINENTALITY_CATEGORY_CUTOFFS.subOceanic) {
    return "sub-oceanic";
  }
  if (conradIndex < CONTINENTALITY_CATEGORY_CUTOFFS.subContinental) {
    return "sub-continental";
  }
  return "continental";
}

function categoryLabel(category: ContinentalityCategory): string {
  switch (category) {
    case "oceanic":
      return "oceanic";
    case "sub-oceanic":
      return "sub-oceanic";
    case "sub-continental":
      return "sub-continental";
    case "continental":
      return "continental";
  }
}

function isValidLatitude(latitudeDegrees: number): boolean {
  return (
    Number.isFinite(latitudeDegrees) &&
    latitudeDegrees >= -90 &&
    latitudeDegrees <= 90
  );
}

function sourceLabel(source: DatasetRef): string {
  return `${source.shortName} v${source.version}`;
}

function formatNumber(value: number): string {
  return Number(value.toPrecision(5)).toString();
}
