import type { DatasetRef, LayerId } from "./timeline";
import {
  RENDERED_VEGETATION_INDEX_RANGE,
  type RenderedVegetationIndexId,
} from "./vegetationIndexRenderedRange";
import { isUndrawnBelowRampLayer } from "./vegetationProbeAbsence";
import { VEGETATION_OBSERVING_CONSTRAINT_LIMITS } from "./vegetationObservingConstraints";

/**
 * How many of a vegetation-index probe's sampled months drew a value at all —
 * and what the statistics reduced from them therefore describe.
 *
 * `vegetationAveragedSupport.ts` answers the *spatial* version of this
 * question: what share of an averaged footprint each monthly mean covered.
 * This module answers the *temporal* one, which no vegetation surface stated in
 * any mode: how many of the months on the chart's own x-axis contributed a
 * value, and what the min, mean and max printed beside them are consequently a
 * min, mean and max *of*. Snow and the two water-cycle layers already carry
 * this pair (`snowChartedRecord.ts`, `gldasChartedRecord.ts`); the vegetation
 * indices carried only its spatial half.
 *
 * The mechanism is the documented one this family already cites. GIBS marks
 * every value below the ramp's start transparent in both MODIS_L3_NDVI and
 * MODIS_L3_EVI — the product fill band plus the two negative bands (see
 * vegetationIndexRenderedRange.ts) — and those pixels arrive as JPEG black and
 * are rejected rather than decoded (see vegetationProbeAbsence.ts). A month
 * therefore drops out of the series when its index fell below the drawn ramp
 * *or* when its composite never arrived, and the rendered tile cannot separate
 * the two.
 *
 * Why that has to be said for a partial record specifically. The panel already
 * covers the two ends: a record where every month drew needs no correction, and
 * one where none did is handled outright — by `vegetationProbeAbsence.ts` for a
 * point probe and by `vegetationAveragedSupport.ts`'s `no-charted-month` clause
 * for an averaged one, both of which replace "No data at this point" rather
 * than trailing it. Between them sits the ordinary case over most of the
 * vegetated globe: a seasonal or semi-arid point where a minority of months
 * fall below the ramp. There the panel prints a full statistics line with
 * nothing on it to say that the months it reduced are a *selected* subset.
 *
 * The conditioning is directional and nameable, which is why it is worth a
 * sentence. The excluded months are not a random subset of the record: open
 * water, snow and ice, cloud, and negative-index barren ground are exactly the
 * surfaces whose index falls below the drawn ramp, so the months that survive
 * are the greener ones and the charted mean reads high against a mean over the
 * whole record. The minimum is the lowest *drawn* value rather than the
 * record's. The *correction* is not nameable — an excluded month could have
 * held any below-ramp value, or no usable observation at all — so the clause
 * states the conditioning and refuses the rest: it never substitutes a
 * corrected mean, never counts an excluded month as zero, never says the point
 * was bare, frozen, flooded or cloudy in any excluded month, and never says
 * which of the two readings applies to any given month.
 *
 * The count it prints is not a data-availability figure. The one MOD13A3
 * distribution gap on these layers (April 2025) is already removed from the
 * sampled months upstream by `monthRangeForLayer` and is disclosed separately
 * by `probeRecordGaps.ts`, so what remains excluded here is a rendering
 * outcome, not a distribution one.
 *
 * Nothing here interprets the index. NDVI and EVI are unitless indices; a
 * drawn-month count is not a growing-season length, a phenological date, or a
 * count of green days, and implies no cover, biomass, condition, habitat,
 * productivity, cause, or forecast.
 *
 * Pure, render-free logic (see vegetationChartedRecord.test.ts).
 */

export type VegetationChartedRecordStatus =
  /** Not a rendered vegetation-index layer, or no months were sampled. */
  | "unreported"
  /** No month drew a value — the absence notes already speak for this. */
  | "no-drawn-month"
  /** Every sampled month drew a value; nothing was excluded. */
  | "fully-drawn"
  /** Some months drew and some did not. */
  | "partly-drawn";

export const VEGETATION_CHARTED_RECORD_LIMITATIONS = [
  ...VEGETATION_OBSERVING_CONSTRAINT_LIMITS,
  "GIBS draws no colour below the ramp's start, so a month drops out when its index fell below the drawn ramp or when its composite never arrived; the rendered tile cannot separate the two.",
  "The drawn-month count is therefore not a measure of data availability, and over a seasonal or semi-arid location it is largely a statement about how often the index rose above the drawn ramp.",
  "Statistics reduced from the drawn months are conditional on the index having been drawn: the mean is an average over those months only and reads high against a mean over the whole record, and the minimum is the lowest drawn value, neither of which is the record's.",
  "No corrected mean is offered and excluded months are never counted as zero, because an excluded month could have held any below-ramp value or no usable observation at all.",
  "A count of drawn months is not a growing-season length, a green-up or senescence date, or a count of green days.",
] as const;

