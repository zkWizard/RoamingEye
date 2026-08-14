import {
  AEROSOL_RENDERED_RAMP_MAX,
  AEROSOL_SOURCE,
  AEROSOL_WAVELENGTH_NM,
} from "./aerosolLoading";
import { COLORMAP_DOCS, colormapUrl } from "./colormap";
import { PROBE_SCALES, quantizationStep } from "./probe";
import type { DatasetRef, LayerId } from "./timeline";
import type { TrendSummary } from "./trend";

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
 * But the direction stops at the mean, and saying so is the delicate part. The
 * clause has just established one — max and mean are LOWER bounds — so naming
 * the trend immediately afterwards as inheriting "that censoring" invites the
 * reader to carry the direction across with it. It does not survive the trip.
 * Sen's slope is the median of the within-season pairwise slopes, and a capped
 * month is the earlier member of some of those pairs and the later member of
 * others: resolving it upward steepens the first group and flattens the second,
 * so which way the median finally moves depends on where in the record the
 * capped months fall — a fact about the true values, which the imagery has
 * already destroyed (Helsel, *Statistics for Censored Environmental Data Using
 * Minitab and R*, 2nd ed., Wiley 2012, §11). The single open cap that makes the
 * mean's direction unambiguous buys nothing here. This is the same refusal
 * `probeSstTrendCensoring` makes for the marine ramp and that this module's own
 * CSV headers already make for the downloaded file; the status line was the one
 * surface that left it open.
 *
 * The trend sentence is also conditional on there being a trend. `trendClause`
 * prints "trend: insufficient record" for a series too short to test, and a
 * verdict that makes no numeric claim has nothing to qualify — so a record that
 * short gets the max/mean bounds and no trend sentence at all.
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
  "The trend is fitted over the same censored series and inherits the censoring, but no direction is claimed for it: a capped month is the earlier member of some within-season pairs and the later member of others, so the single open cap that signs the mean's bias does not sign the slope's.",
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
 *
 * `trend` is the summary the status line reports a few fields earlier, taken
 * for its `testable` flag alone: this clause qualifies that trend, so it must
 * not describe one the line never printed. Passing the summary rather than a
 * bare boolean keeps the two statements pinned to the same fit.
 */
export function aerosolCeilingCensoringClause(
  censoring: ProbeAerosolCeilingCensoring,
  trend: Pick<TrendSummary, "testable">
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
  // Named only when one was actually fitted, and explicitly stripped of the
  // direction the preceding half of the sentence just established for the mean.
  const trendPhrase = trend.testable
    ? " and the trend fitted over the same series inherits that censoring but not its direction, " +
      "because a substituted cap moves a seasonal median whichever way the record's shape decides"
    : "";
  return (
    `${tally} ${rest} on the aerosol colormap's open top bin (${cap}), so max and mean are lower bounds on possibly heavier columns` +
    `${trendPhrase}; min is unaffected because the ramp's low end is closed at 0 ` +
    `(source ${COLORMAP_DOCS.aerosol} colormap)`
  );
}

/**
 * The same disclosure carried into the exported CSV, or an empty list for every
 * layer but aerosol and for a record no month of which reached the cap — those
 * files stay byte-identical.
 *
 * The export needs this at least as much as the status line does. On screen the
 * inequality is printed in front of the affected statistic, so a bound can never
 * be read as a measurement; in the file a capped month's `value` cell is an
 * ordinary decimal indistinguishable from a resolved one, and the download
 * outlives the session that explained it. That is the same gap
 * `sstExtremeCensoringCsvHeaders` closed for the marine ramp, left open here
 * because the aerosol screen was built for the panel only.
 *
 * The wording departs from the marine block wherever the two ramps differ. This
 * one is open at its top only, so the rule the reader applies has a single arm,
 * there is no upper-bound mark to look for, and the mean the file's rows support
 * is itself a lower bound — which the marine block cannot say, its two opposing
 * caps leaving the mean bounded in neither direction. The trend still gets no
 * direction: where the capped months sit in the record decides which way a
 * resolved cap would tilt a slope.
 *
 * Recovers nothing. States which rows are bounds and in which direction, and
 * supports no surface air-quality, health, exposure, hazard, causal, or forecast
 * claim.
 */
export function aerosolCeilingCensoringCsvHeaders(
  censoring: ProbeAerosolCeilingCensoring
): string[] {
  if (!censoring.applicable) return [];
  const {
    ceilingMonthCount,
    observedMonthCount,
    rampMax,
    decodeCeiling,
    wavelengthNm,
  } = censoring;
  if (ceilingMonthCount === 0) return [];

  const doc = COLORMAP_DOCS.aerosol;
  // No commas anywhere below: a `#` line must never contain a CSV delimiter
  // (see the header discipline documented on `csvHeaderText` in probe.ts).
  return [
    `# aerosol_ramp_censoring: ${ceilingMonthCount} of ${observedMonthCount} sampled ${
      observedMonthCount === 1 ? "month" : "months"
    } decode into the published aerosol colormap's open top bin — those values are lower bounds and not measurements`,
    `# aerosol_ramp_censoring_rows: mark them in the value column below — a value at or above ${decodeCeiling.toFixed(
      4
    )} sits in that bin where every column AOD at or above ${rampMax.toFixed(
      3
    )} at ${wavelengthNm} nm shares one colour (a lower bound on possibly heavier loading); no row carries an opposing mark because the ramp's low end is closed at 0 and column AOD cannot be negative`,
    `# aerosol_ramp_censoring_uncertainty: the quantization figure on the uncertainty line above is two-sided and does not describe those months — above the cap their true loading is unbounded and none is estimated here`,
    `# aerosol_ramp_censoring_derived: the anomaly column and any trend stated above are computed over this same series so they inherit the censoring; a mean taken over these rows is a lower bound for the same reason because one open cap can bias it only downward — but no direction is claimed for the trend since a resolved cap tilts a slope whichever way the record's shape decides`,
    `# aerosol_ramp_censoring_source: ${doc} colormap — ${colormapUrl(doc)}`,
  ];
}
