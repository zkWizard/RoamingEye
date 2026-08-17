import { GLDAS_RAMP_SATURATION } from "./gldasRampSaturation";
import type { GldasRampLayerId } from "./gldasRampSaturation";
import type { LayerId } from "./timeline";

/**
 * How many of a water-cycle probe's sampled months charted anything at all —
 * and what the statistics reduced from them are consequently statistics *of*.
 *
 * `gldasAveragedSupport.ts` answers the *spatial* version of this question: what
 * share of an averaged footprint each monthly mean covered. This module answers
 * the *temporal* one, which no mode stated for either GLDAS layer: how many of
 * the months on the chart's own x-axis contributed a value at all.
 *
 * The same pairing already exists for snow — `snowAveragedSupport.ts` for the
 * footprint, `snowChartedRecord.ts` for the record — and the water-cycle layers
 * were left with only the first half. That gap is widest exactly where the
 * spatial clause cannot reach: a **point probe passes no shares**, so
 * `gldasAveragedSupportNote` returns null for it by design, and a point whose
 * record is partly charted had no clause in any mode at all. It printed a full
 * statistics line with nothing on it to say the months behind it are a selected
 * subset.
 *
 * Three separate things drop a month out, and the sampler collapses all of them
 * into one absent value (the same three `gldasAveragedSupport.ts` names for
 * pixels, here along the time axis):
 *
 *  - **Off the land domain.** GLDAS Noah is solved on land cells only, so open
 *    water carries no value by construction (soilProbeDomain.ts,
 *    atmosphereProbeDomain.ts).
 *  - **The `< 0` fill cap.** Negative precipitation rate and negative column
 *    water are model fill rather than measurements, and the inversion rejects
 *    that swatch.
 *  - **The open top cap.** Both ramps end in a saturating catch-all —
 *    `≥ 5.0e-04 kg/m²/s` (≡ 43.2 mm/day) for precipitation, `≥ 50.0 kg/m²` for
 *    soil moisture — which `parseColormapEntries` drops by documented design, so
 *    a saturated month inverts to `null` too (gldasRampSaturation.ts).
 *
 * The third is why this clause must say something the snow one does not. Snow's
 * excluded months sit at one end of its range — a snow-free month would have
 * entered as 0% — so that clause can name the conditioning as a damped swing.
 * Here the discarded set spans **both ends at once**, and the consequence for a
 * reader is specific and easy to miss: a month at or above the open top bin is
 * discarded, so **the maximum printed beside the chart is not necessarily the
 * record's maximum**. A monsoon point whose wettest months exceeded the ramp
 * ceiling reports its peak from the months that stayed under it. The same holds
 * at the bottom against the fill cap. So the clause states that the statistics
 * are conditional and that the peak may be censored from above, while refusing
 * to say the location was dry, wet, or off-domain in any excluded month.
 *
 * What it will not do: it offers no corrected, reweighted or substituted
 * statistic, never counts an excluded month as zero, never assigns an overall
 * direction of error (the exclusions pull opposite ways and a share cannot
 * separate them), and never says which mechanism excluded any given month.
 * Separating them needs the sampled colours (`classifyGldasRampSample`), which
 * the probe path does not load.
 *
 * Nothing here claims drought or flood state, recharge, runoff, water-balance
 * closure, season length, cause, or any future value; a charted-month count is
 * not a count of wet or dry months.
 *
 * Pure, render-free logic (see gldasChartedRecord.test.ts). Provenance is the
 * GIBS colormap document named per layer in `GLDAS_RAMP_SATURATION`; the cited
 * dataset is unchanged.
 */

export type GldasChartedRecordStatus =
  /** Not a GLDAS water-cycle layer, or no months were sampled at all. */
  | "unreported"
  /** No month charted a value — the empty-probe notes already speak for this. */
  | "no-charted-month"
  /** Every sampled month charted a value; nothing was excluded. */
  | "fully-charted"
  /** Some months charted and some did not. */
  | "partly-charted";

export const GLDAS_CHARTED_RECORD_LIMITATIONS = [
  "A month drops out of the series when it was off the GLDAS land domain, at the ramp's `< 0` fill cap, or at or above its open top cap; the charted series cannot separate the three.",
  "The charted-month count is a measure of what the ramp drew, not of how wet or dry the location was, and an uncharted month is never evidence of dry ground.",
  "Statistics reduced from the charted months are conditional on those months having been drawn; they are not the record's.",
  "Because the open top bin is discarded, a month at or above it is absent, so the charted maximum may sit below the record's peak and no upper bound is implied.",
  "No corrected statistic is offered and excluded months are never counted as zero, because a discarded month could have sat at either end of the ramp.",
  "No overall direction of error is stated: the exclusions pull in opposite directions and a count cannot separate them.",
] as const;

