import { LAYERS, formatYm, type DatasetRef, type YearMonth } from "./timeline";
import {
  LAND_SURFACE_TEMPERATURE_NATIVE_UNIT,
  LST_PUBLISHED_RAMP,
  lstBoundPrefix,
  lstRampBoundDirection,
  type LstBoundDirection,
} from "./lstRampCensoring";
import {
  placeMonthStep,
  placeMonthStepNote,
  placeMonthStepRefusal,
} from "./placeMonthStep";

/**
 * A source-aware daytime land-surface-temperature reading for the exact
 * boundary returned by place search.
 *
 * The temperature layer already renders MODIS/Terra MOD11C3 monthly daytime LST,
 * and the probe recovers native kelvin from GIBS's published ramp
 * (`MODIS_Land_Surface_Temp`, measured 0.3174 K RMSE over all 250 published
 * colours with zero rejections — `validation.MEASURED_INVERSION.lst`). What was
 * missing was a place-panel card: `lst` was the only calibrated layer with no
 * entry in the panel, so the app's only land-surface temperature reading was
 * reachable by probing an individual pixel.
 *
 * This module is the presentation seam. It turns one sampled boundary pair into
 * the panel's value/detail shape and adds no inference of its own.
 *
 * It is deliberately separate from the terrestrial `PLACE_METRICS` formatters,
 * for the same reason the marine and aerosol cards are. Those cards read
 * model-continuous GLDAS/MERRA-2 fields; this one reads an optical satellite
 * retrieval, and the three limits that forces are strong enough that sharing a
 * formatter would blur them:
 *
 *  - **LST is not air temperature.** It is the radiometric skin temperature of
 *    the ground, roof, or canopy the sensor sees. Over dry, sparsely vegetated
 *    surfaces at midday it routinely runs well above the 2 m air temperature the
 *    neighbouring card reports — the two are different quantities, not two
 *    measurements of one. The panel renders both, so this card says so.
 *  - **Daytime only, clear-sky only.** The rendered layer is
 *    `MODIS_Terra_L3_Land_Surface_Temp_Monthly_Day`: Terra's daytime overpass
 *    (near 10:30 local solar time), composited from clear-sky retrievals alone.
 *    A monthly mean of those is neither a diurnal mean nor an all-sky mean, and
 *    cloudy days are absent from it rather than averaged in.
 *  - **Land only.** The product carries no value over water.
 *
 * Because a value only exists where the sensor got a clear view, reduced
 * coverage over a boundary is an expected consequence of the observing system
 * — not a product defect and not a statement about the place. That is the
 * `observation-gated` gap mechanism `observabilityGating` classifies for the
 * panel's optical products; this card states it where the coverage number is
 * shown, and never attributes any particular gap to any particular cause.
 *
 * References:
 * Wan, Z. (2014). New refinements and validation of the collection-6 MODIS
 * land-surface temperature/emissivity product. Remote Sensing of Environment,
 * 140, 36–45.
 * Jin, M. & Dickinson, R. E. (2010). Land surface skin temperature climatology:
 * benefitting from the strengths of satellite observations. Environmental
 * Research Letters, 5(4), 044004.
 */

export const LST_PLACE_METRIC = {
  id: "lst",
  label: "Land surface temp (day)",
} as const;

export const LAND_SURFACE_TEMPERATURE_SOURCE: DatasetRef =
  requireLandSurfaceTemperatureSource();

function requireLandSurfaceTemperatureSource(): DatasetRef {
  const source = LAYERS.lst.dataset;
  if (!source) {
    throw new Error(
      "RoamingEye: land-surface-temperature layer must retain a cited dataset"
    );
  }
  return source;
}

/**
 * The published ramp and its terminal-bin classifier live in
 * `lstRampCensoring`, a leaf shared with the probe's status line — both
 * surfaces decode the same imagery through the same colormap, so they must
 * agree about which values are bounds. Re-exported here because this module
 * was their first consumer.
 */
export {
  LAND_SURFACE_TEMPERATURE_NATIVE_UNIT,
  LST_PUBLISHED_RAMP,
  lstRampBoundDirection,
  type LstBoundDirection,
};

