import { climateObservationPlausibility } from "./meteorology";
import type { MonthlyClimateSummary } from "./climate";
import type { GldasRampSaturationSummary } from "./gldasRampSaturation";

/**
 * How a GLDAS legend cap propagates from a monthly mean into the month-over-month
 * difference the place panel states beside it (hydrology).
 *
 * `gldasRampSaturation.ts` establishes the single-month fact: the top swatch of
 * both GLDAS ramps is an open-ended "≥" cap, a pixel painted with it inverts to
 * `null`, and because that cap sits at the *wet* end the surviving mean is a
 * lower bound rather than an estimate. The place card says so for the month whose
 * value it leads with.
 *
 * The card also reports a difference against the month before, and that clause
 * inherits the same one-sidedness — from whichever endpoint was capped. Only the
 * displayed month's colours were ever classified, so the earlier endpoint's cap
 * was invisible and the difference read as an ordinary measurement.
 *
 * The direction follows from the cap being one-sided in a known direction, so it
 * can be stated rather than merely hedged. Writing `t` for a true mean and `s`
 * for the mean over the survivors, a capped month has `t >= s` and an uncapped
 * one has `t === s`:
 *
 *  - later capped, earlier not — `t_later - s_earlier >= s_later - s_earlier`,
 *    so the stated difference is a **lower bound** on the change;
 *  - earlier capped, later not — `s_later - t_earlier <= s_later - s_earlier`,
 *    so it is an **upper bound**;
 *  - both capped — a difference of two lower bounds, so **neither**: the sign of
 *    the bias is not determined and no bound is claimed.
 *
 * This states that structure and stops. It never estimates how far past a cap a
 * month actually sat, corrects the difference, or reads any condition — drought,
 * flood, recharge, runoff, water-balance closure, cause, or a future value — into
 * a cap. Pure, render-free logic (see gldasCensoredChange.test.ts).
 */

export const GLDAS_CENSORED_CHANGE_LIMITATIONS = [
  "The bound is a direction only: it says which way the unresolvable part of a capped mean can move the difference, never by how much.",
  "Both endpoints must have been classified against the layer's published colormap; an unclassified month yields no clause rather than an assumed-uncapped one.",
  "A capped cell is a one-sided lower bound on that cell, so a capped mean is never reported as a measurement and the difference taken from it is never corrected.",
  "This qualifies an already-stated difference only; it never creates, withholds, or re-signs one, and it never infers a hydrologic condition, cause, or future value.",
] as const;

/** Which way a legend cap can move the stated month-over-month difference. */
export type GldasCensoredChangeDirection =
  /** Later month capped only: the true change is at or above the stated one. */
  | "lower-bound"
  /** Earlier month capped only: the true change is at or below the stated one. */
  | "upper-bound"
  /** Both months capped: a difference of two lower bounds, direction unknown. */
  | "undetermined";

export interface GldasCensoredChange {
  kind: "gldas-censored-change";
  /** Explicitly prevents consumers from treating this as a forecast. */
  isForecast: false;
  direction: GldasCensoredChangeDirection;
  earlierCeilingCount: number;
  laterCeilingCount: number;
  limitations: readonly string[];
}

export interface GldasCensoredChangeInput {
  earlier: MonthlyClimateSummary;
  later: MonthlyClimateSummary;
  /** Positions for the earlier month; `null` when its colours were not read. */
  earlierSaturation: GldasRampSaturationSummary | null | undefined;
  /** Positions for the later month; `null` when its colours were not read. */
  laterSaturation: GldasRampSaturationSummary | null | undefined;
}

/**
 * Classify how the caps on the two endpoints bound the difference between them.
 *
 * `null` whenever no cap took a sample on either side — an uncensored pair needs
 * no qualification — or whenever either month's colours were never classified,
 * because an unread month is not an uncapped one.
 */
export function describeGldasCensoredChange(
  input: GldasCensoredChangeInput
): GldasCensoredChange | null {
  const { earlierSaturation, laterSaturation } = input;
  if (!earlierSaturation || !laterSaturation) return null;
  const earlierCeilingCount = earlierSaturation.ceilingCount;
  const laterCeilingCount = laterSaturation.ceilingCount;
  if (earlierCeilingCount === 0 && laterCeilingCount === 0) return null;
  return {
    kind: "gldas-censored-change",
    isForecast: false,
    direction:
      earlierCeilingCount > 0 && laterCeilingCount > 0
        ? "undetermined"
        : laterCeilingCount > 0
          ? "lower-bound"
          : "upper-bound",
    earlierCeilingCount,
    laterCeilingCount,
    limitations: GLDAS_CENSORED_CHANGE_LIMITATIONS,
  };
}

