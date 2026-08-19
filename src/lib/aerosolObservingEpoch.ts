import { AEROSOL_SOURCE } from "./aerosolLoading";
import {
  LAYERS,
  compareYm,
  ymToIndex,
  type LayerId,
  type YearMonth,
} from "./timeline";
import type { DatasetRef } from "./timeline";
import type { TrendSummary } from "./trend";

/**
 * Observing-system epochs of the MERRA-2 aerosol reanalysis, and whether a span
 * of aerosol months is temporally homogeneous.
 *
 * The atmosphere layer renders MERRA-2 total aerosol optical thickness at
 * 550 nm and the app offers it back to 1980-01 — a 46-year record. Every
 * multi-year aerosol descriptor in this repo (same-calendar-month baselines,
 * standardized departures, record margins, seasonal percentiles) is only as
 * meaningful as the record's *temporal* homogeneity, and this record is not
 * homogeneous: MERRA-2 assimilates aerosol optical depth (AOD) from instruments
 * that came and went, so the strength of the observational constraint on the
 * modelled column changes with the calendar.
 *
 * The decisive change is the arrival of EOS. Before 2000 the only assimilated
 * AOD was bias-corrected AVHRR retrieved **over ocean**; MODIS (Terra, then
 * Aqua), MISR over bright surfaces, and AERONET sun-photometer AOD enter from
 * 2000 onward, with AVHRR retired in 2002 once Aqua provided the afternoon
 * overpass. So for a land point, a 1980-1999 monthly AOD is essentially the
 * underlying GOCART model driven by its emission inventories, while a 2003+
 * value is a model constrained by daily satellite retrievals over that same
 * land. Differencing the two — which is exactly what a 1980-based baseline,
 * anomaly, or "wettest/haziest month on record" does — mixes two different
 * observing systems and can express an instrument change as a geophysical
 * signal.
 *
 * This module states which epochs a supplied span of months touches and whether
 * it crosses a transition. It is a *temporal* provenance axis, deliberately
 * distinct from the repo's existing ones:
 *   - `observingSystem.ts` classifies a signal by the *product* that made it
 *     (satellite retrieval vs. land-surface model vs. atmospheric reanalysis).
 *     That class is constant over time; this one is not.
 *   - `sourceIndependence.ts` groups signals by DOI to say which are not
 *     independent evidence. Two months of the same DOI are the same source here
 *     and yet may rest on entirely different assimilated observations.
 *   - `climateRecordGaps.ts` reports months the product never distributed. Every
 *     month discussed here was distributed; the question is what constrained it.
 *
 * Scientific honesty (kept in the code because callers surface it):
 *  - This describes the *assimilated observing system*, not data quality. A
 *    pre-EOS month is a real published MERRA-2 value, not an error, and a
 *    post-EOS month is not thereby correct. Crossing a transition does not prove
 *    a discontinuity exists at a given place — it establishes that one cannot be
 *    ruled out, which is why a trend or record across it is not attributable.
 *  - The epoch boundaries are calendar-month approximations of gradual
 *    instrument transitions (Terra AOD from early 2000, Aqua from mid-2002,
 *    AVHRR retired across 2002). They are deliberately coarse; nothing here
 *    should be read as the exact day an instrument entered the analysis.
 *  - The over-land/over-ocean asymmetry is a property of the assimilated
 *    retrievals, not of the sampled point. This module does not know where the
 *    caller sampled, so it reports the pre-EOS constraint gap as applying to
 *    land and leaves the geography to the caller.
 *  - It adds no anomaly, correction, homogenization, adjustment, significance
 *    test, causation, or forecast. It never rewrites or withholds a value; it
 *    only says what the span rests on.
 *
 * Sources: Randles et al. (2017), "The MERRA-2 Aerosol Reanalysis, 1980 Onward.
 * Part I: System Description and Data Assimilation Evaluation", J. Climate 30,
 * 6823-6850; Buchard et al. (2017), Part II, J. Climate 30, 6851-6872.
 *
 * Pure, render-free logic (see aerosolObservingEpoch.test.ts).
 */

