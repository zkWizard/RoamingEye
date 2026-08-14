import { inversionUncertaintyForLayer } from "./briefValueUncertainty";
import { conventionalUnitConversionFor } from "./climateConventionalUnits";
import type { DatasetRef } from "./timeline";

/**
 * Whether a month-over-month change in 2 m air temperature survives the
 * pipeline's own measured colormap-inversion error.
 *
 * The place readout prints a signed month-over-month difference for every
 * climate metric. Neither month was measured: each is a rendered GIBS pixel
 * colour inverted through an approximate legend gradient, and that inversion
 * has a *measured* end-to-end RMSE for the air-temperature layer (METHODS §3,
 * docs/validation.md; the CI-asserted figure lives in `MEASURED_INVERSION` and
 * is read here at runtime, never copied). Differencing two independently
 * inverted months adds their errors in quadrature, so the floor is
 * `sqrt(2) x RMSE` — about 0.69 K at the currently measured 0.485 K.
 *
 * Two facts make this worth stating, and neither is visible on the line today.
 *
 * The first is that the floor is *unit-invariant here*. The readout converts
 * kelvin to Celsius, and unlike every other conversion in this module's
 * neighbourhood that conversion is a pure offset (scale 1, see
 * `conventionalUnitConversionFor`). A temperature *difference* is therefore the
 * same number in K and in °C, so the published kelvin error applies to the
 * printed Celsius difference unchanged, with no conversion step to prompt the
 * comparison. That is precisely why the two numbers have never been related:
 * for precipitation the units visibly differ and the mismatch is conspicuous,
 * whereas here the error and the difference are already commensurate.
 *
 * The second is that a sub-floor difference is not a corner case. Month-over-
 * month air temperature swings by several K mid-season at middle and high
 * latitudes, which makes a 0.485 K inversion error look irrelevant. But the
 * month-over-month difference passes through zero twice a year at every
 * location by construction — at the seasonal maximum and the seasonal minimum,
 * consecutive months sit at nearly the same temperature — and in the deep
 * tropics the whole annual cycle spans only one to two K, so adjacent-month
 * steps sit near or below the floor year-round. The readout renders the
 * difference to five significant figures, so today a reader can be shown
 * "+0.23457 °C" for a difference the pipeline cannot distinguish from its own
 * inversion noise.
 *
 * This module reports provenance and a documented error figure only. It never
 * re-derives an error, re-states a value, moves a threshold, or infers any
 * anomaly, normal, trend, cause, or forecast.
 *
 * Two honesty rules are load-bearing:
 *  - `unresolved` says the comparison is *not distinguishable* from inversion
 *    error. It never asserts the two months were equally warm, and it never
 *    reverses or removes the reported difference.
 *  - The floor treats the two months' inversion errors as independent, which is
 *    the conservative direction. Two months of similar rendered colour invert
 *    through the same legend and their errors largely cancel, so the true
 *    difference error is smaller and the floor over-rejects rather than
 *    over-claims.
 */

/**
 * The native unit the published air-temperature inversion RMSE is documented
 * in. Held as a literal rather than read from the conversion tables so that a
 * change to the layer's reported unit makes this module withhold a floor
 * instead of silently comparing a kelvin error against a differently-scaled
 * difference.
 */
export const AIR_TEMPERATURE_INVERSION_UNIT = "K" as const;

/** The climate metric whose difference this module is scoped to describe. */
export const AIR_TEMPERATURE_METRIC_ID = "air-temperature-2m" as const;

/** Honest scope limits for the air-temperature difference floor. */
export const AIR_TEMPERATURE_CHANGE_RESOLVABILITY_LIMITATIONS = [
  "Resolvability is measured against the pipeline's end-to-end colormap-inversion RMSE (METHODS §3, docs/validation.md), not against MERRA-2's own validation of 2 m air temperature.",
  "The RMSE is a single figure aggregated over the whole rendered ramp, not a per-value 1-sigma error bar; the true error at any single temperature may be larger or smaller, and it is not assumed Gaussian.",
  "An unresolved difference does not assert that the two months were equally warm, and it does not remove or reverse the reported difference; it says only that this pipeline cannot separate the comparison from its own inversion error.",
  "The floor treats the two months' inversion errors as independent. Months of similar rendered temperature invert through the same legend and their errors largely cancel, so the floor is conservative and rejects some real differences.",
  "The floor bounds inversion error alone. It is not added to the reanalysis product's own air-temperature error, and it says nothing about the coverage or sampling differences the readout discloses separately.",
] as const;

/** Whether an air-temperature comparison survives the measured inversion error. */
export type AirTemperatureChangeResolution =
  /** The difference is larger than the conservative inversion-difference floor. */
  | "resolved"
  /** The difference is inside the floor; the comparison is inside the error. */
  | "unresolved"
  /** No measured inversion figure in the expected unit; never invented. */
  | "uncharacterized";

