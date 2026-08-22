import {
  describeSnowCoverRecordMargin,
  type SnowCoverRecordMargin,
} from "./snowCoverRecordMargin";
import type { SnowCoverObservation } from "./snowCover";
import type { ProbeValuePrecision } from "./probeSoilMoistureStanding";
import { MONTH_NAMES, type LayerId, type YearMonth } from "./timeline";

/**
 * Bridge the probe's sampled monthly series into the same-calendar-month
 * snow-cover record standing, so the record the probe already fetches can say
 * something about the month the reader actually probed.
 *
 * The snow status line is entirely CLIMATOLOGY: a count of returned months, the
 * record's min, mean and max, a per-value uncertainty, an accuracy figure, a
 * seasonally corrected trend and a spatial-support note. Every one of those
 * describes the whole record. None answers the plainest question a reader has
 * about the month on screen — *was this month's snow extent remarkable for here,
 * at this time of year?* — and the record's `max` cannot stand in for it: that
 * max is the high across all twelve calendar months at once, so in any seasonal
 * place it is simply the mid-winter peak, and a record-setting May beats nothing
 * the panel prints.
 *
 * `snowCoverRecordMargin.ts` derives exactly that standing (delegating its
 * sample gathering to the audited `snowCoverPercentile.ts` baseline), and until
 * now nothing had ever called either module.
 *
 * ## Why only the SNOWIEST standing is reported
 *
 * This bridge deliberately renders `most-in-record` and nothing else. The reason
 * is a property of the rendered imagery, not a matter of taste:
 *
 * GIBS draws percent 0 of `MODIS_NDSI_Snow_Cover` as TRANSPARENT (see
 * snowCoverRamp.ts, and the caption the Legend already carries). A snow-free
 * month is therefore not drawn at all, the probe's colormap inversion returns
 * `null` for it, and it never becomes a baseline sample. The retained record is
 * consequently biased *upward*: it holds only the months that had snow.
 *
 * That bias destroys any low-end reading. A `least-in-record` claim would rank
 * the target against a record from which the lowest physically possible value
 * has been systematically removed, and an empirical percentile drawn from the
 * same samples is understated for the same reason — a month at the "30th
 * percentile" of the retained years could sit above the true median once the
 * dropped snow-free years are counted. Neither is reportable, so neither is
 * reported.
 *
 * The snowiest standing survives the same bias untouched. Dropping zero-valued
 * months cannot change which retained month held the maximum, so "snowiest of N
 * prior same-month observations" is exactly true of the N observations named,
 * and the margin to the month that held that maximum is a difference of two
 * drawn, inverted values. The clause says "this record only" and names the
 * absence of snow-free months so a reader can see what the N does and does not
 * cover.
 *
 * Like every snow helper this works on MOD10CM's monthly-average fractional
 * snow-covered-area percentage — never snow depth, snow-water-equivalent, melt
 * or accumulation rate, runoff, water volume, cause, or any future value.
 *
 * Pure, render-free logic (see probeSnowCoverStanding.test.ts).
 */

/** The probe layer whose sampled values are MOD10CM snow-covered area. */
const SNOW_PROBE_LAYER = "snow";

/**
 * Unit the record margin reports its percentage-point differences in. Asserted
 * rather than assumed so a redefinition upstream drops the phrase instead of
 * silently mis-labelling it (pinned in probeSnowCoverStanding.test.ts).
 */
const SNOW_RECORD_UNIT = "% snow-covered area";

/** Unit the probe's own snow scale renders values in (`PROBE_SCALES.snow`). */
const SNOW_PROBE_UNIT = "%";

/** Later of two months, used to track the series' own publication frontier. */
function isAfter(month: YearMonth, other: YearMonth): boolean {
  return (
    month.year > other.year ||
    (month.year === other.year && month.month > other.month)
  );
}

/**
 * Place the probe series' most recent observed month against the prior
 * same-calendar-month record, or null when the layer is not snow cover or the
 * series carries no observed month.
 *
 * The TARGET is the latest month with a usable value rather than the latest
 * month requested: GIBS serves the snow layer as seven disjoint time ranges and
 * draws cloud, night, water and fill as flag colours the probe rejects, so the
 * most recent requested month is frequently unusable at a given place, and
 * ranking a null would report the record's standing against nothing. Every other
 * sampled month becomes a baseline candidate; `describeSnowCoverPercentile`
 * (inside the record margin) does all the calendar-month matching,
 * deduplication, coverage filtering, target-year exclusion, and the ten-sample
 * floor, so months of the wrong calendar month or the target's own year are
 * dropped there rather than here.
 *
 * Unlike the soil-moisture bridge this does NOT require a footprint share.
 * Snow's baseline treats a missing `validFraction` as "no coverage was supplied"
 * rather than as insufficient coverage — its own documented choice — so a point
 * probe, which measures no footprint at all, is ranked on the values alone
 * rather than refused. Shares are still passed through whenever the sampler
 * provides them, and the coverage floor still screens them.
 *
 * `availableThrough` is the latest month the probe actually supplied. The probe
 * requests only months the layer publishes, so the series' own last month is a
 * safe publication frontier: it can never admit a month the product has not
 * released, and every earlier sampled month stays eligible.
 */
