import type { ClimateMetricId, MonthlyClimateSummary } from "./climate";
import { CLIMATE_METRICS } from "./climate";
import {
  compareYm,
  formatYm,
  ymEqual,
  type DatasetRef,
  type YearMonth,
} from "./timeline";

/**
 * Interior months a climate product's cited source never distributed.
 *
 * `climate.ts` decides `publicationStatus` from two bounds only: a month at or
 * after the layer's `start` and at or before the caller's `availableThrough` is
 * called `"published"`. That assumes the source record is *contiguous* between
 * those bounds. For 2 m air temperature it measurably is not.
 *
 * GIBS advertises a layer's time dimension as one `<Value>` per contiguous
 * range. Read from WMTS GetCapabilities on 2026-08-11,
 * `MERRA2_2m_Air_Temperature_Monthly` advertises three:
 *
 *   1980-01-01/2023-11-01/P1M
 *   2024-02-01/2024-04-01/P1M
 *   2024-06-01/2026-05-01/P1M
 *
 * so December 2023, January 2024 and May 2024 sit inside the advertised record
 * but were never distributed. Without this module those three months are
 * summarized as `"published"` with `no-data` coverage — the app asserts, in a
 * cited provenance object, that MERRA-2 published a month it did not, and
 * blames the resulting blank on a failed retrieval. The distinction matters:
 * "the source has no observation here" is a statement about the atmosphere;
 * "the source never distributed this month" is a statement about distribution.
 *
 * Scientific honesty (kept in the code because callers will surface it):
 *  - A gap is a *distribution* fact. This module makes no claim about why a
 *    month is absent, and none about what the atmosphere did during it.
 *  - The pins are measured from the live capabilities document, not inferred
 *    from failed tile fetches. A 404 alone cannot distinguish a month that was
 *    never published from one that is temporarily unreachable.
 *  - The pins can rot two ways — NASA backfills a month (the pin would then
 *    hide real data), or a product drops another one (a new gap would be
 *    described as observed-but-empty). Both are caught by
 *    contract/climate-record-gaps.contract.test.ts, which re-derives the gap
 *    set from the live ranges.
 */

/**
 * Months the cited source of each climate metric never distributed, inside its
 * own advertised record. Ordered oldest → newest.
 *
 * Measured 2026-08-11 from GIBS WMTS GetCapabilities (EPSG:4326 / best).
 * `GLDAS_Surface_Total_Precipitation_Rate_Monthly` and
 * `GLDAS_Underground_Soil_Moisture_Monthly` each advertise a single contiguous
 * range, so their gap sets are empty *as measured* — not merely unchecked.
 */
export const CLIMATE_RECORD_GAPS: Record<
  ClimateMetricId,
  readonly YearMonth[]
> = {
  "air-temperature-2m": [
    { year: 2023, month: 12 },
    { year: 2024, month: 1 },
    { year: 2024, month: 5 },
  ],
  "precipitation-rate": [],
  "soil-moisture": [],
};

export type ClimateRecordGapStatus =
  /** The month falls in a measured distribution gap in the cited source. */
  | "not-distributed-by-source"
  /** The month is inside the record and outside every measured gap. */
  | "within-distributed-record"
  /** The summary was not `"published"`, so a gap verdict does not apply. */
  | "not-applicable";

export interface ClimateRecordGap {
  kind: "climate-record-gap";
  /** Explicitly prevents consumers from treating this as a forecast. */
  isForecast: false;
  /** Same cited product as the observation; provenance is unchanged. */
  source: DatasetRef;
  /** Exact GIBS layer whose advertised time dimension was measured. */
  sourceLayer: string;
  dataMonth: YearMonth;
  status: ClimateRecordGapStatus;
  /**
   * The published months bounding a gap, when the data month falls in one.
   * Null on either side when the gap runs to an edge of the measured set.
   */
  bounds: { before: YearMonth | null; after: YearMonth | null } | null;
  /**
   * The corrected publication status a caller should present, replacing the
   * contiguity-assuming one on the summary. Unchanged outside a gap.
   */
  publicationStatus:
    MonthlyClimateSummary["publicationStatus"] | "not-distributed";
  /** Why a gap verdict does not apply, or null when one was reached. */
  reason: string | null;
}

