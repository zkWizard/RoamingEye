import {
  summarizeAnnualNdviPhenology,
  type NdviAnnualPhenology,
  type NdviMonthlyObservation,
} from "./phenology";
import {
  summarizeNdviExtremumSupport,
  type NdviExtremumSupportSummary,
} from "./phenologyExtremumSupport";
import {
  summarizePeakGreennessTiming,
  type PeakGreennessTiming,
} from "./phenologyPeakTiming";
import {
  seasonalityClassFor,
  summarizeNdviSeasonalConcentration,
  type NdviSeasonalConcentration,
} from "./phenologySeasonality";
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
  const annuals = probeNdviAnnualSummaries(layerId, months, values, latitude);
  return annuals === null ? null : summarizePeakGreennessTiming(annuals);
}

/**
 * Per-year NDVI summaries for a probe series, or null when the layer is not
 * NDVI or the series carries no months. Shared by the timing and support
 * summaries so both describe exactly the same retained observations.
 */
function probeNdviAnnualSummaries(
  layerId: LayerId,
  months: readonly YearMonth[],
  values: readonly (number | null)[],
  latitude: number
): NdviAnnualPhenology[] | null {
  const observations = probeNdviObservations(layerId, months, values);
  return observations === null
    ? null
    : summarizeAnnualNdviPhenology(observations, latitude);
}

/**
 * The probe's sampled months as phenology observations, or null when the layer
 * is not NDVI or the series carries no months. Shared by every summary below so
 * they can never disagree about which months were observed.
 */
function probeNdviObservations(
  layerId: LayerId,
  months: readonly YearMonth[],
  values: readonly (number | null)[]
): NdviMonthlyObservation[] | null {
  if (layerId !== NDVI_PROBE_LAYER) return null;

  const observations: NdviMonthlyObservation[] = [];
  for (let index = 0; index < months.length; index++) {
    const month = months[index];
    if (!month) continue;
    observations.push({ month, ndvi: values[index] ?? null });
  }
  return observations.length === 0 ? null : observations;
}

/**
 * Assess how well the probe's own sampled months support each year's peak, or
 * null when the layer is not NDVI. Consumes the same annual summaries the
 * timing clause does, so the two can never describe different records.
 */