/** Honest scope limits shared by the observing-epoch descriptors. */
export const AEROSOL_OBSERVING_EPOCH_LIMITATIONS = [
  "Epochs describe which aerosol optical depth observations MERRA-2 assimilated over a period, not the quality or correctness of any month's value.",
  "Boundaries are calendar-month approximations of gradual instrument transitions (MODIS/Terra from early 2000, Aqua from mid-2002, AVHRR retired across 2002); they are not the exact dates instruments entered the analysis.",
  "Before 2000 the only assimilated AOD was bias-corrected AVHRR over ocean, so over land the reanalysis column was effectively unconstrained by AOD observations and reflects the underlying model and its emission inventories.",
  "A span that crosses a transition is not shown to contain a discontinuity; it is shown to be unable to rule one out, so a trend, anomaly, or record across it is not attributable to a geophysical change alone.",
  "The over-land constraint gap is a property of the assimilated retrievals, not of the sampled point; this helper does not know whether the caller sampled land or ocean.",
  "No homogenization, bias adjustment, correction, significance test, causation, or forecast is applied or implied.",
] as const;

export type AerosolObservingEpochId = "pre-eos" | "eos-transition" | "eos";

export interface AerosolObservingEpoch {
  id: AerosolObservingEpochId;
  label: string;
  /** Inclusive first month of the epoch. */
  firstMonth: YearMonth;
  /** Inclusive last month, or null when the epoch is open-ended. */
  lastMonth: YearMonth | null;
  /** Which AOD observations the reanalysis assimilated during the epoch. */
  assimilatedAod: string;
  /**
   * Whether assimilated AOD constrained the column over land in this epoch.
   * False for the pre-EOS epoch, whose only AOD was retrieved over ocean.
   */
  aodConstrainedOverLand: boolean;
}

/**
 * The three observing-system epochs of the MERRA-2 aerosol reanalysis, ordered
 * oldest first and contiguous from the layer's first published month.
 */
export const AEROSOL_OBSERVING_EPOCHS: readonly AerosolObservingEpoch[] = [
  {
    id: "pre-eos",
    label: "pre-EOS (ocean-only AOD assimilation)",
    firstMonth: { year: 1980, month: 1 },
    lastMonth: { year: 1999, month: 12 },
    assimilatedAod:
      "bias-corrected AVHRR AOD over ocean only; no assimilated AOD over land",
    aodConstrainedOverLand: false,
  },
  {
    id: "eos-transition",
    label:
      "EOS transition (MODIS/Terra, MISR and AERONET enter; AVHRR retired)",
    firstMonth: { year: 2000, month: 1 },
    lastMonth: { year: 2002, month: 12 },
    assimilatedAod:
      "AVHRR over ocean giving way to MODIS/Terra over land and ocean, MISR over bright surfaces, and AERONET sun-photometer AOD",
    aodConstrainedOverLand: true,
  },
  {
    id: "eos",
    label: "EOS (MODIS Terra and Aqua backbone)",
    firstMonth: { year: 2003, month: 1 },
    lastMonth: null,
    assimilatedAod:
      "bias-corrected MODIS AOD from Terra and Aqua over land and ocean, with MISR over bright surfaces and AERONET",
    aodConstrainedOverLand: true,
  },
];

export interface AerosolObservingEpochSpan {
  epoch: AerosolObservingEpoch;
  /** Unique supplied months falling in this epoch. */
  monthCount: number;
  /** Oldest supplied month in this epoch. */
  firstMonth: YearMonth;
  /** Newest supplied month in this epoch. */
  lastMonth: YearMonth;
}

export interface AerosolObservingHomogeneity {
  kind: "aerosol-observing-epoch-span";
  /** Explicitly prevents consumers from treating this as a forecast. */
  isForecast: false;
  /** Same cited product as the observations; provenance is preserved. */
  source: DatasetRef;
  /** Oldest unique supplied month. */
  firstMonth: YearMonth;
  /** Newest unique supplied month. */
  lastMonth: YearMonth;
  /** Number of unique supplied months the span was read from. */
  monthCount: number;
  /** Per-epoch breakdown, ordered oldest first; never empty. */
  spans: readonly AerosolObservingEpochSpan[];
  /** True when every supplied month sits in one observing-system epoch. */
  homogeneous: boolean;
  /**
   * True when the supplied months touch more than one epoch. Equivalent to
   * `!homogeneous`, named for the claim a caller actually needs to make.
   */
  crossesTransition: boolean;
  /**
   * True when any supplied month predates EOS, where the column was
   * unconstrained by assimilated AOD over land.
   */
  includesUnconstrainedOverLand: boolean;
  /** Plain statement of what the span rests on; never a correction. */
  caveat: string;
}

