import type { DatasetRef, LayerId } from "./timeline";
import { SNOW_COVER_DATASET, SNOW_COVER_LIMITATIONS } from "./snowCover";

/**
 * How many of a snow probe's sampled months charted anything at all — and what
 * the statistics reduced from them therefore describe.
 *
 * `snowAveragedSupport.ts` answers the *spatial* version of this question: what
 * share of an averaged footprint each monthly mean covered. This module answers
 * the *temporal* one, which no surface stated in any mode: how many of the
 * months on the chart's own x-axis contributed a value, and what the min, mean
 * and max printed beside them are consequently a min, mean and max *of*.
 *
 * The mechanism is the same documented one and it is specific to this layer.
 * GIBS renders percent 0 transparent in the MODIS_NDSI_Snow_Cover colormap (see
 * snowCoverRamp.ts), so snow-free ground is not drawn, and the inversion also
 * rejects the eight non-measurement classification colours — Missing Data, No
 * Decision, Night, Inland Water, Ocean, Cloud, Detector Saturated, Fill (see
 * snowProbeAbsence.ts). A month therefore drops out of the series when it was
 * snow-free *or* when it was never usably observed, and the rendered tile
 * cannot separate the two.
 *
 * Why that has to be said for a partial record specifically. The panel already
 * covers the two ends: a record where every month charted needs no correction,
 * and one where none did is handled outright — by `snowProbeAbsence.ts` for a
 * point probe and by `snowAveragedSupport.ts`'s `no-charted-month` clause for an
 * averaged one, both of which replace "No data at this point" rather than
 * trailing it. Between them sits the ordinary case over most of the snow-bearing
 * globe: a seasonal point where a minority of months carry drawn snow. There the
 * panel prints a full statistics line with nothing on it to say that the months
 * it reduced are a *selected* subset, so a point holding one 90% month across a
 * 26-year record reports `mean 90%` — a number that reads as near-permanent
 * cover and is really the average of the months that had snow.
 *
 * Unlike the GLDAS layers, whose discarded pixels span both ends of the ramp at
 * once (see gldasAveragedSupport.ts), snow's excluded months sit at one end: a
 * snow-free month would enter as 0%, below every drawn value in the record. So
 * the *conditioning* is nameable — the mean is a mean where snow was drawn and
 * the min is the lowest drawn value — while the *correction* is not, because an
 * unobserved month could have held any cover at all and the tile does not say
 * which excluded months were which. The clause states the former and refuses the
 * latter: it never substitutes a corrected mean, never counts the excluded
 * months as zeros, and never says the location was snow-free.
 *
 * The count it prints is not a data-availability figure either. Distribution
 * gaps — the six MOD10CM months the service never published — are already
 * removed from the sampled months upstream by `monthRangeForLayer`, and what
 * remains excluded here is overwhelmingly seasonal rather than a retrieval
 * failure. That is the opposite reading from the same fraction on any other
 * layer, which is why it is stated in snow's own terms.
 *
 * Claims nothing about snow depth, snow-water equivalent, melt or accumulation
 * rate, runoff, water volume, season length, cause, or any future value; a
 * charted-month count is not a snow-season duration.
 *
 * Pure, render-free logic (see snowChartedRecord.test.ts).
 */

/** The layer whose rendering this module reasons about. */
const SNOW_PROBE_LAYER_ID = "snow" satisfies LayerId;

export type SnowChartedRecordStatus =
  /** Not the snow layer, or no months were sampled at all. */
  | "unreported"
  /** No month charted a value — the absence notes already speak for this. */
  | "no-charted-month"
  /** Every sampled month charted a value; nothing was excluded. */
  | "fully-charted"
  /** Some months charted and some did not. */
  | "partly-charted";

export const SNOW_CHARTED_RECORD_LIMITATIONS = [
  ...SNOW_COVER_LIMITATIONS,
  "GIBS draws no colour for 0% snow and the inversion rejects the classification flags, so a month drops out when it was snow-free or when it was not usably observed; the rendered tile cannot separate the two.",
  "The charted-month count is therefore not a measure of data availability, and over a seasonal location it is mostly a statement about how often snow was present.",
  "Statistics reduced from the charted months are conditional on snow having been drawn: the mean is an average over those months only and the minimum is the lowest drawn value, neither of which is the record's.",
  "No corrected mean is offered and excluded months are never counted as zero, because an unobserved month could have held any cover at all.",
  "A count of charted months is not a snow-season length, an onset or melt-out date, or a count of snow-covered days.",
] as const;

export interface SnowChartedRecordSummary {
  kind: "observed-snow-charted-record";
  /** Explicitly prevents consumers from treating this as a forecast. */
  isForecast: false;
  status: SnowChartedRecordStatus;
  dataset: DatasetRef;
  /** Number of sampled months on the chart's x-axis. */
  sampledMonths: number;
  /** Number of those that charted a usable value. */
  chartedMonths: number;
  limitations: readonly string[];
}

/**
 * Classify a snow probe's series by how much of it charted. `values` are the
 * probe's per-month entries aligned with its sampled months; only their
 * presence is read, so gradient positions and physical percentages classify
 * identically.
 */
export function summarizeSnowChartedRecord(
  values: readonly (number | null | undefined)[] | null | undefined
): SnowChartedRecordSummary {
  const sampledMonths = values?.length ?? 0;
  const chartedMonths =
    values?.filter((v) => v !== null && v !== undefined && Number.isFinite(v))
      .length ?? 0;

  const status: SnowChartedRecordStatus =
    sampledMonths === 0
      ? "unreported"
      : chartedMonths === 0
        ? "no-charted-month"
        : chartedMonths === sampledMonths
          ? "fully-charted"
          : "partly-charted";

  return {
    kind: "observed-snow-charted-record",
    isForecast: false,
    status,
    dataset: SNOW_COVER_DATASET,
    sampledMonths,
    chartedMonths,
    limitations: SNOW_CHARTED_RECORD_LIMITATIONS,
  };
}

/**
 * One status-line clause, or null when there is nothing worth saying.
 *
 * Silent on a fully charted record, where nothing was excluded and the clause
 * would describe an exclusion that did not happen; silent when no month charted
 * at all, which the absence notes replace the whole sentence for; silent when
 * no months were sampled.
 */
export function snowChartedRecordClause(
  summary: SnowChartedRecordSummary
): string | null {
  if (summary.status !== "partly-charted") return null;

  return (
    `snow charted in ${summary.chartedMonths} of ${summary.sampledMonths} ` +
    `sampled months — GIBS draws no colour for 0% snow, so snow-free and ` +
    `unobserved months are indistinguishable and excluded; the statistics ` +
    `above cover the charted months only, so the mean is the mean where snow ` +
    `was drawn and the min its lowest drawn value, neither the record's`
  );
}

/**
 * The clause for a snow probe series, or null when it does not apply. Gated to
 * the snow layer: this module reasons about the MOD10CM colormap's transparent
 * percent-0 band, and an absent month means something different for a layer
 * drawn across its whole range. Applies in every probe mode, because a month
 * drops out for the same reason whether the panel charted a point median or an
 * averaged mean.
 */
export function snowChartedRecordNote(
  layerId: LayerId | null | undefined,
  values: readonly (number | null | undefined)[] | null | undefined
): string | null {
  if (layerId !== SNOW_PROBE_LAYER_ID) return null;
  return snowChartedRecordClause(summarizeSnowChartedRecord(values));
}
