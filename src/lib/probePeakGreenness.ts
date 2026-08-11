import {
  summarizeAnnualNdviPhenology,
  type NdviMonthlyObservation,
} from "./phenology";
import {
  summarizePeakGreennessTiming,
  type PeakGreennessTiming,
} from "./phenologyPeakTiming";
import { MONTH_NAMES, type LayerId, type YearMonth } from "./timeline";

/**
 * Bridge the probe's sampled monthly series into the NDVI phenology summaries,
 * so the multi-year record the probe already fetches also answers *when* the
 * greenest month of the year tends to fall — not just min/mean/max and a trend.
 *
 * Scope is deliberately narrow, for three separate reasons:
 *
 *  - Only the `ndvi` layer. `phenology.ts` stamps every summary with MOD13A3
 *    NDVI provenance and the NDVI unit. EVI ships from the same MOD13A3
 *    product but is a different index, so routing EVI values through these
 *    helpers would label an EVI summary as NDVI. The probe's remaining layers
 *    are not vegetation indices at all.
 *
 *  - Timing only, never magnitude. The probe recovers values through the
 *    layer's legend ramp (`scaleValue`), a strictly increasing linear map of
 *    gradient position, and that inversion carries a measured error (see
 *    `validation.ts`). A year's peak *month* is the argmax of its monthly
 *    values, and a strictly increasing transform preserves ordering, so the
 *    reported month is invariant to the ramp's absolute calibration error.
 *    The peak's NDVI value would not be, so this never reports one.
 *
 *  - A monthly index maximum is not a phenological event. The wording below
 *    says "peak NDVI month" and nothing about green-up, senescence, growing
 *    season length, phenophases, biomass, or ecosystem condition.
 */

/** The probe layer whose sampled values are MOD13A3 NDVI. */
const NDVI_PROBE_LAYER = "ndvi";

/**
 * Summarize annual peak-NDVI timing from a probe series, or null when the
 * layer is not NDVI. `values` are physical NDVI aligned index-for-index with
 * `months`; nulls are unsampled or no-data months and are passed through as
 * missing rather than interpolated.
 */
export function probePeakGreennessTiming(
  layerId: LayerId,
  months: readonly YearMonth[],
  values: readonly (number | null)[],
  latitude: number
): PeakGreennessTiming | null {
  if (layerId !== NDVI_PROBE_LAYER) return null;

  const observations: NdviMonthlyObservation[] = [];
  for (let index = 0; index < months.length; index++) {
    const month = months[index];
    if (!month) continue;
    observations.push({ month, ndvi: values[index] ?? null });
  }
  if (observations.length === 0) return null;

  return summarizePeakGreennessTiming(
    summarizeAnnualNdviPhenology(observations, latitude)
  );
}

/**
 * One-line peak-timing clause for the probe panel status, or null when there
 * is nothing defensible to say. R is the mean resultant length of the peak
 * months on the calendar circle: 1 means every year peaked in the same month,
 * 0 means the peaks are spread around the year. R is reported rather than only
 * its presentation bin because R is the actual measurement.
 */
export function peakGreennessClause(
  timing: PeakGreennessTiming | null
): string | null {
  if (!timing) return null;
  if (timing.status !== "available") return "peak NDVI month: too few years";

  const dominant = timing.dominantPeakMonth;
  const resultant = timing.meanResultantLength;
  if (!dominant || resultant === null) return null;

  const name = MONTH_NAMES[dominant.month - 1];
  const years = timing.coverage.contributingYearCount;
  return (
    `peak NDVI month usually ${name} ` +
    `(${dominant.count}/${years} yr · R ${resultant.toFixed(2)})`
  );
}