/**
 * The observing-system epoch a single aerosol data month falls in, or null for
 * a malformed month or one outside the aerosol layer's published record. Null
 * means "no epoch can be stated", never a default epoch.
 */
export function aerosolObservingEpochForMonth(
  month: YearMonth
): AerosolObservingEpoch | null {
  if (!isYearMonth(month)) return null;
  if (compareYm(month, LAYERS.aerosol.start) < 0) return null;

  return (
    AEROSOL_OBSERVING_EPOCHS.find(
      (epoch) =>
        compareYm(month, epoch.firstMonth) >= 0 &&
        (epoch.lastMonth === null || compareYm(month, epoch.lastMonth) <= 0)
    ) ?? null
  );
}

/**
 * Describe which MERRA-2 aerosol observing-system epochs a set of data months
 * touches, and whether the span is homogeneous.
 *
 * Months may be supplied in any order and are deduplicated internally, so a
 * caller can hand over exactly the months that fed a baseline, record, or trend
 * without pre-sorting them. Unlike a series statistic this needs no consecutive
 * run: a same-calendar-month baseline is deliberately full of gaps, and its
 * homogeneity question is the same one.
 *
 * Returns `null` — never a partial or defaulted answer — for an empty input or
 * if ANY supplied month is malformed or predates the aerosol layer's record.
 * A caller handing an out-of-record month has a bug, and silently classifying
 * the rest would understate what the span actually contains.
 */
export function describeAerosolObservingHomogeneity(
  months: readonly YearMonth[]
): AerosolObservingHomogeneity | null {
  if (months.length === 0) return null;

  // Deduplicate by month ordinal so a repeated month cannot inflate an epoch's
  // weight, then order oldest → newest for a well-defined span.
  const unique = new Map<number, YearMonth>();
  for (const month of months) {
    const epoch = aerosolObservingEpochForMonth(month);
    if (!epoch) return null;
    unique.set(ymToIndex(month), { ...month });
  }

  const ordered = [...unique.values()].sort(compareYm);
  const spans: AerosolObservingEpochSpan[] = [];

  for (const month of ordered) {
    // Non-null: every month was classified in the loop above.
    const epoch = aerosolObservingEpochForMonth(month)!;
    const open = spans.find((span) => span.epoch.id === epoch.id);
    if (open) {
      open.monthCount += 1;
      // `ordered` ascends, so the newest month seen for an epoch is its last.
      open.lastMonth = month;
    } else {
      spans.push({
        epoch,
        monthCount: 1,
        firstMonth: month,
        lastMonth: month,
      });
    }
  }

  const homogeneous = spans.length === 1;
  const includesUnconstrainedOverLand = spans.some(
    (span) => !span.epoch.aodConstrainedOverLand
  );

  return {
    kind: "aerosol-observing-epoch-span",
    isForecast: false,
    source: AEROSOL_SOURCE,
    firstMonth: ordered[0],
    lastMonth: ordered[ordered.length - 1],
    monthCount: ordered.length,
    spans,
    homogeneous,
    crossesTransition: !homogeneous,
    includesUnconstrainedOverLand,
    caveat: caveatFor(spans, homogeneous, includesUnconstrainedOverLand),
  };
}

function caveatFor(
  spans: readonly AerosolObservingEpochSpan[],
  homogeneous: boolean,
  includesUnconstrainedOverLand: boolean
): string {
  if (homogeneous) {
    const only = spans[0].epoch;
    return only.aodConstrainedOverLand
      ? `All months sit in one MERRA-2 observing-system epoch — ${only.label} — so the span is not affected by an assimilation change (${only.assimilatedAod}).`
      : `All months sit in the ${only.label} epoch, where ${only.assimilatedAod}; over land these values reflect the underlying model rather than assimilated AOD, though the span itself is internally consistent.`;
  }

  const named = spans.map((span) => span.epoch.label).join(", then ");
  const base =
    `These months span more than one MERRA-2 observing-system epoch (${named}), ` +
    "so a difference, trend, or record across them may reflect the change in " +
    "assimilated observations rather than a change in the atmosphere.";
  return includesUnconstrainedOverLand
    ? `${base} The span reaches back before EOS, when the only assimilated AOD was retrieved over ocean and the column over land was effectively unconstrained by observations.`
    : base;
}

/**
 * A compact, honest readout of an observing-epoch span with its cited source.
 * States what the span rests on; it never recommends discarding months or
 * implies the values have been adjusted.
 */
