import type { MonthlyClimateSummary } from "./climate";
import {
  formatPrecipitationRatePlausibility,
  precipitationRatePlausibility,
} from "./precipitationRatePlausibility";

/**
 * Keep a physically impossible precipitation rate from reaching the place panel
 * as if it were a measurement.
 *
 * The place-panel rainfall readout decodes rendered GIBS imagery back into a
 * native GLDAS monthly-mean rate (kg/m²/s) and formats it. `climate.ts` guards
 * publication, coverage, finiteness, and sign, but nothing on that wired path
 * checks *magnitude*: a colormap that changed upstream, a mis-scaled decode, or
 * a value left in mm/day still formats cleanly and is shown to the reader as a
 * real observation with a full citation attached. A confident wrong number is
 * worse than an honest gap, so this guard runs the existing gross-error band
 * (see precipitationRatePlausibility.ts) over the value that is about to be
 * rendered and withholds it when it falls outside.
 *
 * Scientific honesty (kept in the code because it reaches user-facing copy):
 *  - The band is a *gross-error* check, not a climatological range. Passing it
 *    is a sanity pass, never a correctness guarantee, so a plausible reading is
 *    returned completely untouched — this guard never edits, clamps, corrects,
 *    or re-scales a value it admits.
 *  - It is deliberately far wider than the wettest calendar month on record, so
 *    a genuine hydrologic extreme is never withheld — only impossible values.
 *  - A withheld reading means "this cannot be stated as an observation", never
 *    "no rain fell" and never "the true value is smaller".
 *  - The cited source is carried into the withheld message unchanged; a
 *    rejected value is still attributed to the product that produced it.
 */

/** The place-panel readout shape this guard filters (value + supporting detail). */
export interface PrecipitationReadoutText {
  value: string;
  detail: string;
}

/** Shown instead of a number that failed the gross-error band. */
export const PRECIPITATION_WITHHELD_VALUE = "Withheld";

/**
 * Return the supplied readout unchanged unless the summary is a precipitation
 * rate whose value fails the plausibility band, in which case the number is
 * replaced by a flagged, still-cited explanation.
 *
 * Non-precipitation summaries pass through untouched so this can never apply a
 * rainfall band to air temperature or soil moisture. A `not-usable` verdict also
 * passes through: an unpublished, uncovered, or missing month is already
 * reported honestly upstream, and restating it here would only lose that
 * detail.
 */
export function guardPrecipitationReadout(
  current: MonthlyClimateSummary,
  readout: PrecipitationReadoutText
): PrecipitationReadoutText {
  const plausibility = precipitationRatePlausibility(current);
  if (!plausibility) return readout;
  if (
    plausibility.status === "plausible" ||
    plausibility.status === "not-usable"
  ) {
    return readout;
  }

  return {
    value: PRECIPITATION_WITHHELD_VALUE,
    detail: `Reading withheld: ${formatPrecipitationRatePlausibility(
      plausibility
    )}`,
  };
}
