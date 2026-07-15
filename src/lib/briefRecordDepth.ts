import type {
  EnvironmentSignalBrief,
  EnvironmentSignalId,
} from "./environmentBrief";
import {
  DATA_LATEST,
  LAYERS,
  ymToIndex,
  type DatasetRef,
  type YearMonth,
} from "./timeline";

/**
 * Provenance-first record-depth (period-of-record) descriptor for a
 * multi-signal environment brief.
 *
 * The brief composes vegetation, rainfall, soil-moisture, and air-temperature as
 * monthly observations, and companion single-instrument descriptors express many
 * of those values as a *percentile of record* or a *same-month record standing*
 * (see e.g. `airTemperatureRecordMargin.ts`, `precipitationPercentile.ts`). But a
 * "record" is only as strong as the archive behind it, and the four cited
 * products do not share an archive depth. In this app's catalog:
 *
 *  - Air temperature (MERRA-2, M2TMNXSLV) publishes from January 1980 — a
 *    ~46-year archive.
 *  - Vegetation (MOD13A3 NDVI) publishes from March 2000, and rainfall and soil
 *    moisture (GLDAS_NOAH025_M) from January 2000 — ~26-year archives.
 *
 * So "highest on record" for air temperature is drawn from roughly twice as many
 * years as the same phrase for NDVI, and the two are not equally deep statements.
 * This helper reports, per signal, the published length of its product's archive
 * — the sample depth available to any record, percentile, or anomaly claim about
 * that signal — and whether the signals rest on commensurate archive depths.
 *
 * Provenance discipline: the record extent is read only from each layer's cited
 * catalog `start`/`latest` months (the same metadata that drives the timeline),
 * never from an invented side table. Open-ended products that carry no fixed end
 * month are measured to a supplied availability horizon and flagged as such — the
 * horizon is never presented as a claim that no newer data will appear. It
 * reports temporal extent only; it never combines the signal values, weights
 * them, or infers any condition, risk, causation, or forecast — the shared method
 * limits of the brief still hold. Record depth is a companion to data currency
 * (`briefCurrency.ts`, how *new* is each signal?) and temporal alignment (do the
 * shown months line up?): a distinct axis describing how *deep* the archive
 * behind each signal is.
 */

/**
 * Descriptive archive-length band. Bands are neutral labels for the published
 * record's length in whole months; they imply no fitness, quality, or
 * sufficiency cutoff. A fraction is placed in the first band whose `min` (in
 * months) it meets.
 */
export type RecordDepthTier =
  | "four-decades-plus"
  | "three-decades"
  | "two-decades"
  | "one-decade"
  | "sub-decadal";

/**
 * Descending month-count thresholds. A record length is placed in the first
 * tier whose `min` it meets. Purely descriptive of archive length — never a
 * data-quality or "enough history" judgement.
 */
export const RECORD_DEPTH_TIERS: readonly {
  tier: RecordDepthTier;
  min: number;
}[] = [
  { tier: "four-decades-plus", min: 480 },
  { tier: "three-decades", min: 360 },
  { tier: "two-decades", min: 240 },
  { tier: "one-decade", min: 120 },
  { tier: "sub-decadal", min: 0 },
];

/** Published archive depth behind one brief signal. */
export interface SignalRecordDepth {
  /** Signal whose cited product's archive is described. */
  signalId: EnvironmentSignalId;
  /** Human label for the signal. */
  signalLabel: string;
  /** Source dataset, retained so provenance is never dropped. */
  source: DatasetRef;
  /** First published month of the cited product (catalog `start`). */
  startMonth: YearMonth;
  /** Last published month used: the product's `latest`, or the horizon. */
  endMonth: YearMonth;
  /**
   * True when the product carries no fixed end month, so `endMonth` is the
   * supplied availability horizon rather than a published catalog end. The
   * horizon is a measurement bound, not a claim that no newer data will appear.
   */
  endIsHorizon: boolean;
  /**
   * Published months of record: the inclusive count from `startMonth` to
   * `endMonth` (a contiguous monthly cadence is assumed; within-archive gaps
   * are not modelled). This is the sample depth `N` a record or percentile
   * statement about this signal can draw on.
   */
  spanMonths: number;
  /** `spanMonths` expressed in years (1 decimal), for a human statement. */
  spanYears: number;
  /** Descriptive archive-length band (never a sufficiency cutoff). */
  tier: RecordDepthTier;
}

export interface BriefRecordDepthSummary {
  kind: "brief-record-depth";
  /** Signals assessed (usable observations by default), in signal order. */
  consideredSignalIds: EnvironmentSignalId[];
  /** Per-signal record depths, in signal order. */
  depths: SignalRecordDepth[];
  /** Shallowest assessed archive; null when none were assessed. */
  shallowest: SignalRecordDepth | null;
  /** Deepest assessed archive; null when none were assessed. */
  deepest: SignalRecordDepth | null;
  /**
   * Whole-month difference between the deepest and shallowest assessed
   * archives; 0 when a single depth covers every assessed signal; null when
   * none were assessed.
   */
  spreadMonths: number | null;
  /**
   * True only when 2+ signals were assessed and every one rests on an archive
   * of identical published length. A lone signal has nothing to compare and is
   * never called commensurate.
   */
  commensurate: boolean;
  /** Honest one-line record-depth statement (no condition inference). */
  statement: string;
  limits: string[];
}