export function formatAerosolObservingHomogeneity(
  result: AerosolObservingHomogeneity
): string {
  const source = `${result.source.shortName} v${result.source.version}`;
  const window = `${formatMonth(result.firstMonth)}-${formatMonth(
    result.lastMonth
  )}`;
  const breakdown = result.spans
    .map(
      (span) =>
        `${span.epoch.label} ${formatMonth(span.firstMonth)}-${formatMonth(
          span.lastMonth
        )} (${span.monthCount} ${span.monthCount === 1 ? "month" : "months"})`
    )
    .join("; ");
  const verdict = result.homogeneous
    ? "one observing-system epoch"
    : `${result.spans.length} observing-system epochs`;

  return `${window}, ${result.monthCount} ${
    result.monthCount === 1 ? "month" : "months"
  } across ${verdict}: ${breakdown}. ${result.caveat} Source ${source}`;
}

function isYearMonth(value: YearMonth): boolean {
  return (
    Number.isInteger(value.year) &&
    Number.isInteger(value.month) &&
    value.month >= 1 &&
    value.month <= 12
  );
}

function formatMonth(month: YearMonth): string {
  return `${month.year}-${String(month.month).padStart(2, "0")}`;
}

/** The probe layer whose series is MERRA-2 assimilated aerosol optical depth. */
const AEROSOL_PROBE_LAYER = "aerosol";

/**
 * The observing-epoch span behind a probe series, or null for every layer but
 * aerosol and for a series carrying no months.
 *
 * The layer gate sits here rather than in the caller because the epoch table
 * describes one product: MERRA-2's assimilated AOD. The sibling atmosphere
 * layer ships from the same reanalysis stream and would classify without
 * complaint, yet its 2 m air temperature is constrained by an entirely
 * different observing system, so routing it through this table would label a
 * temperature series with an aerosol assimilation history.
 */
export function probeAerosolObservingEpoch(
  layerId: LayerId | undefined,
  months: readonly YearMonth[]
): AerosolObservingHomogeneity | null {
  if (layerId !== AEROSOL_PROBE_LAYER) return null;
  return describeAerosolObservingHomogeneity(months);
}

/**
 * The status-line clause qualifying a fitted aerosol trend with the observing
 * system it was fitted across, or null when there is nothing to qualify.
 *
 * Silent in three cases, each because the claim it corrects is absent:
 *
 *  - Not aerosol, or no months — `result` is null and no epoch is stated.
 *  - A span sitting inside one epoch. The homogeneous case is a fact about the
 *    record, not a caveat on a reading, and `formatAerosolObservingHomogeneity`
 *    already states it for a surface that wants the full breakdown.
 *  - No testable trend. This qualifies the *trend* printed beside it — the one
 *    statistic on the line that reads across the transition rather than
 *    summarizing months one at a time — so with no trend fitted there is no
 *    misattributable claim and the clause stays off. Same reason
 *    `aerosolCeilingCensoringClause` takes the trend.
 *
 * It states what the trend was fitted across and stops. It does not adjust,
 * homogenize, or withhold the trend, does not claim a discontinuity exists at
 * the probed point, and does not say the record's epochs disagree there — only
 * that the span cannot rule the change out, which is why the direction is not
 * attributable to the atmosphere alone.
 */
export function aerosolObservingEpochClause(
  result: AerosolObservingHomogeneity | null,
  trend: Pick<TrendSummary, "testable">
): string | null {
  if (!result || !result.crossesTransition || !trend.testable) return null;

  const source = `${result.source.shortName} v${result.source.version}`;
  const window = `${result.firstMonth.year}-${result.lastMonth.year}`;
  // Named from the epoch table rather than written out, so a boundary edit
  // cannot leave this sentence describing epochs the span no longer touches.
  const named = result.spans.map((span) => span.epoch.label).join(", then ");
  // The pre-EOS gap is over LAND only, and this helper does not know where the
  // caller sampled — so the arm is offered as the reason the change matters,
  // never as a statement about the probed point.
  const landGap = result.includesUnconstrainedOverLand
    ? ", and over land the earliest of those had no assimilated AOD at all"
    : "";
  return (
    `the ${window} record spans ${result.spans.length} MERRA-2 observing-system epochs ` +
    `(${named})${landGap}, so the trend fitted across them is not attributable to the ` +
    `atmosphere alone (source ${source})`
  );
}
