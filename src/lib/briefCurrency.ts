import type {
  EnvironmentSignalBrief,
  EnvironmentSignalId,
} from "./environmentBrief";
import { ymToIndex, type DatasetRef, type YearMonth } from "./timeline";

/**
 * Provenance-first data-currency descriptor: is the brief showing the newest
 * *published* month for each signal, or does newer data already exist?
 *
 * The environment brief composes independent monthly products that each publish
 * on their own schedule and carry their own availability horizon (the month
 * "through which the caller had confirmed source availability"; the brief models
 * this per signal via `availableThroughBySignal`). This module states, per
 * signal, how many published months sit between the shown data month and that
 * signal's own horizon — i.e. how many newer composites the current selection
 * is not showing — and buckets that distance into a neutral, purely-temporal
 * tier.
 *
 * It answers "am I viewing the latest confirmed-available composite for this
 * signal?" and nothing more. The distance is a month count against a *published
 * horizon*, NOT a quality, fitness, or reliability judgement. Every observation
 * keeps its source `DatasetRef`.
 *
 * This is deliberately distinct from — and composes with — the brief's other
 * provenance descriptors:
 *   - observation recency measures lag from an external "as-of" reference month
 *     (one reference shared across all signals: how *old* is the data?); currency
 *     measures against each product's *own* published horizon (is *newer* data
 *     available?). Recency's single-reference design cannot express per-product
 *     horizons, so a signal that is old only because its product lags is not
 *     distinguished from one that is old because a newer composite went
 *     unselected — currency draws exactly that distinction.
 *   - temporal alignment measures the spread *among* the signals' data months;
 *     currency measures each signal against its horizon, not against the others.
 */

export type CurrencyTier =
  /** Data month equals the availability horizon: the latest published month. */
  | "at-latest"
  /** Exactly one newer published month exists beyond the shown month. */
  | "one-behind"
  /** 2–3 newer published months exist beyond the shown month. */
  | "recent"
  /** 4–6 newer published months exist beyond the shown month. */
  | "lagging"
  /** 7 or more newer published months exist beyond the shown month. */
  | "well-behind"
  /** Data month is later than the horizon (a not-yet-published selection). */
  | "ahead-of-horizon"
  /** Data month or horizon is not a valid year-month; currency is undatable. */
  | "undatable";

/**
 * The availability checkpoints the brief was composed with, in the exact shape
 * of {@link EnvironmentBriefInput}'s availability fields, so a caller passes the
 * same object it used to compose the brief. Vegetation resolves to the shared
 * `availableThrough` (the brief's own input model carries no vegetation-specific
 * horizon); the three climate signals prefer their own entry when supplied.
 */
export interface BriefAvailability {
  availableThrough: YearMonth;
  availableThroughBySignal?: Partial<
    Record<Exclude<EnvironmentSignalId, "vegetation">, YearMonth>
  >;
}

export interface SignalCurrency {
  id: EnvironmentSignalId;
  label: string;
  dataMonth: YearMonth;
  /** The availability horizon this signal's currency was measured against. */
  availableThrough: YearMonth;
  /**
   * Whole published months between the shown data month and the horizon
   * (`availableThrough − dataMonth`): 0 at the latest month, positive when
   * newer published data exists, negative when the selection is ahead of the
   * confirmed horizon, null when either month is not a valid year-month.
   */
  monthsBehindLatest: number | null;
  tier: CurrencyTier;
  source: DatasetRef;
  /** Honest, source-carrying sentence; no fitness or quality claim. */
  statement: string;
}

export interface BriefCurrencySummary {
  observations: SignalCurrency[];
  /** Signals already showing their latest confirmed-available month. */
  atLatestSignalIds: EnvironmentSignalId[];
  /** Signals for which newer published data exists (monthsBehindLatest > 0). */
  behindSignalIds: EnvironmentSignalId[];
  /** Largest month gap behind a horizon among datable signals; null if none. */
  maxMonthsBehind: number | null;
  /** True only when 1+ signals are datable and every one is at its latest. */
  allAtLatest: boolean;
  /** Honest summary sentence; currency is publication cadence, not fitness. */
  statement: string;
}

/** Bucket a whole-month gap-behind-horizon into a neutral, temporal tier. */
export function classifyCurrency(monthsBehindLatest: number): CurrencyTier {
  if (monthsBehindLatest < 0) return "ahead-of-horizon";
  if (monthsBehindLatest === 0) return "at-latest";
  if (monthsBehindLatest <= 3)
    return monthsBehindLatest === 1 ? "one-behind" : "recent";
  if (monthsBehindLatest <= 6) return "lagging";
  return "well-behind";
}

/**
 * Resolve the availability horizon governing one signal, mirroring the brief's
 * own `availableThroughFor`: a climate signal uses its per-signal checkpoint
 * when supplied, otherwise the shared one; vegetation always uses the shared
 * checkpoint (the brief input carries no vegetation-specific horizon).
 */
function horizonFor(
  id: EnvironmentSignalId,
  availability: BriefAvailability
): YearMonth {
  if (id === "vegetation") return availability.availableThrough;
  return (
    availability.availableThroughBySignal?.[id] ?? availability.availableThrough
  );
}