/**
 * Whether the place card actually rendered a month-over-month difference.
 *
 * `climateInsightText` keeps its own admissibility rule private, so this mirrors
 * the parts that can vary at the place panel's call site: both endpoints must be
 * published, usable observations, neither may have failed the gross-error band,
 * and the comparison month must be the earlier one. The remaining checks that
 * rule guards — same metric, same native unit, same source product — are
 * structurally satisfied there, because both summaries are built for one layer
 * from one sample.
 *
 * `gldasCensoredChange.test.ts` pins this against `climateInsightText`'s rendered
 * output rather than against a copy of its source, so the two cannot drift apart
 * silently.
 */
export function gldasChangeIsStated(
  earlier: MonthlyClimateSummary,
  later: MonthlyClimateSummary
): boolean {
  if (!isUsableObservation(earlier) || !isUsableObservation(later))
    return false;
  if (
    climateObservationPlausibility(earlier).status === "implausible" ||
    climateObservationPlausibility(later).status === "implausible"
  ) {
    return false;
  }
  return isStrictlyEarlier(earlier, later);
}

/**
 * The place card's clause for a censored difference — silent by default.
 *
 * Returns "" whenever no cap touched either endpoint, whenever a month's colours
 * were never classified, and whenever the card stated no difference to qualify —
 * so an ordinary reading is unchanged and a card that only ever showed one month
 * never gains a sentence about a comparison it did not make.
 */
export function gldasCensoredChangeNote(
  input: GldasCensoredChangeInput
): string {
  const { earlier, later } = input;
  if (!gldasChangeIsStated(earlier, later)) return "";
  const change = describeGldasCensoredChange(input);
  if (!change) return "";

  // Formatted here rather than taken from the caller so the clause cannot label
  // a month differently from the difference it qualifies.
  const earlierMonthLabel = formatMonth(earlier.dataMonth);
  const capped = (count: number, summary: GldasRampSaturationSummary) =>
    `${count} of ${summary.consideredSamples} cells`;
  switch (change.direction) {
    case "lower-bound":
      // Stated against the earlier month's own cell count because the clause it
      // follows can only say the earlier shortfall *may* be cap-related; this
      // settles it, so the two must not read as contradicting each other.
      return `; classified against the same colormap, the ${earlierMonthLabel} mean it is differenced against reached the cap in none of its ${input.earlierSaturation!.consideredSamples} cells, so the difference above is a lower bound on the change — resolving the capped cells here could only widen it`;
    case "upper-bound":
      return `; the ${earlierMonthLabel} mean it is differenced against was itself capped at ${capped(
        change.earlierCeilingCount,
        input.earlierSaturation!
      )} while this month reached no cap, so the difference above is an upper bound on the change`;
    case "undetermined":
      return `; both months reached the cap (${capped(
        change.earlierCeilingCount,
        input.earlierSaturation!
      )} in ${earlierMonthLabel}, ${capped(
        change.laterCeilingCount,
        input.laterSaturation!
      )} here), so the difference above is a difference of two lower bounds and is neither an estimate nor a bound in a known direction`;
  }
}

function isUsableObservation(summary: MonthlyClimateSummary): boolean {
  return (
    summary.publicationStatus === "published" &&
    summary.coverage.status === "available" &&
    summary.observedValue !== null
  );
}

/** Matches the place card's own `YYYY-MM` rendering, invalid guard included. */
function formatMonth(month: MonthlyClimateSummary["dataMonth"]): string {
  if (
    !Number.isInteger(month.year) ||
    !Number.isInteger(month.month) ||
    month.month < 1 ||
    month.month > 12
  ) {
    return "an invalid month";
  }
  return `${month.year}-${String(month.month).padStart(2, "0")}`;
}

function isStrictlyEarlier(
  earlier: MonthlyClimateSummary,
  later: MonthlyClimateSummary
): boolean {
  const a = earlier.dataMonth;
  const b = later.dataMonth;
  return a.year !== b.year ? a.year < b.year : a.month < b.month;
}
