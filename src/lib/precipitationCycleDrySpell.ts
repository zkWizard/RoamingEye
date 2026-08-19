import type { PrecipitationAccumulation } from "./precipitationAccumulation";
import { SECONDS_PER_DAY } from "./precipitationAccumulation";
import type { PrecipitationAnnualCycle } from "./precipitationAnnualCycle";
import {
  precipitationDrySpell,
  type PrecipitationDrySpellOptions,
} from "./precipitationDrySpell";
import { addMonths, type DatasetRef, type YearMonth } from "./timeline";

/**
 * Read the dry-month *sequence* of a mean annual precipitation cycle, so a
 * probed place can also answer "how long does it go without water, and does
 * that arrive as one dry season or several spells?".
 *
 * `precipitationDrySpell.ts` (Köppen–Geiger dry-month runs) had never been
 * imported. It is the only whole-window precipitation descriptor in this
 * codebase that is order-DEPENDENT: the concentration index, the Walsh & Lawler
 * seasonality index and the Markham resultant already wired beside this reading
 * are all permutation-invariant, so they read identically for a year whose dry
 * months form one contiguous block and for a year whose dry months are
 * scattered. Run lengths are what separate the two, which is why this states
 * something none of them can.
 *
 * Why the cycle rather than the raw probe series:
 *  - `precipitationDrySpell` requires a strictly consecutive, gap-free run. A
 *    probe series is NOT gap-free — any month whose colour the legend cannot
 *    invert arrives as null — so feeding it the raw record would split a real
 *    dry stretch at every unreadable month and report a silent lower bound.
 *    The mean annual cycle is gap-free by construction: it reports
 *    `status: "available"` only when all twelve calendar months clear the
 *    years-per-month floor, which is the same condition the clause already
 *    requires before it says anything at all.
 *  - Twelve months is the window the descriptor is CALIBRATED for
 *    (`isAnnualWindow`), the one length at which its own docstring lets
 *    `longestDryRun` stand for a dry-season length and `dryMonthCount` be the
 *    Köppen dry-month count. Any other length carries no annual meaning.
 *
 * Scientific honesty (kept in code because the clause surfaces it):
 *  - This is climatological, exactly like the cycle it reads: a dry month here
 *    is a calendar month whose MEAN depth across the probed years falls below
 *    the threshold, not a dry month actually observed. A place can have a mean
 *    February of 61 mm and still have seen bone-dry Februaries.
 *  - The 60 mm break is the tropical dry-month convention, not a hazard
 *    threshold, and these counts are NOT a Köppen climate-type assignment,
 *    which additionally needs annual totals, air temperature and the
 *    driest-month rule.
 *  - No anomaly, normal, drought index, runoff, water-balance, causation or
 *    forecast is added or implied — this is a re-expression of the observed
 *    cycle's own shape.
 */

/** Calendar months in the annual window this descriptor is calibrated for. */
const CALENDAR_MONTHS_IN_YEAR = 12;

/**
 * Placeholder year for the synthetic twelve-month window handed to
 * `precipitationDrySpell`, which keys its consecutive-run check on real
 * `YearMonth`s. Only the YEAR is scaffolding: each synthetic month carries the
 * TRUE calendar month of the climatology entry it holds, so nothing about the
 * month identity is invented. A non-leap year is chosen so a synthetic February
 * takes the modal 28 days; `monthDays`/`monthSeconds` are unread by the
 * descriptor in any case, and the depths handed over are already integrated.
 */
const SYNTHETIC_CYCLE_YEAR = 2001;

/**
 * Dry-month sequence of a mean annual cycle. Deliberately narrower than the
 * descriptor's own return type: the window's `startMonth`/`endMonth` and
 * `longestDryRunStart`/`longestDryRunEnd` are dropped because they carry the
 * placeholder year and must never reach a reader as dates.
 *
 * `longestWetRun` is dropped for a different and stronger reason — see
 * {@link describePrecipitationCycleDrySpell}, whose rotation makes the DRY runs
 * exactly circular but leaves the wet runs able to wrap the window boundary.
 */
