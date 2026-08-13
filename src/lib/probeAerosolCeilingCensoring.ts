import {
  AEROSOL_RENDERED_RAMP_MAX,
  AEROSOL_SOURCE,
  AEROSOL_WAVELENGTH_NM,
} from "./aerosolLoading";
import { COLORMAP_DOCS } from "./colormap";
import { PROBE_SCALES, quantizationStep } from "./probe";
import type { DatasetRef, LayerId } from "./timeline";

/**
 * How the published aerosol colormap bounds the *summary statistics* of a
 * probed series.
 *
 * The probe's status line reports `min … mean … max` over the sampled months.
 * For sea surface temperature those are already marked as bounds where the
 * ramp's open caps censor them (see probeSstExtremeCensoring). Aerosol optical
 * depth has the same problem at one end and had no such marking: GIBS renders
 * MERRA-2 total aerosol optical thickness with bins running 0.000–0.900 whose
 * final bin is OPEN (`≥ 0.900`), so every column loading at or above 0.9 is
 * painted in a single terminal colour. Heavy dust outbreaks and biomass-burning
 * plumes routinely exceed it — a true column AOD of 0.9 and one of 3.0 invert
 * to the same number — so the reported maximum of a Sahel, Sahara, Gangetic or
 * boreal-fire record is a lower bound presented as a measurement.
 *
 * Only the CEILING censors here, and that asymmetry is load-bearing. The ramp's
 * low end is closed at 0 and column AOD cannot be negative, so a clean-column
 * month decodes to a genuine two-sided estimate: `min` is left exactly as it
 * was. The mean is different — it contains the capped month, and because there
 * is only one open cap the bias has an unambiguous direction (a substituted cap
 * can only raise it), so the mean is a lower bound whenever any month is capped.
 * That is a stronger statement than SST can make, where two opposing caps leave
 * the mean bounded in neither direction.
 *
 * The clause names the trend as well. An enumeration that says which statistics
 * are bounds reads as a claim that the ones it omits are not, and the trend a
 * few fields earlier on the same line is fitted over this very series.
 *
 * This module recovers nothing: the information is gone from the imagery. It
 * names which reported statistics are bounds and in which direction. It is a
 * statement about the rendered colour ramp only — no surface air quality,
 * health, exposure, hazard, causal, or forecast claim follows from it.
 */

/**
 * The decoded value at or above which a sample is indistinguishable from one
 * the ramp's open top bin collapsed.
 *
 * Deliberately the *decode* ceiling, one quantization step below
 * `AEROSOL_RENDERED_RAMP_MAX` (0.9), and the two are not interchangeable:
 * `parseColormapEntries` drops the open-ended `≥ 0.900` cap and keeps only the
 * finite bins, whose topmost value is 0.8975, so an inverted sample can never
 * reach 0.9 and a test against 0.9 would never fire. This is the same
 * derivation, for the same reason, that `aerosolPlaceInsight` screens its
 * boundary samples with; it is re-derived from `PROBE_SCALES` rather than a
 * literal so a scale edit cannot silently desync it from the values the probe
 * actually produces.
 */
export const AEROSOL_PROBE_DECODE_CEILING =
  AEROSOL_RENDERED_RAMP_MAX - quantizationStep(PROBE_SCALES.aerosol);

/** Which way a censored statistic can be wrong; null when it is not censored. */
export type AerosolCeilingBound = "lower" | null;

export interface ProbeAerosolCeilingCensoring {
  kind: "probe-aerosol-ceiling-censoring";
  /** A colour-ramp statement, never a surface air-quality one. */
  airQualityObservation: false;
  isForecast: false;
  /** False for every layer but aerosol, and for a series with no usable value. */
  applicable: boolean;
  /** Sampled months decoded into the ramp's open top bin. */
  ceilingMonthCount: number;
  /** Months carrying a usable value — the denominator for the count above. */
  observedMonthCount: number;
  /** "lower" when the heaviest sampled month rests on the open top bin. */
  maxBound: AerosolCeilingBound;
  /** "lower" when any sampled month rests on it; the bias cannot go the other way. */
  meanBound: AerosolCeilingBound;
  /** Native-value bound the colormap's final bin opens at. */
  rampMax: number;
  /** Decoded value at or above which a sample is treated as capped. */
  decodeCeiling: number;
  wavelengthNm: number;
  source: DatasetRef;
}