/**
 * Assess how current each dated signal is against its own product's published
 * availability horizon. Signals with no supplied observation (null data month)
 * carry no month to place and are dropped; a signal whose data month or horizon
 * is not a valid year-month is still listed (provenance is preserved) but
 * contributes no gap to the range statistics.
 */
export function summarizeBriefCurrency(
  signals: EnvironmentSignalBrief[],
  availability: BriefAvailability
): BriefCurrencySummary {
  const assessed: SignalCurrency[] = [];
  for (const signal of signals) {
    if (signal.dataMonth === null) continue;
    assessed.push(assessOne(signal, signal.dataMonth, availability));
  }

  const datable = assessed.filter(
    (o): o is SignalCurrency & { monthsBehindLatest: number } =>
      o.monthsBehindLatest !== null
  );
  const atLatestSignalIds = datable
    .filter((o) => o.monthsBehindLatest === 0)
    .map((o) => o.id);
  const behindSignalIds = datable
    .filter((o) => o.monthsBehindLatest > 0)
    .map((o) => o.id);
  const maxMonthsBehind =
    datable.length === 0
      ? null
      : Math.max(...datable.map((o) => o.monthsBehindLatest));

  return {
    observations: assessed,
    atLatestSignalIds,
    behindSignalIds,
    maxMonthsBehind,
    // A currency read needs at least one datable signal; "all at latest" is a
    // claim about real observations, never vacuously true over an empty set.
    allAtLatest:
      datable.length > 0 && datable.every((o) => o.monthsBehindLatest === 0),
    statement: summaryStatement(
      datable.length,
      behindSignalIds.length,
      maxMonthsBehind
    ),
  };
}

function assessOne(
  signal: EnvironmentSignalBrief,
  dataMonth: YearMonth,
  availability: BriefAvailability
): SignalCurrency {
  const horizon = horizonFor(signal.id, availability);
  const base = {
    id: signal.id,
    label: signal.label,
    dataMonth,
    availableThrough: horizon,
    source: signal.source,
  };

  if (!isYearMonth(dataMonth) || !isYearMonth(horizon)) {
    return {
      ...base,
      monthsBehindLatest: null,
      tier: "undatable",
      statement: `${signal.label}: data month or availability horizon is not a valid year-month; currency cannot be assessed; source ${sourceLabel(signal.source)}.`,
    };
  }

  const monthsBehindLatest = ymToIndex(horizon) - ymToIndex(dataMonth);
  const tier = classifyCurrency(monthsBehindLatest);
  return {
    ...base,
    monthsBehindLatest,
    tier,
    statement: observationStatement(
      signal,
      dataMonth,
      horizon,
      monthsBehindLatest
    ),
  };
}

function observationStatement(
  signal: EnvironmentSignalBrief,
  dataMonth: YearMonth,
  horizon: YearMonth,
  monthsBehindLatest: number
): string {
  const monthText = formatYearMonth(dataMonth);
  const horizonText = formatYearMonth(horizon);
  const source = sourceLabel(signal.source);

  if (monthsBehindLatest === 0) {
    return `${signal.label}: dated ${monthText}, the latest confirmed-available month (horizon ${horizonText}); source ${source}.`;
  }
  if (monthsBehindLatest < 0) {
    return `${signal.label}: dated ${monthText}, ${monthWord(-monthsBehindLatest)} ahead of the ${horizonText} confirmed availability horizon (not yet published); source ${source}.`;
  }
  return `${signal.label}: dated ${monthText}, ${monthWord(monthsBehindLatest)} behind the ${horizonText} availability horizon; newer published data available; source ${source}.`;
}

function summaryStatement(
  datableCount: number,
  behindCount: number,
  maxMonthsBehind: number | null
): string {
  if (datableCount === 0) {
    return "No datable signals to assess for currency against the availability horizon.";
  }
  const noun = datableCount === 1 ? "signal" : "signals";
  if (behindCount === 0) {
    return `${datableCount} ${noun} show the latest confirmed-available month; no newer published data to step to. Currency reflects each product's publication schedule, not data fitness.`;
  }
  const behindNoun = behindCount === 1 ? "signal has" : "signals have";
  const upTo =
    maxMonthsBehind !== null && maxMonthsBehind > 0
      ? ` (up to ${monthWord(maxMonthsBehind)})`
      : "";
  return `${datableCount} ${noun} assessed; ${behindCount} ${behindNoun} newer published data available${upTo}. Currency reflects the selected month versus each product's published horizon, not data fitness.`;
}

function monthWord(months: number): string {
  return `${months} month${months === 1 ? "" : "s"}`;
}

function sourceLabel(source: DatasetRef): string {
  return `${source.shortName} v${source.version}`;
}

function formatYearMonth(month: YearMonth): string {
  return `${month.year}-${String(month.month).padStart(2, "0")}`;
}

function isYearMonth(value: YearMonth): boolean {
  return (
    Number.isInteger(value.year) &&
    Number.isInteger(value.month) &&
    value.month >= 1 &&
    value.month <= 12
  );
}