export interface PrecipitationCycleDrySpell {
  kind: "derived-precip-cycle-dry-spell";
  /** Explicitly prevents consumers from treating this as a forecast. */
  isForecast: false;
  /** Dry-month threshold applied, in mm (dry month = mean strictly below it). */
  dryMonthThresholdMm: number;
  /** Calendar months whose climatological mean depth is below the threshold. */
  dryMonthCount: number;
  /**
   * Separate dry spells in the cycle. 1 means the dry months form a single
   * contiguous dry season; a larger count means the year holds several.
   */
  drySpellCount: number;
  /** Longest run of consecutive dry calendar months; 0 when no month is dry. */
  longestDryRun: number;
  /** Cited GLDAS product carried through from the cycle; provenance preserved. */
  source: DatasetRef;
}

/**
 * Describe the dry-month sequence of a mean annual precipitation cycle, or null
 * when the cycle is absent, incomplete, or carries an unusable mean.
 *
 * **The rotation is load-bearing, not cosmetic.** A cycle is cyclic but
 * `precipitationDrySpell` reads a LINEAR window, so a dry season straddling the
 * turn of the calendar year — Nov–Mar, the ordinary Northern-Hemisphere
 * wet-and-dry case — would be cut into a run of two and a run of three and
 * reported as a three-month dry season. This therefore hands the descriptor the
 * twelve calendar months rotated to START at the cycle's WETTEST month, which
 * makes the linear longest dry run exactly equal to the circular one:
 *
 *  - If the wettest month is at or above the threshold it is a WET month, and
 *    it sits at position 0. No dry run can then contain position 0, so no dry
 *    run is truncated at the window start; and a run reaching position 11
 *    genuinely ends there, because the month that would continue it is that
 *    same wet position 0.
 *  - If the wettest month is itself below the threshold then every month is,
 *    since no month exceeds the wettest. The window is one dry run of twelve,
 *    which is also the circular answer.
 *
 * The same argument does NOT hold for wet runs — two wet months at positions 11
 * and 0 are contiguous on the circle but split in the window — which is why
 * `longestWetRun` is not carried through.
 */
export function describePrecipitationCycleDrySpell(
  cycle: PrecipitationAnnualCycle | null,
  options: PrecipitationDrySpellOptions = {}
): PrecipitationCycleDrySpell | null {
  if (!cycle) return null;
  if (cycle.status !== "available") return null;

  const wettest = cycle.wettestMonth;
  if (!wettest) return null;

  const meanByCalendarMonth = new Map<number, number>();
  for (const entry of cycle.monthlyClimatology) {
    // A negative or non-finite mean depth would make a "dry month" meaningless;
    // withhold rather than classify it.
    if (!Number.isFinite(entry.meanMm) || entry.meanMm < 0) return null;
    meanByCalendarMonth.set(entry.calendarMonth, entry.meanMm);
  }
  // `status: "available"` already implies a full cycle; re-checking here keeps
  // this readable without trusting a field it does not own.
  if (meanByCalendarMonth.size !== CALENDAR_MONTHS_IN_YEAR) return null;

  const start: YearMonth = {
    year: SYNTHETIC_CYCLE_YEAR,
    month: wettest.calendarMonth,
  };

  const accumulations: PrecipitationAccumulation[] = [];
  for (let offset = 0; offset < CALENDAR_MONTHS_IN_YEAR; offset++) {
    const dataMonth = addMonths(start, offset);
    const meanMm = meanByCalendarMonth.get(dataMonth.month);
    if (meanMm === undefined) return null;
    const monthDays = daysInMonth(dataMonth);
    accumulations.push({
      kind: "derived-monthly-precip-accumulation",
      isForecast: false,
      totalMm: meanMm,
      dataMonth,
      monthDays,
      monthSeconds: monthDays * SECONDS_PER_DAY,
      // The cycle reports a mean over the years that cleared its own
      // coverage floor; a per-month usable share does not survive that
      // averaging, so none is claimed here.
      validFraction: null,
      sourceImageDimensions: null,
      source: cycle.source,
    });
  }

  const spell = precipitationDrySpell(accumulations, options);
  if (!spell) return null;

  return {
    kind: "derived-precip-cycle-dry-spell",
    isForecast: false,
    dryMonthThresholdMm: spell.dryMonthThresholdMm,
    dryMonthCount: spell.dryMonthCount,
    drySpellCount: spell.drySpellCount,
    longestDryRun: spell.longestDryRun,
    source: spell.source,
  };
}

/**
 * Calendar days in a synthetic cycle month. The months are built here from a
 * valid year and a 1–12 calendar month, so no malformed-input branch is
 * reachable; day 0 of the following month is the last day of the intended one.
 */
function daysInMonth(month: YearMonth): number {
  return new Date(Date.UTC(month.year, month.month, 0)).getUTCDate();
}