export interface AirTemperatureChangeResolvability {
  kind: "air-temperature-change-resolvability";
  /** Explicitly prevents consumers from treating this as a forecast. */
  isForecast: false;
  source: DatasetRef;
  /**
   * Unit of every temperature difference reported here. A difference in K and
   * the same difference in °C are the same number, because the conversion is an
   * offset; the kelvin label is kept because that is the unit the published
   * error is documented in.
   */
  unit: "K";
  /** The supplied later-minus-earlier difference, unchanged. */
  changeK: number;
  /** Measured inversion RMSE on a single month, in K; null when uncharacterized. */
  monthRmseK: number | null;
  /**
   * Conservative noise floor for a difference of two independently inverted
   * months: `sqrt(2) x RMSE`. Null when uncharacterized.
   */
  differenceFloorK: number | null;
  resolution: AirTemperatureChangeResolution;
  /** Honest, source-carrying sentence; never asserts the months were equal. */
  statement: string;
  limitations: readonly string[];
}

/**
 * The measured air-temperature inversion RMSE in K, or null when the layer
 * carries no measured figure, when the published figure is no longer documented
 * in K, or when the kelvin-to-Celsius conversion has stopped being offset-only.
 *
 * That last guard is the load-bearing one. This module compares a kelvin error
 * against a difference the readout prints in °C, and that is licensed *only*
 * because the conversion applies no scale. Were a scale ever introduced, the
 * two would no longer be commensurate, so the floor is withheld rather than
 * applied to a difference it no longer describes.
 *
 * Exported because the same licence underwrites a second claim on the same
 * readout: the rounding place the error justifies for the *absolute* monthly
 * mean, which the place panel qualifies alongside the difference floor. Both
 * set a kelvin error beside a Celsius number, so both must fail closed on the
 * one condition that permits it, from a single definition rather than two
 * copies that could drift apart.
 */
export function airTemperatureInversionRmseK(): number | null {
  const conversion = conventionalUnitConversionFor(AIR_TEMPERATURE_METRIC_ID);
  if (conversion === null || conversion.scale !== 1) return null;

  const measured = inversionUncertaintyForLayer(
    "airtemp",
    AIR_TEMPERATURE_INVERSION_UNIT
  );
  if (measured === null) return null;
  if (measured.reportedUnit !== AIR_TEMPERATURE_INVERSION_UNIT) return null;
  return measured.reportedRmse;
}

/**
 * Describe whether a month-over-month 2 m air-temperature difference is larger
 * than the error this pipeline's own colormap inversion introduces into a
 * difference of two independently inverted months.
 *
 * `changeK` is a later-minus-earlier difference in kelvin (equivalently, in °C
 * — the conversion is an offset). Returns null when no finite difference was
 * supplied, so no caller reads a verdict off a missing comparison.
 */
export function describeAirTemperatureChangeResolvability(
  changeK: number | null,
  source: DatasetRef
): AirTemperatureChangeResolvability | null {
  if (changeK === null || !Number.isFinite(changeK)) return null;

  const monthRmseK = airTemperatureInversionRmseK();
  const base = {
    kind: "air-temperature-change-resolvability" as const,
    isForecast: false as const,
    source,
    unit: AIR_TEMPERATURE_INVERSION_UNIT,
    changeK,
    limitations: AIR_TEMPERATURE_CHANGE_RESOLVABILITY_LIMITATIONS,
  };

  if (monthRmseK === null) {
    return {
      ...base,
      monthRmseK: null,
      differenceFloorK: null,
      resolution: "uncharacterized",
      statement: `Month-over-month 2 m air temperature change ${formatSignedNumber(changeK)} K; no measured end-to-end colormap-inversion figure is available for this layer in ${AIR_TEMPERATURE_INVERSION_UNIT}, so the difference is not tested against a noise floor; source ${sourceLabel(source)}.`,
    };
  }

  // Independent errors add in quadrature. Both months integrate nothing and
  // carry the same single-month error, so the general
  // `RMSE x sqrt(f_a^2 + f_b^2)` form collapses to sqrt(2) x RMSE here.
  const differenceFloorK = Math.SQRT2 * monthRmseK;
  const resolution: AirTemperatureChangeResolution =
    Math.abs(changeK) > differenceFloorK ? "resolved" : "unresolved";

  return {
    ...base,
    monthRmseK,
    differenceFloorK,
    resolution,
    statement:
      resolution === "resolved"
        ? `Month-over-month 2 m air temperature change ${formatSignedNumber(changeK)} K exceeds the ${formatNumber(differenceFloorK)} K conservative inversion-difference floor, so it is distinguishable from colormap-inversion error; source ${sourceLabel(source)}.`
        : `Month-over-month 2 m air temperature change ${formatSignedNumber(changeK)} K is within the ${formatNumber(differenceFloorK)} K conservative inversion-difference floor, so this pipeline cannot separate it from colormap-inversion error; this does not assert that the two months were equally warm; source ${sourceLabel(source)}.`,
  };
}

/** Compact fixed-significant-figure format; keeps small differences readable. */
function formatNumber(value: number): string {
  return Number(value.toPrecision(4)).toString();
}

function formatSignedNumber(value: number): string {
  return `${value >= 0 ? "+" : ""}${formatNumber(value)}`;
}

function sourceLabel(source: DatasetRef): string {
  return `${source.shortName} v${source.version}`;
}
