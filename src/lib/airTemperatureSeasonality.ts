import type { AirTemperatureAnnualCycle } from "./airTemperatureSeasonalCycle";
import type { ClimateMetric } from "./climate";
import type { DatasetRef } from "./timeline";

/**
 * Temperature seasonality of the mean annual 2 m air-temperature cycle — the
 * WorldClim bioclimatic variable BIO4.
 *
 * `airTemperatureSeasonalCycle` reports the mean annual *range*: the warmest
 * calendar month's mean minus the coldest's. That range is a two-point summary —
 * it sees only the extremes and is blind to the shape in between. Two very
 * different climates can share a range: a site that sits near its annual mean for
 * most of the year with two sharp shoulder months, and one that marches smoothly
 * and spends much of the year far from the mean. Continentality (Conrad) also
 * rests on that same two-point range.
 *
 * Temperature seasonality answers the complementary question using the *whole*
 * cycle: across all twelve calendar-month means, how spread out are they around
 * the annual mean? It is the standard deviation of the twelve monthly means, the
 * definition Hijmans et al. (2005) adopted as WorldClim's BIO4. WorldClim reports
 * it ×100 (so it can be stored as an integer number of centi-degrees), and this
 * module carries both the plain standard deviation and that ×100 convention.
 *
 * This helper consumes an already-validated mean annual cycle
 * ({@link describeAirTemperatureAnnualCycle}) and derives the spread of its
 * monthly means — no re-derivation of the cycle and no analog. A value is
 * produced only from a full twelve-month cycle; a partial cycle yields a
 * not-computed status with the cited provenance still attached, so a missing
 * month is never guessed at.
 *
 * Scientific honesty (kept in the code because callers will surface it):
 *  - The standard deviation is computed with the SAMPLE convention (n − 1
 *    denominator over the twelve monthly means), matching the widely used
 *    `dismo::biovars` reference implementation of BIO4. A population standard
 *    deviation (÷ n) would differ only slightly at n = 12; the choice is a
 *    documented constant, not a claim to reproduce any specific WorldClim grid
 *    cell.
 *  - A standard deviation is offset-invariant, so the spread of the monthly means
 *    in kelvin equals the spread in °C exactly; no unit conversion is needed and
 *    BIO4's ×100 value is simply 100 × the kelvin standard deviation.
 *  - The monthly means are a mean annual cycle over the SUPPLIED years only, not a
 *    30-year climate normal; the seasonality shifts with the years the record
 *    happens to contain.
 *  - Seasonality is a dispersion *descriptor*, not a measurement, a range, an
 *    amplitude, or a record. It complements the annual range rather than
 *    replacing it: the range fixes the extremes, this fixes the spread.
 *  - Values are area-mean MERRA-2 reanalysis at the sampled footprint and inherit
 *    its resolution and biases. Nothing here is a forecast, trend, external-
 *    baseline anomaly, attribution, or diagnosis.
 */

/** Calendar months that must be present before a seasonality is emitted. */
export const MONTHS_REQUIRED_FOR_SEASONALITY = 12;

/**
 * WorldClim's storage-convention multiplier for BIO4: the standard deviation of
 * the twelve monthly means is reported ×100 (centi-degrees) so it fits an
 * integer grid. Kept as a named constant, not a magic number.
 */
export const SEASONALITY_BIO4_SCALE = 100;

/** Honest scope limits shared by the temperature-seasonality descriptor. */
export const AIR_TEMPERATURE_SEASONALITY_LIMITATIONS = [
  "Temperature seasonality is the standard deviation of the twelve mean-annual-cycle monthly means (WorldClim BIO4), a dispersion descriptor, not a measurement, an annual range, or a record.",
  "The standard deviation uses the sample convention (n − 1 denominator over the twelve months), matching the dismo::biovars reference; a population standard deviation would differ only slightly at n = 12. The BIO4 value multiplies it by 100 (centi-degrees), WorldClim's storage convention.",
  "A standard deviation is offset-invariant, so the spread in kelvin equals the spread in °C exactly; the monthly means are a mean annual cycle over the supplied years only, not a 30-year climate normal, and shift with the years the record contains.",
  "Values are area-mean MERRA-2 reanalysis at the sampled footprint and inherit its resolution and biases; nothing here is a forecast, trend, external-baseline anomaly, attribution, or diagnosis.",
] as const;

export type AirTemperatureSeasonalityStatus =
  "available" | "insufficient-cycle";

