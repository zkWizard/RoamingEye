import { LAYERS, formatYm, type DatasetRef, type YearMonth } from "./timeline";
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

/** Native product unit. Kelvin is what MOD11C3 stores and what is exported. */
export const LAND_SURFACE_TEMPERATURE_NATIVE_UNIT = "K";

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
        : formatCelsius(toCelsius(later)),
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
 * Surface a sampling or source-mapping failure without relabeling it as an
 * observation of a cool surface. The card must never present "could not sample"
 * and "no heat" as the same thing.
 */
export function unavailableLstBoundaryReading(
  dataMonth: YearMonth
): LstPlaceInsightReading {
  return {
    id: LST_PLACE_METRIC.id,
    value: "Unavailable",
    detail: `${formatYm(dataMonth)} daytime land-surface temperature could not be sampled from the published source colormap; source ${sourceText()}; ${LST_CARD_SCOPE}`,
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
  const signed = `${delta >= 0 ? "+" : "-"}${formatCelsius(Math.abs(delta))}`;
  // The panel attaches no climatological baseline, and a one-month step in
  // surface temperature is dominated by the annual cycle at most latitudes, so
  // the difference is never presentable as a departure from normal.
  const seasonal = placeMonthStepNote(step)
    ? " (annual cycle not removed)"
    : "";
  return `${signed} vs ${earlierLabel}${seasonal}`;
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
  const percent = Math.round(validFraction * 100);
  const gap =
    validFraction < 1
      ? " — an optical clear-sky product, so cloud routinely leaves part of a boundary unobserved"
      : "";
  return `${percent}% sampled boundary coverage${gap}`;
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