/**
 * The scope limits every reading carries in its user-facing text. Kept to the
 * three readings a land-surface temperature most invites and cannot support:
 * that it is the air temperature, that it is a daily or all-sky mean, and that
 * it says something about water.
 */
const LST_CARD_SCOPE =
  "radiometric skin temperature of the land surface, not 2 m air temperature; clear-sky daytime overpass (Terra, near 10:30 local solar time) composited monthly, not a diurnal or all-sky mean; land only";

/**
 * Kelvin to Celsius is an exact −273.15 offset, not an estimate. The card shows
 * °C because the panel's neighbouring temperature cards do; the native kelvin
 * value is retained on the reading and is what the observation export records.
 */
const KELVIN_TO_CELSIUS_OFFSET = -273.15;

export interface LstBoundarySampleInput {
  /**
   * The two product months sampled, earlier first. A non-consecutive pair is
   * refused rather than differenced (see {@link placeMonthStep}).
   */
  months: readonly [YearMonth, YearMonth];
  /** Native kelvin per month, or null where no usable value was recovered. */
  observedValues: readonly [number | null, number | null];
  /** Share of the searched boundary yielding usable pixels, per month. */
  validFractions: readonly [number | null, number | null];
  /** Rendered source-image dimensions; provenance, never a resolution claim. */
  sourceImageDimensions?: { width: number; height: number };
}

export interface LstPlaceInsightReading {
  id: typeof LST_PLACE_METRIC.id;
  value: string;
  detail: string;
  kind: "observed-boundary-daytime-land-surface-temperature";
  isForecast: false;
  /** Skin temperature of the surface, never the 2 m air temperature. */
  airTemperatureObservation: false;
  /** A clear-sky daytime composite, never a full-diurnal or all-sky mean. */
  diurnalMean: false;
  /** The later of the two sampled months — the value shown on the card. */
  dataMonth: YearMonth;
  /** Native kelvin for `dataMonth`, or null when no usable value. */
  observedValueK: number | null;
  source: typeof LAND_SURFACE_TEMPERATURE_SOURCE;
}

/**
 * Format a boundary daytime-LST pair for the place panel.
 *
 * A month-over-month difference is reported only when both months are usable
 * and the pair is a genuine one-month step; otherwise the later month's value
 * is still shown with the reason stated, so a withheld comparison never becomes
 * a bare number that reads as unchanged.
 */
export function lstBoundaryTemperatureReading(
  input: LstBoundarySampleInput
): LstPlaceInsightReading {
  const laterMonth = input.months[1];
  const earlier = usableKelvin(input.observedValues[0]);
  const later = usableKelvin(input.observedValues[1]);

  return {
    id: LST_PLACE_METRIC.id,
    value:
      later === null
        ? "No usable LST observation"
        : `${lstBoundPrefix(lstRampBoundDirection(later))}${formatCelsius(toCelsius(later))}`,
    detail: detailFor(input, earlier, later),
    kind: "observed-boundary-daytime-land-surface-temperature",
    isForecast: false,
    airTemperatureObservation: false,
    diurnalMean: false,
    dataMonth: laterMonth,
    observedValueK: later,
    source: LAND_SURFACE_TEMPERATURE_SOURCE,
  };
}

/**
 * Which step failed, so the card attributes the failure where it belongs.
 *
 * The two are not interchangeable: only `source-colormap-unavailable` is a
 * statement about the published GIBS colormap document. Once that document has
 * loaded and parsed, a later failure lies in this app's sampling of the searched
 * boundary — tile retrieval, the boundary having no sampleable footprint, or
 * canvas decoding — and saying "the source colormap" then misattributes an
 * app-side or transport failure to the cited dataset. This repo cites its
 * sources; blaming one for a failure it did not cause is a provenance error.
 */
export type LstBoundaryUnavailableReason =
  "source-colormap-unavailable" | "boundary-sampling-failed";

/**
 * Surface a sampling or source-mapping failure without relabeling it as an
 * observation of a cool surface. The card must never present "could not sample"
 * and "no heat" as the same thing.
 */
