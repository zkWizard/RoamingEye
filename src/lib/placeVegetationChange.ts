import {
  DEFAULT_NDVI_CHANGE_STABILITY_THRESHOLD,
  summarizeNdviMonthlyChange,
  type NdviChangeDirection,
} from "./phenologyChange";
import type { YearMonth } from "./timeline";

/**
 * The month-over-month statement the place panel's vegetation card is allowed
 * to make about two sampled MOD13A3 NDVI values.
 *
 * The panel used to subtract the two values and print the signed difference
 * unconditionally. Two things make that a claim the observations cannot carry:
 *
 *  - A small NDVI difference between two monthly composites is not a detected
 *    change. `phenologyChange` already fixes a stability band for exactly this
 *    reason; this module reuses that band rather than restating it, so the
 *    panel and the phenology library cannot drift apart.
 *  - "Month over month" is only true when the two months are adjacent. The
 *    place panel takes the last two entries of a product's timeline, which is
 *    a consecutive pair for a monthly product but is not guaranteed to be one.
 *    `summarizeNdviMonthlyChange` forms a transition only across a
 *    one-calendar-month step and never bridges a gap, so a non-adjacent pair
 *    yields no comparison instead of a mislabelled one.
 *
 * Scientific honesty (kept here because the panel surfaces it):
 *  - A greening/browning label is the direction of the NDVI *index* between two
 *    composites. It is not a green-up or senescence event, a phenophase, a
 *    growth stage, or a statement about biomass, productivity, canopy cover,
 *    habitat quality, ecosystem condition, land cover, causes, or the future.
 *  - The difference is NOT deseasonalized. At most latitudes a one-month NDVI
 *    step is dominated by the annual cycle, so it must never be read as an
 *    anomaly against a baseline. The panel says so alongside the number.
 *  - Values outside the conventional [-1, 1] NDVI range are refused rather than
 *    shown, because NDVI is bounded by its own definition, (NIR - Red) /
 *    (NIR + Red); anything outside it is a decode or scaling error, not an
 *    observation. This mirrors `airTemperaturePlausibility` and
 *    `precipitationRatePlausibility` for the panel's other metrics.
 *
 * Dataset: NASA MODIS/Terra MOD13A3 v061 monthly NDVI, cited through the
 * existing `LAYERS.ndvi` DatasetRef that `phenologyChange` carries. No
 * provenance is introduced, altered, or dropped here.
 *
 * Reference for the vegetation-index product and its compositing:
 * Huete, A., Didan, K., Miura, T., Rodriguez, E. P., Gao, X., & Ferreira,
 * L. G. (2002). Overview of the radiometric and biophysical performance of the
 * MODIS vegetation indices. Remote Sensing of Environment, 83(1-2), 195-213.
 */

/** Why two sampled months could not be compared as a month-over-month step. */
export type PlaceVegetationNoComparisonReason =
  "not-consecutive-months" | "ndvi-out-of-range";

export type PlaceVegetationComparison =
  | {
      kind: "compared";
      /** Index direction only; never a biological determination. */
      direction: NdviChangeDirection;
      /** Later minus earlier, in unitless NDVI. */
      delta: number;
      /** |delta| at or below which the pair is reported as little change. */
      stabilityThreshold: number;
    }
  | { kind: "not-comparable"; reason: PlaceVegetationNoComparisonReason };

/**
 * The conventional NDVI range. A normalized difference of two non-negative
 * reflectances cannot fall outside it, so this is a definitional bound rather
 * than a climatological or ecological one.
 */
export const NDVI_VALID_RANGE = { min: -1, max: 1 } as const;

/** Whether a decoded value can be presented as an NDVI observation at all. */
export function isPlausibleNdvi(value: number | null): boolean {
  return (
    value !== null &&
    Number.isFinite(value) &&
    value >= NDVI_VALID_RANGE.min &&
    value <= NDVI_VALID_RANGE.max
  );
}

/**
 * Decide what the vegetation card may say about a sampled pair. Delegates the
 * adjacency rule, the range check, and the stability band to
 * `summarizeNdviMonthlyChange` so this module holds no second copy of them.
 *
 * The two values must already be calibrated NDVI (unitless), ordered earlier
 * then later, matching the months.
 */
export function placeVegetationComparison(
  months: readonly [YearMonth, YearMonth],
  ndvi: readonly [number, number]
): PlaceVegetationComparison {
  // Refuse an impossible value before anything else, so the reason reported
  // below is unambiguous. `summarizeNdviMonthlyChange` applies the same bound
  // internally; checking here only lets the two rejection causes be told apart.
  if (!isPlausibleNdvi(ndvi[0]) || !isPlausibleNdvi(ndvi[1])) {
    return { kind: "not-comparable", reason: "ndvi-out-of-range" };
  }

  // Latitude is deliberately not supplied: the card reports a month pair by
  // name and needs no hemisphere, and passing a placeholder would attach a
  // calendar-season label the panel does not show. `summarizeNdviMonthlyChange`
  // treats a non-finite latitude as an unknown hemisphere and assigns no
  // season, which is the honest outcome here.
  const summary = summarizeNdviMonthlyChange(
    [
      { month: months[0], ndvi: ndvi[0] },
      { month: months[1], ndvi: ndvi[1] },
    ],
    Number.NaN
  );

  const change = summary.changes[0];
  if (change) {
    return {
      kind: "compared",
      direction: change.direction,
      delta: change.delta,
      stabilityThreshold: summary.stabilityThreshold,
    };
  }

  // Both values were in range, so the only way no transition formed is that the
  // months are not one calendar month apart. The panel withholds the comparison
  // rather than presenting the difference under a "month over month" label.
  return { kind: "not-comparable", reason: "not-consecutive-months" };
}

export { DEFAULT_NDVI_CHANGE_STABILITY_THRESHOLD };
