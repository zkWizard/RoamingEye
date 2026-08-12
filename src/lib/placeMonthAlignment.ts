import { compareYm, formatYm, ymToIndex, type YearMonth } from "./timeline";

/**
 * Provenance-first contemporaneity descriptor for the place panel's cards.
 *
 * The panel puts vegetation, rainfall, soil moisture, air temperature, and sea
 * surface temperature side by side, and each card independently reads the
 * latest month *its own* product publishes. Those calendars differ: the GLDAS
 * fields, MERRA-2, MODIS SST, and the MODIS vegetation composite each carry a
 * different publication lag, so the five cards routinely refer to different
 * months. Laid out as one grid under one place name they read as a single
 * snapshot of that place, which they are not.
 *
 * The panel's standing note only ever hedged that products "may publish on
 * different monthly schedules". This module replaces that hedge with the
 * measured structure: it partitions the cards into cohorts sharing one month,
 * reports the span those months cover, and says plainly when the panel is not
 * contemporaneous. Only cards inside one cohort may be read together in time.
 *
 * Scope, deliberately narrow: this is a descriptor over data months only. It
 * never reads, combines, compares, or ranks the card values, and it infers no
 * condition, change, trend, causation, or forecast. It is the panel-level
 * counterpart of `briefCoObservation.ts` (which groups a composed brief's
 * signals) and, like it, identifies cards by their user-facing label — each
 * card's dataset citation is carried by the card itself and by the observation
 * export, and is not restated here.
 */

/** One place-panel card and the month it reads. */
export interface PlaceMonthCard {
  /** The card's user-facing label, as the panel renders it. */
  label: string;
  /** The monthly product time the card reads for this place. */
  month: YearMonth;
}

/** The cards that read one shared month. */
export interface PlaceMonthCohort {
  month: YearMonth;
  /** Card labels for this month, in panel order. */
  labels: string[];
}

export interface PlaceMonthAlignment {
  kind: "place-month-alignment";
  /** Cohorts sharing a month, oldest first. */
  cohorts: PlaceMonthCohort[];
  cardCount: number;
  /** Earliest and latest month any card reads; null when no card supplied one. */
  earliest: YearMonth | null;
  latest: YearMonth | null;
  /**
   * Inclusive count of calendar months from `earliest` to `latest` — 1 when
   * every card shares a month. Null when no card supplied a month.
   */
  spanMonths: number | null;
  /**
   * True when 2+ cards all read one month. False for a single card, where
   * contemporaneity between cards is not a meaningful concept.
   */
  contemporaneous: boolean;
  /** Honest one-line statement; carries no value, condition, or fitness claim. */
  statement: string;
  limits: readonly string[];
}

const ALIGNMENT_LIMITS = [
  "Describes the month each card reads, not what it observed: a card reporting no usable coverage contributes no observation for its month.",
  "Cards in different cohorts were observed in different months and must not be read as contemporaneous.",
  "A shared month makes two cards contemporaneous, not commensurate — see the within-month aggregation and quantity-kind descriptors.",
];

/**
 * Group the place panel's cards by the month each reads. Cards without a valid
 * month are dropped rather than assigned one; a month is never inferred.
 */
export function summarizePlaceMonthAlignment(
  cards: readonly PlaceMonthCard[]
): PlaceMonthAlignment {
  const cohortsByMonth = new Map<string, PlaceMonthCohort>();
  let cardCount = 0;
  for (const card of cards) {
    if (!isValidMonth(card.month)) continue;
    cardCount += 1;
    const key = `${card.month.year}-${card.month.month}`;
    const existing = cohortsByMonth.get(key);
    if (existing) existing.labels.push(card.label);
    else cohortsByMonth.set(key, { month: card.month, labels: [card.label] });
  }

  const cohorts = [...cohortsByMonth.values()].sort((a, b) =>
    compareYm(a.month, b.month)
  );
  const earliest = cohorts.length ? cohorts[0].month : null;
  const latest = cohorts.length ? cohorts[cohorts.length - 1].month : null;
  const spanMonths =
    earliest && latest ? ymToIndex(latest) - ymToIndex(earliest) + 1 : null;

  return {
    kind: "place-month-alignment",
    cohorts,
    cardCount,
    earliest,
    latest,
    spanMonths,
    contemporaneous: cardCount >= 2 && cohorts.length === 1,
    statement: alignmentStatement(cardCount, cohorts, spanMonths),
    limits: ALIGNMENT_LIMITS,
  };
}

function alignmentStatement(
  cardCount: number,
  cohorts: readonly PlaceMonthCohort[],
  spanMonths: number | null
): string {
  if (cardCount === 0) {
    return "No card supplied a data month; contemporaneity cannot be assessed.";
  }
  if (cardCount === 1) {
    return `1 card, reading ${formatYm(cohorts[0].month)}; contemporaneity needs two or more cards.`;
  }
  if (cohorts.length === 1) {
    return `All ${cardCount} cards read ${formatYm(cohorts[0].month)}, so they are contemporaneous.`;
  }
  const clauses = cohorts.map(cohortClause).join("; ");
  // The one causal clause here is about publication schedules — a verifiable
  // property of the products — never about the environment the cards describe.
  return `Each product publishes on its own schedule, so these ${cardCount} cards are not one contemporaneous snapshot: they span ${spanMonths} months, ${formatYm(
    cohorts[0].month
  )} to ${formatYm(
    cohorts[cohorts.length - 1].month
  )}. ${clauses}. Only cards reading the same month may be compared in time.`;
}

function cohortClause(cohort: PlaceMonthCohort): string {
  const month = formatYm(cohort.month);
  if (cohort.labels.length === 1) return `${cohort.labels[0]} reads ${month}`;
  return `${joinLabels(cohort.labels)} read ${month}`;
}

function joinLabels(labels: readonly string[]): string {
  if (labels.length === 2) return `${labels[0]} and ${labels[1]}`;
  return `${labels.slice(0, -1).join(", ")}, and ${labels[labels.length - 1]}`;
}

function isValidMonth(month: YearMonth | null | undefined): month is YearMonth {
  return (
    !!month &&
    Number.isInteger(month.year) &&
    Number.isInteger(month.month) &&
    month.month >= 1 &&
    month.month <= 12
  );
}