export function unavailableLstBoundaryReading(
  dataMonth: YearMonth,
  reason: LstBoundaryUnavailableReason = "source-colormap-unavailable"
): LstPlaceInsightReading {
  const unavailableDetail =
    reason === "source-colormap-unavailable"
      ? "could not be sampled from the published source colormap"
      : "could not be sampled for the searched boundary";
  return {
    id: LST_PLACE_METRIC.id,
    value: "Unavailable",
    detail: `${formatYm(dataMonth)} daytime land-surface temperature ${unavailableDetail}; source ${sourceText()}; ${LST_CARD_SCOPE}`,
    kind: "observed-boundary-daytime-land-surface-temperature",
    isForecast: false,
    airTemperatureObservation: false,
    diurnalMean: false,
    dataMonth,
    observedValueK: null,
    source: LAND_SURFACE_TEMPERATURE_SOURCE,
  };
}

function detailFor(
  input: LstBoundarySampleInput,
  earlier: number | null,
  later: number | null
): string {
  const [earlierMonth, laterMonth] = input.months;
  const parts = [
    `${formatYm(laterMonth)} boundary-mean daytime land-surface temperature`,
  ];
  if (later === null) {
    parts.push("no usable value recovered for this boundary");
  }
  parts.push(comparisonText([earlierMonth, laterMonth], earlier, later));
  parts.push(coverageText(input.validFractions[1]));
  parts.push(imageProvenance(input.sourceImageDimensions));
  parts.push(`source ${sourceText()}`);
  parts.push(LST_CARD_SCOPE);
  return parts.join("; ");
}

/**
 * The month-over-month sentence. The pair the panel supplies is the last two
 * entries of the product's enumerated record, which is not guaranteed to be
 * adjacent, so the step is classified before anything is subtracted — the same
 * refusal every other place card applies.
 */
function comparisonText(
  months: [YearMonth, YearMonth],
  earlier: number | null,
  later: number | null
): string {
  const [earlierMonth, laterMonth] = months;
  const earlierLabel = formatYm(earlierMonth);
  const step = placeMonthStep(months);
  const refusal = placeMonthStepRefusal(step, earlierLabel);
  if (refusal !== null) return refusal;
  if (later === null || earlier === null) {
    const missing = earlier === null ? earlierLabel : formatYm(laterMonth);
    return `no comparison with ${earlierLabel} (no usable value for ${missing})`;
  }
  // Both endpoints carry the same exact −273.15 offset, so the difference is
  // identical in kelvin and in degrees Celsius. It is shown on the same scale
  // as the value above it.
  const delta = toCelsius(later) - toCelsius(earlier);
  // Either endpoint may be a censored terminal-bin reading rather than a
  // measurement. A bound on an endpoint carries into the difference with the
  // sign of the term it sits in: the later month enters positively, the earlier
  // negatively. When the two surviving bounds oppose, the difference is
  // unbounded in both directions and is withheld rather than shown as a number
  // that would read as a measured change.
  const push =
    boundPush(lstRampBoundDirection(later)) -
    boundPush(lstRampBoundDirection(earlier));
  const opposed =
    boundPush(lstRampBoundDirection(later)) !== 0 &&
    boundPush(lstRampBoundDirection(earlier)) !== 0 &&
    push === 0;
  if (opposed) {
    return `difference with ${earlierLabel} withheld (both months decoded into an open end bin of the published ramp, and their bounds oppose)`;
  }
  const signed = `${push > 0 ? "≥ " : push < 0 ? "≤ " : ""}${delta >= 0 ? "+" : "-"}${formatCelsius(Math.abs(delta))}`;
  // The panel attaches no climatological baseline, and a one-month step in
  // surface temperature is dominated by the annual cycle at most latitudes, so
  // the difference is never presentable as a departure from normal.
  const seasonal = placeMonthStepNote(step)
    ? " (annual cycle not removed)"
    : "";
  return `${signed} vs ${earlierLabel}${seasonal}`;
}

/**
 * Which way a censored endpoint pushes the true value relative to the decoded
 * one: +1 when the truth is at or above it, −1 when at or below, 0 when the
 * value is inside the finite ramp and needs no bound.
 */
function boundPush(direction: LstBoundDirection): number {
  return direction === "lower" ? 1 : direction === "upper" ? -1 : 0;
}