export const PROBE_AEROSOL_CEILING_CENSORING_LIMITATIONS = [
  "The published aerosol colormap's top bin is open (AOD >= 0.9 at 550 nm), so a month decoded into it is a lower bound rather than a measurement.",
  "A series maximum is exactly the statistic most likely to be censored, because the capped months are the heaviest ones.",
  "A mean containing a capped month understates the true mean; the direction is unambiguous because this ramp has only one open cap.",
  "Nothing here estimates the column loading behind the cap, and no surface air-quality, health, exposure, hazard, causal, or forecast claim follows from a censored reading.",
  "The reported minimum is unaffected: the ramp's low end is closed at 0 and column AOD cannot be negative.",
] as const;

/**
 * Judge a probed series against the published aerosol ramp's open top bin.
 *
 * `values` are the series in the layer's own reported unit (dimensionless AOD)
 * — the same physical numbers the status line formats — with null for months
 * that returned nothing. Non-aerosol layers return an inapplicable summary: no
 * other layer in the app is decoded through this ramp.
 */
export function probeAerosolCeilingCensoring(
  layerId: LayerId | undefined,
  values: readonly (number | null)[]
): ProbeAerosolCeilingCensoring {
  const base = {
    kind: "probe-aerosol-ceiling-censoring",
    airQualityObservation: false,
    isForecast: false,
    rampMax: AEROSOL_RENDERED_RAMP_MAX,
    decodeCeiling: AEROSOL_PROBE_DECODE_CEILING,
    wavelengthNm: AEROSOL_WAVELENGTH_NM,
    source: AEROSOL_SOURCE,
  } as const;
  const inapplicable: ProbeAerosolCeilingCensoring = {
    ...base,
    applicable: false,
    ceilingMonthCount: 0,
    observedMonthCount: 0,
    maxBound: null,
    meanBound: null,
  };
  if (layerId !== "aerosol") return inapplicable;

  const observed = values.filter(
    (value): value is number => value !== null && Number.isFinite(value)
  );
  if (observed.length === 0) return inapplicable;

  let ceilingMonthCount = 0;
  for (const value of observed) {
    if (value >= AEROSOL_PROBE_DECODE_CEILING) ceilingMonthCount += 1;
  }

  // One capped month bounds both statistics: the maximum is at least that
  // month's value (it is the largest, so it is capped too), and the mean can
  // only rise if the cap were resolved. There is no opposing cap to cancel it.
  const bound: AerosolCeilingBound = ceilingMonthCount > 0 ? "lower" : null;
  return {
    ...base,
    applicable: true,
    ceilingMonthCount,
    observedMonthCount: observed.length,
    maxBound: bound,
    meanBound: bound,
  };
}

/**
 * The inequality to render in front of a reported statistic, or "" when it is a
 * two-sided estimate. Kept separate from the clause so the number itself can
 * never be shown bare once it is known to be a bound.
 *
 * `min` never carries one: this ramp censors at the top only.
 */
export function aerosolCeilingBoundPrefix(
  censoring: ProbeAerosolCeilingCensoring,
  statistic: "min" | "mean" | "max"
): string {
  if (statistic === "min") return "";
  const bound = statistic === "max" ? censoring.maxBound : censoring.meanBound;
  return bound === "lower" ? "≥ " : "";
}

/**
 * One status-line clause naming which statistics are bounds and why, or null
 * when no sampled month reached the cap — an ordinary clean-column record then
 * reads exactly as it did before.
 */
export function aerosolCeilingCensoringClause(
  censoring: ProbeAerosolCeilingCensoring
): string | null {
  if (!censoring.applicable) return null;
  const { ceilingMonthCount, observedMonthCount, rampMax, wavelengthNm } =
    censoring;
  if (ceilingMonthCount === 0) return null;

  const tally = `${ceilingMonthCount} of ${observedMonthCount} sampled ${
    observedMonthCount === 1 ? "month" : "months"
  }`;
  // The verb agrees with the capped count, the noun with the record length.
  const rest = ceilingMonthCount === 1 ? "rests" : "rest";
  const cap = `every column AOD at or above ${rampMax.toFixed(3)} at ${wavelengthNm} nm shares one colour`;
  return (
    `${tally} ${rest} on the aerosol colormap's open top bin (${cap}), so max and mean are lower bounds on possibly heavier columns ` +
    `and the trend fitted over the same series inherits that censoring; min is unaffected because the ramp's low end is closed at 0 ` +
    `(source ${COLORMAP_DOCS.aerosol} colormap)`
  );
}