export function probePeakSupport(
  layerId: LayerId,
  months: readonly YearMonth[],
  values: readonly (number | null)[],
  latitude: number
): NdviExtremumSupportSummary | null {
  const annuals = probeNdviAnnualSummaries(layerId, months, values, latitude);
  return annuals === null ? null : summarizeNdviExtremumSupport(annuals);
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

/**
 * Qualifier for {@link peakGreennessClause}: how many of the years behind that
 * modal month actually had both neighbouring months observed. Without it the
 * timing clause counts a peak flanked by a MOD13A3 data gap — or one sitting on
 * the January/December cut, where the summary cannot see past the year edge —
 * exactly as heavily as a fully bracketed one, which over-states how firmly the
 * record establishes the month.
 *
 * Deliberately silent in two cases, so the status line only grows when the
 * qualification changes the reading:
 *  - every contributing peak is bracketed — there is nothing to caveat;
 *  - the timing clause named no month, so there is nothing to qualify.
 *
 * The denominator is the support summary's own usable-year count rather than
 * the timing summary's contributing-year count. The two agree for a probe
 * series, but quoting the tally's own total keeps the fraction self-consistent
 * if they ever diverge. This reports sampling, never vegetation: a gap-flanked
 * peak is still the greenest month observed.
 */
export function peakSupportClause(
  timing: PeakGreennessTiming | null,
  support: NdviExtremumSupportSummary | null
): string | null {
  if (!timing || !support) return null;
  if (timing.status !== "available" || !timing.dominantPeakMonth) return null;
  if (support.status !== "available") return null;

  const total = support.coverage.usableYearCount;
  const bracketed = support.peakTally.bracketed;
  if (total === 0 || bracketed === total) return null;

  return `peak bracketed by observed neighbours in ${bracketed}/${total} yr`;
}

/**
 * Second qualifier for {@link peakGreennessClause}: in how many contributing
 * years more than one month held that year's highest NDVI *exactly*, so the
 * named month is the earliest of several equals rather than a dated peak.
 *
 * `phenology.ts` records this per year (`NdviExtremum.status` / `tiedMonths`)
 * precisely because "naming one of them the peak would over-claim". But the
 * timing summary must reduce each year to a single month to place it on the
 * calendar circle, and does so by taking the earliest; nothing downstream
 * re-exposed the tie, so a plateaued year read exactly like a sharply dated
 * one. It matters twice over: the month is a convention among equals, and
 * because every tie resolves in the same direction the reduction can only
 * tighten the R the clause quotes — never loosen it.
 *
 * Ties are ordinary rather than pathological in this record: MOD13A3 composites
 * a month to one value, and probe observations are decoded from a quantised
 * colour ramp, so two months landing on the identical value is expected. This
 * reports the record's resolution, never vegetation — a tied peak is still the
 * highest greenness observed that year, and this infers no phenophase,
 * growing-season length, productivity, biomass, or ecosystem condition.
 *
 * Silent when no contributing year was tied — so a cleanly dated record adds no
 * status-line text — and when the timing clause named no month to qualify.
 */
export function peakTieClause(
  timing: PeakGreennessTiming | null
): string | null {
  if (!timing) return null;
  if (timing.status !== "available" || !timing.dominantPeakMonth) return null;

  const total = timing.coverage.contributingYearCount;
  const tied = timing.coverage.tiedPeakYearCount;
  if (total === 0 || tied === 0) return null;

  return `annual peak tied across months in ${tied}/${total} yr (earliest counted)`;
}

/**
 * Per-year within-year seasonality concentration for a probe series, or null
 * when the layer is not NDVI. Consumes exactly the observations the timing
 * clause does, so the two describe the same record.
 */
export function probeSeasonalConcentration(
  layerId: LayerId,
  months: readonly YearMonth[],
  values: readonly (number | null)[],
  latitude: number
): NdviSeasonalConcentration[] | null {
  const observations = probeNdviObservations(layerId, months, values);
  return observations === null
    ? null
    : summarizeNdviSeasonalConcentration(observations, latitude);
}

/**
 * Third qualifier for {@link peakGreennessClause}: whether the year's greenness
 * actually massed near one month, or sat spread around the whole calendar with
 * the named month merely topping it.
 *
 * The timing clause is an argmax, and an argmax is a weak summary of a year
 * whose greenness has no single centre. A record peaking sharply each July and
 * one carrying two comparable humid seasons half a year apart — or one whose
 * above-minimum greenness is scattered more or less evenly around the calendar —
 * produce the same "peak NDVI month usually Jul", and the second says far less
 * about where the year's greenness sat than the first.
 *
 * `phenologySeasonality.ts` measures exactly that shape: the magnitude-weighted
 * mean resultant length R of a year's monthly values on the circle of calendar
 * months, weighted by greenness above that year's own minimum. R near 1 means
 * the above-floor greenness is packed into a short stretch; R near 0 means it is
 * spread around the calendar, so no month is a good centre. The median R across
 * the years the probe could summarize is reported here, binned with that
 * module's own {@link seasonalityClassFor} so the reading aid stays defined in
 * one place.
 *
 * R is deliberately NOT an amplitude. It is invariant to scaling the weights, so
 * it says nothing about how large the year's NDVI swing was and this clause
 * never implies that it does — only how that swing, whatever its size, was
 * arranged around the year.
 *
 * Silent unless the median lands in a weak bin, so a firmly seasonal record adds
 * no status-line text. The bins are presentation aids, not thresholds from any
 * published standard — the median is the measurement and is always printed.
 *
 * This describes the shape of a unitless index in time and nothing else. A low
 * concentration is not degraded, unproductive, or unhealthy vegetation: an
 * evergreen humid-tropical forest is legitimately near-aseasonal in NDVI, and
 * this infers no phenophase, growing-season length, productivity, biomass,
 * canopy, land cover, cause, or forecast.
 */
export function seasonalConcentrationClause(
  timing: PeakGreennessTiming | null,
  concentrations: readonly NdviSeasonalConcentration[] | null
): string | null {
  if (!timing || !concentrations) return null;
  if (timing.status !== "available" || !timing.dominantPeakMonth) return null;

  const measured = concentrations.flatMap((year) =>
    year.status === "available" && year.concentration !== null
      ? [year.concentration]
      : []
  );
  if (measured.length === 0) return null;

  const median = medianOf(measured);
  const bin = seasonalityClassFor(median);
  if (bin !== "aseasonal" && bin !== "weakly-seasonal") return null;

  const label = bin === "aseasonal" ? "near-aseasonal" : "weakly seasonal";
  return `within-year greenness ${label} (median ${median.toFixed(2)} over ${measured.length} yr)`;
}

/**
 * Median of a non-empty list of concentrations. These are continuous
 * measurements on [0, 1], so averaging the two middle values of an even-length
 * list is meaningful — unlike a class code, which is never averaged anywhere in
 * this codebase.
 */
function medianOf(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
}