export interface AirTemperatureSeasonality {
  kind: "air-temperature-seasonality-bio4";
  /** Explicitly prevents consumers from treating this as a forecast. */
  isForecast: false;
  status: AirTemperatureSeasonalityStatus;
  /** Cited MERRA-2 2 m air-temperature product; provenance is preserved. */
  metric: ClimateMetric;
  source: DatasetRef;
  /** Native unit of the underlying monthly means and the standard deviation. */
  nativeUnit: string;
  /** Calendar months that fed the standard deviation (12 when available). */
  monthsUsed: number;
  /**
   * Mean of the twelve monthly means, in kelvin — the centre the standard
   * deviation is measured around (equivalently WorldClim BIO1). Null when no
   * full cycle was supplied.
   */
  annualMeanKelvin: number | null;
  /**
   * Sample standard deviation (n − 1) of the twelve monthly means, in kelvin,
   * equivalently °C for a dispersion. Null unless a full cycle was supplied.
   */
  seasonalityKelvin: number | null;
  /**
   * WorldClim BIO4: the standard deviation ×100 (centi-degrees). Null unless a
   * full cycle was supplied. Numerically {@link SEASONALITY_BIO4_SCALE} ×
   * `seasonalityKelvin`.
   */
  bio4: number | null;
  limitations: readonly string[];
  /** Short machine-readable reason when no seasonality is produced; else null. */
  reason: string | null;
  /** Honest, provenance-tagged descriptor of the mean cycle only. */
  statement: string;
}

/**
 * Derive the temperature seasonality (WorldClim BIO4) of a mean annual 2 m
 * air-temperature cycle: the sample standard deviation of its twelve monthly
 * means, and that standard deviation ×100. Accepts the output of
 * {@link describeAirTemperatureAnnualCycle} so it reuses the same validated
 * monthly means rather than re-deriving them. A value is produced only from a
 * full twelve-month cycle; otherwise the descriptor returns a non-computed status
 * with the cited provenance still attached.
 */
export function describeAirTemperatureSeasonality(
  cycle: AirTemperatureAnnualCycle
): AirTemperatureSeasonality {
  const base = {
    kind: "air-temperature-seasonality-bio4" as const,
    isForecast: false as const,
    metric: cycle.metric,
    source: cycle.source,
    nativeUnit: cycle.nativeUnit,
    limitations: AIR_TEMPERATURE_SEASONALITY_LIMITATIONS,
  };

  // A full cycle is guaranteed to carry all twelve monthly means; the length
  // guard keeps this defensive even if an upstream status ever drifts.
  if (
    cycle.status !== "available" ||
    cycle.monthlyClimatology.length !== MONTHS_REQUIRED_FOR_SEASONALITY
  ) {
    return {
      ...base,
      status: "insufficient-cycle",
      monthsUsed: cycle.calendarMonthsCovered,
      annualMeanKelvin: null,
      seasonalityKelvin: null,
      bio4: null,
      reason: "cycle-not-full",
      statement: `No temperature seasonality (mean annual cycle incomplete: ${cycle.calendarMonthsCovered}/${MONTHS_REQUIRED_FOR_SEASONALITY} calendar months covered); source ${sourceLabel(
        cycle.source
      )}.`,
    };
  }

  const means = cycle.monthlyClimatology.map((entry) => entry.meanKelvin);
  const monthsUsed = means.length;
  const annualMeanKelvin =
    means.reduce((sum, value) => sum + value, 0) / monthsUsed;
  // Sample standard deviation (n − 1), the dismo::biovars convention for BIO4.
  const variance =
    means.reduce((sum, value) => sum + (value - annualMeanKelvin) ** 2, 0) /
    (monthsUsed - 1);
  const seasonalityKelvin = Math.sqrt(variance);
  const bio4 = SEASONALITY_BIO4_SCALE * seasonalityKelvin;

  return {
    ...base,
    status: "available",
    monthsUsed,
    annualMeanKelvin,
    seasonalityKelvin,
    bio4,
    reason: null,
    statement: `Temperature seasonality (WorldClim BIO4) ${formatNumber(
      bio4
    )} — a ${formatNumber(
      seasonalityKelvin
    )} K sample standard deviation of the twelve monthly means about a ${formatNumber(
      annualMeanKelvin
    )} K annual mean; dispersion over the supplied years, not a climate normal; source ${sourceLabel(
      cycle.source
    )}.`,
  };
}

function sourceLabel(source: DatasetRef): string {
  return `${source.shortName} v${source.version}`;
}

function formatNumber(value: number): string {
  return Number(value.toPrecision(5)).toString();
}