/** True when a metric's cited source never distributed this month. */
export function isUndistributedClimateMonth(
  metricId: ClimateMetricId,
  month: YearMonth
): boolean {
  return CLIMATE_RECORD_GAPS[metricId].some((gap) => ymEqual(gap, month));
}

/**
 * Refine a monthly climate summary against the measured distribution gaps of
 * its own cited source.
 *
 * Only a summary `climate.ts` already called `"published"` can be refined: a
 * month before the record or beyond the caller's availability checkpoint is
 * already described correctly, and re-labelling it would overstate what the
 * gap measurement covers. The returned object never carries a value — it
 * describes availability, and leaves the observation itself to the summary.
 */
export function climateRecordGap(
  summary: MonthlyClimateSummary
): ClimateRecordGap {
  const metric = CLIMATE_METRICS[summary.metric.id];
  const base = {
    kind: "climate-record-gap" as const,
    isForecast: false as const,
    source: metric.source,
    sourceLayer: metric.sourceLayer,
    dataMonth: { ...summary.dataMonth },
  };

  if (summary.publicationStatus !== "published") {
    return {
      ...base,
      status: "not-applicable",
      bounds: null,
      publicationStatus: summary.publicationStatus,
      reason: summary.publicationStatus,
    };
  }

  if (!isUndistributedClimateMonth(summary.metric.id, summary.dataMonth)) {
    return {
      ...base,
      status: "within-distributed-record",
      bounds: null,
      publicationStatus: "published",
      reason: null,
    };
  }

  return {
    ...base,
    status: "not-distributed-by-source",
    bounds: gapBounds(summary.metric.id, summary.dataMonth),
    publicationStatus: "not-distributed",
    reason: null,
  };
}

/**
 * The nearest declared-distributed months on either side of a gap month — the
 * neighbours a caller can offer instead. Derived from the gap set alone, so a
 * run of consecutive gap months reports the months bracketing the whole run.
 */
function gapBounds(
  metricId: ClimateMetricId,
  month: YearMonth
): { before: YearMonth | null; after: YearMonth | null } {
  const gaps = CLIMATE_RECORD_GAPS[metricId];
  let before = previousMonth(month);
  while (gaps.some((gap) => ymEqual(gap, before)))
    before = previousMonth(before);
  let after = nextMonth(month);
  while (gaps.some((gap) => ymEqual(gap, after))) after = nextMonth(after);
  return { before, after };
}

function previousMonth(ym: YearMonth): YearMonth {
  return ym.month === 1
    ? { year: ym.year - 1, month: 12 }
    : { year: ym.year, month: ym.month - 1 };
}

function nextMonth(ym: YearMonth): YearMonth {
  return ym.month === 12
    ? { year: ym.year + 1, month: 1 }
    : { year: ym.year, month: ym.month + 1 };
}

/**
 * A compact, honest readout of a gap verdict with its cited source. Says what
 * was not distributed, never why, and never what the atmosphere did instead.
 */
export function formatClimateRecordGap(result: ClimateRecordGap): string {
  const source = `${result.source.shortName} v${result.source.version}`;
  const month = formatYm(result.dataMonth);
  if (result.status === "not-applicable") {
    return `No distribution check for ${month} (${result.reason ?? "unspecified"}); source ${source}`;
  }
  if (result.status === "within-distributed-record") {
    return `${month} is inside the distributed record of ${result.sourceLayer}; source ${source}`;
  }
  const neighbours = [result.bounds?.before, result.bounds?.after]
    .filter((ym): ym is YearMonth => ym != null)
    .map(formatYm)
    .join(" and ");
  const nearby = neighbours ? `; nearest distributed months ${neighbours}` : "";
  return `${month} was never distributed for ${result.sourceLayer} — a gap in the published record, not a missing observation${nearby}; source ${source}`;
}

/**
 * The measured gap set for a metric, oldest → newest. Exposed so a caller can
 * state the record's discontinuities up front rather than discovering them one
 * blank month at a time.
 */
export function climateRecordGapMonths(metricId: ClimateMetricId): YearMonth[] {
  return [...CLIMATE_RECORD_GAPS[metricId]]
    .map((ym) => ({ ...ym }))
    .sort(compareYm);
}