export interface GldasChartedRecordSummary {
  kind: "observed-gldas-charted-record";
  /** Explicitly prevents consumers from treating this as a forecast. */
  isForecast: false;
  layerId: GldasRampLayerId;
  status: GldasChartedRecordStatus;
  /** Number of sampled months on the chart's x-axis. */
  sampledMonths: number;
  /** Number of those that charted a usable value. */
  chartedMonths: number;
  limitations: readonly string[];
}

/**
 * Classify a water-cycle probe's series by how much of it charted. `values` are
 * the probe's per-month entries aligned with its sampled months; only their
 * presence is read, so gradient positions and physical values classify
 * identically.
 */
export function summarizeGldasChartedRecord(
  layerId: GldasRampLayerId,
  values: readonly (number | null | undefined)[] | null | undefined
): GldasChartedRecordSummary {
  const sampledMonths = values?.length ?? 0;
  const chartedMonths =
    values?.filter((v) => v !== null && v !== undefined && Number.isFinite(v))
      .length ?? 0;

  const status: GldasChartedRecordStatus =
    sampledMonths === 0
      ? "unreported"
      : chartedMonths === 0
        ? "no-charted-month"
        : chartedMonths === sampledMonths
          ? "fully-charted"
          : "partly-charted";

  return {
    kind: "observed-gldas-charted-record",
    isForecast: false,
    layerId,
    status,
    sampledMonths,
    chartedMonths,
    limitations: GLDAS_CHARTED_RECORD_LIMITATIONS,
  };
}

/**
 * One status-line clause, or null when there is nothing worth saying.
 *
 * Silent on a fully charted record, where nothing was excluded and the clause
 * would describe an exclusion that did not happen; silent when no month charted
 * at all, which `emptyAtmosphereProbeNote` (precipitation) and
 * `emptySoilProbeNote` (soil moisture) replace the whole sentence for, and both
 * of which already refuse the dry reading; silent when no months were sampled.
 */
export function gldasChartedRecordClause(
  summary: GldasChartedRecordSummary
): string | null {
  if (summary.status !== "partly-charted") return null;

  const facts = GLDAS_RAMP_SATURATION[summary.layerId];
  // The bound in the unit the probe REPORTS, never the published label: the
  // precipitation ramp publishes `≥ 5.0e-04` in native kg/m²/s while the panel
  // beside it prints mm/day, and quoting the label would misstate the ceiling
  // by four orders of magnitude.
  const ceiling = `${formatBound(facts.ceiling.boundReported)} ${facts.reportedUnit}`;

  return (
    `charted in ${summary.chartedMonths} of ${summary.sampledMonths} sampled ` +
    `months — GLDAS is solved on land cells only, and the ramp's sub-zero fill ` +
    `and its open ≥ ${ceiling} top bin are discarded as well, so an uncharted ` +
    `month is not a dry one; the statistics above cover the charted months ` +
    `alone, and a month at or above that top bin is among the discarded, so the ` +
    `maximum need not be the record's`
  );
}

/**
 * The clause for a water-cycle probe series, or null when it does not apply.
 * Gated to the two GLDAS layers: this module reasons about that product's
 * land-only domain and the open caps on its shared ramp, and an absent month
 * means something different for a layer drawn across its whole range. Applies in
 * every probe mode, because a month drops out for the same reason whether the
 * panel charted a point median or an averaged mean — and the point probe, which
 * supplies no shares, is the mode the spatial clause cannot speak for.
 */
export function gldasChartedRecordNote(
  layerId: LayerId | null | undefined,
  values: readonly (number | null | undefined)[] | null | undefined
): string | null {
  if (layerId !== "precip" && layerId !== "soil") return null;
  return gldasChartedRecordClause(summarizeGldasChartedRecord(layerId, values));
}

/** Trailing zeros off an integral bound: "50 kg/m²", not "50.0 kg/m²". */
function formatBound(bound: number): string {
  return Number.isInteger(bound) ? String(bound) : bound.toFixed(1);
}