function usableKelvin(value: number | null): number | null {
  return value !== null && Number.isFinite(value) ? value : null;
}

function toCelsius(kelvin: number): number {
  return kelvin + KELVIN_TO_CELSIUS_OFFSET;
}

function formatCelsius(value: number): string {
  return `${value.toFixed(1)} °C`;
}

/**
 * Coverage, with the reason a shortfall is ordinary here. LST exists only where
 * the sensor got a clear view, so cloud leaves an optical monthly composite
 * partially covered as a matter of observing physics. Naming that class of
 * cause is a statement about the product, never an attribution of this
 * boundary's gap to any particular cause — the product's QA mask is the
 * authority on that.
 */
function coverageText(validFraction: number | null): string {
  if (
    validFraction === null ||
    !Number.isFinite(validFraction) ||
    validFraction < 0 ||
    validFraction > 1
  ) {
    return "sampled coverage not supplied";
  }
  // The clause and the number must answer to the same decision. Gating the
  // clause on `validFraction < 1` while rounding the number separately let a
  // sample print `100%` and a shortfall note in one breath, and let a sample
  // one representation error short of complete carry a note about a gap it
  // does not have.
  const gap = isCompleteCoverage(validFraction)
    ? ""
    : " — an optical clear-sky product, so cloud routinely leaves part of a boundary unobserved";
  return `${formatCoverageShare(validFraction)} sampled boundary coverage${gap}`;
}

/**
 * Complete coverage is a ratio of two compensated area sums, so a boundary the
 * sensor covered outright can land a representation error below one rather
 * than exactly on it. Treating such a share as complete keeps it out of the
 * bounded wording below, which exists for genuinely incomplete samples.
 */
const PERCENT_SNAP_EPSILON = 1e-9;

function isCompleteCoverage(fraction: number): boolean {
  return fraction >= 1 - PERCENT_SNAP_EPSILON;
}

/**
 * Whole percent, except at the two endpoints where nearest rounding would
 * state something the share does not say.
 *
 * Rounding an incomplete share to `100%` claims the boundary mean covers the
 * whole searched area when part of it went unobserved — and on this product
 * the unobserved part is the opposite of a random scatter. The rendered layer
 * composites clear-sky retrievals alone, so the missing share IS the cloudy
 * pixels, and cloud is associated with the cooler, wetter surface states it
 * hides. The share is therefore the only cue on the card that the mean is
 * drawn from a clear-sky subsample rather than the whole month; rounding it
 * away removes it, which is exactly what this module's header undertakes to
 * state "where the coverage number is shown".
 *
 * The floor case is the mirror. A positive share below half a percent rounds
 * to `0%`, which reads as a boundary the source never covered — but a positive
 * share is direct evidence it covered part of one and `weightedMeanValid`
 * declined to average what it got. `placeObservationExport` splits exactly
 * there, deriving `insufficient-valid-coverage` from a positive share and
 * reserving `source-no-data` for a zero one, so printing `0%` here would put
 * this card and the download it accompanies in disagreement about the same
 * month. A share of exactly zero keeps `0%` — there the card is reporting no
 * coverage, not contradicting itself.
 *
 * Both endpoint cases are written as bounds because that is what they are.
 * Shares away from the endpoints keep nearest rounding, which is the useful
 * reading of a known share. `aerosolPlaceInsight` states the same rule for the
 * same reason, and `marineBoundarySstSupport` the "<1%" half of it.
 */
function formatCoverageShare(fraction: number): string {
  if (fraction <= 0) return "0%";
  if (isCompleteCoverage(fraction)) return "100%";
  const percent = Math.round(fraction * 100);
  if (percent >= 100) return ">99%";
  if (percent <= 0) return "<1%";
  return `${percent}%`;
}

function imageProvenance(dimensions?: {
  width: number;
  height: number;
}): string {
  return dimensions
    ? `rendered source image ${dimensions.width} x ${dimensions.height} px`
    : "rendered source image dimensions not supplied";
}

function sourceText(): string {
  return `${LAND_SURFACE_TEMPERATURE_SOURCE.shortName} v${LAND_SURFACE_TEMPERATURE_SOURCE.version}`;
}