export interface VegetationChartedRecordSummary {
  kind: "observed-vegetation-charted-record";
  /** Explicitly prevents consumers from treating this as a forecast. */
  isForecast: false;
  index: RenderedVegetationIndexId | null;
  status: VegetationChartedRecordStatus;
  dataset: DatasetRef | null;
  /** Number of sampled months on the chart's x-axis. */
  sampledMonths: number;
  /** Number of those that drew a usable value. */
  drawnMonths: number;
  limitations: readonly string[];
}

/**
 * Classify a vegetation-index probe's series by how much of it drew. `values`
 * are the probe's per-month entries aligned with its sampled months; only their
 * presence is read, so gradient positions and physical index values classify
 * identically — and so the result cannot depend on the inversion's accuracy,
 * only on whether a month produced a number.
 */
export function summarizeVegetationChartedRecord(
  layerId: LayerId | null | undefined,
  values: readonly (number | null | undefined)[] | null | undefined
): VegetationChartedRecordSummary {
  // Normalized first so the type guard narrows the value actually stored.
  const candidate = layerId ?? undefined;
  const index = isUndrawnBelowRampLayer(candidate) ? candidate : null;
  const sampledMonths = values?.length ?? 0;
  const drawnMonths =
    values?.filter((v) => v !== null && v !== undefined && Number.isFinite(v))
      .length ?? 0;

  const status: VegetationChartedRecordStatus =
    index === null || sampledMonths === 0
      ? "unreported"
      : drawnMonths === 0
        ? "no-drawn-month"
        : drawnMonths === sampledMonths
          ? "fully-drawn"
          : "partly-drawn";

  return {
    kind: "observed-vegetation-charted-record",
    isForecast: false,
    index,
    status,
    dataset: index ? RENDERED_VEGETATION_INDEX_RANGE[index].source : null,
    sampledMonths,
    drawnMonths,
    limitations: VEGETATION_CHARTED_RECORD_LIMITATIONS,
  };
}

/**
 * One status-line clause, or null when there is nothing worth saying.
 *
 * Silent on a fully drawn record, where nothing was excluded and the clause
 * would describe an exclusion that did not happen; silent when no month drew at
 * all, which the absence notes replace the whole sentence for — returning a
 * string there would suppress `emptyVegetationProbeNote`, which takes this
 * module's output as its `existingAbsenceNote`; silent when no months were
 * sampled or the layer is not one this module reasons about.
 *
 * The ramp start and colormap document are read from the measured range rather
 * than written out, so a GIBS re-render that moves the ramp cannot leave this
 * sentence stale.
 */
export function vegetationChartedRecordClause(
  summary: VegetationChartedRecordSummary
): string | null {
  if (summary.status !== "partly-drawn" || summary.index === null) return null;

  const range = RENDERED_VEGETATION_INDEX_RANGE[summary.index];
  const label = summary.index.toUpperCase();

  return (
    `${label} drawn in ${summary.drawnMonths} of ${summary.sampledMonths} ` +
    `sampled months — GIBS draws no colour below ${range.renderedMinimum} in ` +
    `${range.colormapDoc}, so a month whose index fell below the drawn ramp ` +
    `and one whose composite never arrived are indistinguishable and both ` +
    `excluded; the statistics above cover the drawn months alone, so the mean ` +
    `reads high against the record and the min is the lowest drawn value, not ` +
    `the record's`
  );
}

/**
 * The clause for a vegetation-index probe series, or null when it does not
 * apply. Gated to the two rendered vegetation-index layers: this module reasons
 * about the MOD13A3 colormaps' transparent below-ramp bands, and an absent
 * month means something different for a layer drawn across its whole range.
 *
 * Applies in every probe mode, because a month drops out for the same reason
 * whether the panel charted a point median or an averaged mean. Both layers are
 * covered, unlike this family's phenology clauses: a drawn-month count reads
 * only whether a month produced a value, so it needs none of the calibration
 * that restricts those to NDVI.
 */
export function vegetationChartedRecordNote(
  layerId: LayerId | null | undefined,
  values: readonly (number | null | undefined)[] | null | undefined
): string | null {
  return vegetationChartedRecordClause(
    summarizeVegetationChartedRecord(layerId, values)
  );
}