export interface BriefRecordDepthOptions {
  /**
   * Which signals to assess. "available" (default) considers only signals
   * carrying a usable observation, because record depth matters for the values
   * a reader might actually read as a record or percentile; "all" describes the
   * archive behind every composed signal regardless of per-signal status.
   */
  include?: "available" | "all";
  /**
   * Availability horizon used to close open-ended products (those with no fixed
   * catalog end month). Defaults to the app's latest known data month. Only the
   * end of open-ended archives depends on it; fixed-end products ignore it.
   */
  asOf?: YearMonth;
}

const RECORD_DEPTH_LIMITS = [
  "Record depth is the published temporal extent of each cited product, read only from its catalog start/end months; it is not a data-quality, accuracy, or fitness judgement.",
  "A deeper archive is not 'better data' — it only means a longer sample is available for any record, percentile, or anomaly statement about that signal.",
  "Open-ended products (no fixed catalog end) are measured to the supplied availability horizon and flagged; the horizon is not a claim that no newer data will appear.",
  "The span assumes a contiguous monthly cadence; missing composites within an archive are not modelled and would lower the true sample depth.",
  "This descriptor never combines the signal values, weights them, or infers any condition, trend, causation, or forecast.",
];

/**
 * Report, per signal, the published length of the archive behind its cited
 * product and whether the assessed signals rest on commensurate depths. A record
 * or percentile drawn from a shallower archive is a weaker statement than the
 * same phrase drawn from a deeper one, and this descriptor makes that explicit
 * rather than leaving it to a method-limit comment.
 */
export function summarizeBriefRecordDepth(
  signals: readonly EnvironmentSignalBrief[],
  options?: BriefRecordDepthOptions
): BriefRecordDepthSummary {
  const include = options?.include ?? "available";
  const horizon = options?.asOf ?? DATA_LATEST;
  const considered = signals.filter((signal) =>
    include === "all" ? true : signal.status === "available"
  );

  const depths = considered.map((signal) => signalRecordDepth(signal, horizon));
  const consideredSignalIds = considered.map((signal) => signal.id);

  if (depths.length === 0) {
    return {
      kind: "brief-record-depth",
      consideredSignalIds,
      depths,
      shallowest: null,
      deepest: null,
      spreadMonths: null,
      commensurate: false,
      statement:
        include === "all"
          ? "No composed signals to assess for record depth."
          : "No usable observations to assess for record depth.",
      limits: RECORD_DEPTH_LIMITS,
    };
  }

  let shallowest = depths[0];
  let deepest = depths[0];
  for (const depth of depths) {
    if (depth.spanMonths < shallowest.spanMonths) shallowest = depth;
    if (depth.spanMonths > deepest.spanMonths) deepest = depth;
  }
  const spreadMonths = deepest.spanMonths - shallowest.spanMonths;

  return {
    kind: "brief-record-depth",
    consideredSignalIds,
    depths,
    shallowest,
    deepest,
    spreadMonths,
    commensurate: depths.length >= 2 && spreadMonths === 0,
    statement: recordDepthStatement(depths, shallowest, deepest, spreadMonths),
    limits: RECORD_DEPTH_LIMITS,
  };
}

function signalRecordDepth(
  signal: EnvironmentSignalBrief,
  horizon: YearMonth
): SignalRecordDepth {
  const layer = LAYERS[signal.layerId];
  const startMonth = layer.start;
  const endIsHorizon = layer.latest === undefined;
  const endMonth = layer.latest ?? horizon;
  // Inclusive count of published months; clamp so a horizon earlier than a
  // product's start (an inconsistent input) never yields a negative depth.
  const spanMonths = Math.max(
    0,
    ymToIndex(endMonth) - ymToIndex(startMonth) + 1
  );

  return {
    signalId: signal.id,
    signalLabel: signal.label,
    source: signal.source,
    startMonth,
    endMonth,
    endIsHorizon,
    spanMonths,
    spanYears: roundYears(spanMonths),
    tier: recordDepthTier(spanMonths),
  };
}

function recordDepthTier(spanMonths: number): RecordDepthTier {
  for (const { tier, min } of RECORD_DEPTH_TIERS) {
    if (spanMonths >= min) return tier;
  }
  return "sub-decadal";
}

function recordDepthStatement(
  depths: readonly SignalRecordDepth[],
  shallowest: SignalRecordDepth,
  deepest: SignalRecordDepth,
  spreadMonths: number
): string {
  if (depths.length === 1) {
    const only = depths[0];
    return `1 signal assessed: ${only.signalId} rests on a ${only.spanYears}-year published archive (${sourceLabel(only.source)}, ${formatYearMonth(only.startMonth)}–${formatYearMonth(only.endMonth)}); single signal, no cross-signal record-depth comparison.`;
  }
  if (spreadMonths === 0) {
    return `${depths.length} signals rest on equally deep archives (~${deepest.spanYears} years each); record depth is commensurate across signals.`;
  }
  return `Record depth spans ${shallowest.spanYears}–${deepest.spanYears} years across ${depths.length} signals: ${deepest.signalId} draws on a far deeper archive than ${shallowest.signalId} (${spreadMonths}-month difference), so a record or percentile drawn from the shallower archive is a weaker statement — the two are not equally deep.`;
}

function roundYears(spanMonths: number): number {
  return Math.round((spanMonths / 12) * 10) / 10;
}

function sourceLabel(source: DatasetRef): string {
  return `${source.shortName} v${source.version}`;
}

function formatYearMonth(month: YearMonth): string {
  return `${month.year}-${String(month.month).padStart(2, "0")}`;
}