export function probeSnowCoverRecordMargin(
  layerId: LayerId | undefined,
  months: readonly YearMonth[],
  values: readonly (number | null)[],
  validFractions: readonly (number | null)[] | null
): SnowCoverRecordMargin | null {
  if (layerId !== SNOW_PROBE_LAYER) return null;

  const observations: SnowCoverObservation[] = [];
  let availableThrough: YearMonth | null = null;
  let targetIndex: number | null = null;
  for (let index = 0; index < months.length; index++) {
    const month = months[index];
    if (!month) continue;
    const value = values[index] ?? null;
    const share = validFractions?.[index] ?? null;
    observations.push(
      share === null
        ? { dataMonth: month, snowCoveredPercent: value }
        : { dataMonth: month, snowCoveredPercent: value, validFraction: share }
    );
    if (availableThrough === null || isAfter(month, availableThrough)) {
      availableThrough = month;
    }
    // The series is not guaranteed to arrive in calendar order, so the latest
    // OBSERVED month is tracked by comparison rather than by position.
    if (
      value !== null &&
      (targetIndex === null ||
        isAfter(month, observations[targetIndex].dataMonth))
    ) {
      targetIndex = observations.length - 1;
    }
  }
  if (availableThrough === null || targetIndex === null) return null;

  return describeSnowCoverRecordMargin(
    observations[targetIndex],
    observations.filter((_, index) => index !== targetIndex),
    availableThrough
  );
}

/**
 * "6.3 percentage points above Mar 2004" — how far a new same-month snow record
 * beat the month that held it, or "" when no margin can honestly be quoted.
 *
 * The unit is percentage POINTS, not percent: both ends are already percentages
 * of a footprint, so their difference is a point spread. Writing it as "%" would
 * invite reading it as a relative change.
 *
 * Three conditions have to hold, and each drops the phrase in silence rather
 * than softening it:
 *
 *  - The margin clears the probe's own value resolution. Each end of the
 *    difference is a colormap inversion carrying half a LUT step (±0.2 points on
 *    snow's 0-100 scale), so a record won by less than one step is not something
 *    this method resolved — the standing still holds, but its size does not.
 *
 *  - Both units are the ones this arithmetic was checked against. Snow needs no
 *    conversion (the record's percentage points and the probe's percent scale
 *    are the same quantity), so BOTH are asserted by name rather than merely
 *    compared with each other: the record's unit string and the probe's differ
 *    in wording while describing the same thing, so an equality test between
 *    them would reject every margin.
 *
 *  - A month actually held the breached extreme. Ties resolve to the earliest
 *    holder, matching the convention the seasonal helpers already use.
 */
function recordMarginPhrase(
  margin: SnowCoverRecordMargin,
  precision: ProbeValuePrecision | null
): string {
  if (!precision) return "";
  const { recordExceedanceMargin } = margin;
  if (recordExceedanceMargin === null) return "";
  if (margin.unit !== SNOW_RECORD_UNIT) return "";
  if (precision.unit !== SNOW_PROBE_UNIT) return "";
  if (recordExceedanceMargin < precision.resolution) return "";

  const heldBy = margin.priorMostMonth;
  if (!heldBy) return "";
  const heldByName = MONTH_NAMES[heldBy.month - 1];
  if (!heldByName) return "";

  const size = recordExceedanceMargin.toFixed(precision.decimals);
  return `${size} percentage points above ${heldByName} ${heldBy.year}`;
}

/**
 * One-line probe clause for a new same-calendar-month snow-cover record, or ""
 * when none can be stated.
 *
 * Silence is the default and covers every other case at once: a layer that is
 * not snow, a record too short for the ten-sample floor, a target month GIBS
 * does not distribute, a footprint the coverage floor rejected, a month strictly
 * inside the sampled range, a tie, and — for the reason set out at the top of
 * this module — every low-snow standing. None of those is worth a line of its
 * own on a panel that already says when a probe came back empty, and a clause
 * that fires on an ordinary month would put a second number on most probes.
 *
 * The single parenthetical carries the scope limit, the provenance and the one
 * censoring fact together rather than appending further qualifiers to the same
 * reading.
 */
export function snowCoverStandingClause(
  margin: SnowCoverRecordMargin | null,
  precision: ProbeValuePrecision | null = null
): string {
  if (!margin || margin.standing !== "most-in-record") return "";
  const phrase = recordMarginPhrase(margin, precision);
  if (!phrase) return "";

  const dataMonth = margin.target.dataMonth;
  const monthName = MONTH_NAMES[dataMonth.month - 1];
  if (!monthName) return "";
  const { sampleCount } = margin;
  // The repo's established phrasing for a same-calendar-month record: it states
  // the calendar-month restriction that makes the standing meaningful, and
  // avoids pluralising an abbreviated month name, where "21 prior Mars" would
  // name a planet.
  const priors = `${sampleCount} prior same-month observation${sampleCount === 1 ? "" : "s"}`;

  return `snow cover ${monthName} ${dataMonth.year} snowiest of ${priors}, ${phrase} (this record only, MOD10CM monthly-average snow-covered area; snow-free months are undrawn and absent from it)`;
}
