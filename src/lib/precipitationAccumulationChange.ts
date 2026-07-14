import type { MonthlyClimateSummary } from "./climate";
import {
  precipitationAccumulation,
  type PrecipitationAccumulation,
} from "./precipitationAccumulation";
import { formatYm, ymToIndex, type DatasetRef } from "./timeline";

/**
 * Describe the month-over-month *change* in derived precipitation accumulation
 * for a probed point — how much more or less water fell than the month before.
 *
 * `precipitationAccumulation.ts` integrates one month's GLDAS monthly-mean
 * precipitation rate into a total accumulated depth (mm water-equivalent), and
 * `precipitationWindow` (#273) *sums* a run of those totals. This helper answers
 * the distinct question the two adjacent months invite: *did more or less water
 * fall this month than last?* — a signed difference, not a sum.
 *
 * It is a plain subtraction of two already-usable accumulation totals, carrying
 * the same cited provenance. It adds no anomaly, climatology/normal, regime
 * class, drought signal, causation, or forecast. Because it compares total
 * depths, part of any difference reflects the two months' differing calendar
 * lengths (28–31 days), not only a change in mean rate — see the limitations.
 */

/** Direction of the month-over-month change in accumulated depth. */
export type PrecipitationAccumulationTrend =
  | "wetter"
  | "drier"
  | "little-change";

export type PrecipitationAccumulationChangeStatus =
  | "available"
  | "non-adjacent-months"
  | "mixed-provenance"
  | "unavailable";

/**
 * Change of total accumulated depth (mm) below which the pair is reported as
 * `little-change` rather than wetter or drier. A reporting convention, not a
 * physical threshold: a month-to-month difference under 1 mm of total depth is
 * at the floor of hydrologic significance and should not be over-read. Callers
 * may override it.
 */
export const PRECIP_ACCUMULATION_CHANGE_THRESHOLD_MM = 1;

export const PRECIP_ACCUMULATION_CHANGE_LIMITATIONS = [
  "The change is the plain difference of two monthly total accumulated depths (later minus earlier), each the GLDAS monthly-mean precipitation rate integrated over its own calendar month.",
  "Because months differ in length (28–31 days), part of any difference reflects calendar-month length, not only a change in the mean precipitation rate.",
  "The direction bin (wetter/drier/little-change) is a reporting convention over a continuous difference; its threshold is not a physical boundary.",
  "It inherits the land-model product's resolution and biases and infers no anomaly, normal, regime class, drought signal, cause, water volume, or any future value.",
] as const;

export interface PrecipitationAccumulationChange {
  kind: "month-over-month-precip-accumulation-change";
  /** Explicitly prevents consumers from treating this as a forecast. */
  isForecast: false;
  status: PrecipitationAccumulationChangeStatus;
  /** Shared cited product, or null when no single provenance could be resolved. */
  source: DatasetRef | null;
  /** Earlier month's derived accumulation, or null when not usable. */
  earlier: PrecipitationAccumulation | null;
  /** Later month's derived accumulation, or null when not usable. */
  later: PrecipitationAccumulation | null;
  /** Later total minus earlier total, in mm; null when not computable. */
  changeMm: number | null;
  trend: PrecipitationAccumulationTrend | null;
  thresholdMm: number;
  /** Short machine-readable reason when no trend is reported. */
  reason: string | null;
  limitations: readonly string[];
}

export interface PrecipitationAccumulationChangeOptions {
  /** Total-depth band (mm) treated as `little-change` (defaults to convention). */
  thresholdMm?: number;
}

/**
 * Describe the change in derived monthly precipitation accumulation between two
 * consecutive months. Both summaries must yield a usable accumulation (see
 * {@link precipitationAccumulation}), `later` must fall exactly one calendar
 * month after `earlier`, and both must cite the same product — the helper never
 * spans a gap, reorders the pair, or mixes provenance. On any unmet rule it
 * reports the reason and a null change rather than a fabricated difference; a
 * null therefore means "no change can be stated", never "no change occurred".
 */
export function describePrecipitationAccumulationChange(
  earlierSummary: MonthlyClimateSummary,
  laterSummary: MonthlyClimateSummary,
  options: PrecipitationAccumulationChangeOptions = {}
): PrecipitationAccumulationChange {
  const earlier = precipitationAccumulation(earlierSummary);
  const later = precipitationAccumulation(laterSummary);
  const threshold =
    options.thresholdMm ?? PRECIP_ACCUMULATION_CHANGE_THRESHOLD_MM;
  const validThreshold = Number.isFinite(threshold) && threshold >= 0;

  const base = {
    kind: "month-over-month-precip-accumulation-change" as const,
    isForecast: false as const,
    source: earlier?.source ?? later?.source ?? null,
    earlier,
    later,
    changeMm: null,
    trend: null,
    thresholdMm: validThreshold
      ? threshold
      : PRECIP_ACCUMULATION_CHANGE_THRESHOLD_MM,
    limitations: PRECIP_ACCUMULATION_CHANGE_LIMITATIONS,
  };

  if (!validThreshold) {
    return { ...base, status: "unavailable", reason: "invalid-threshold" };
  }
  if (earlier === null || later === null) {
    return { ...base, status: "unavailable", reason: "endpoint-not-available" };
  }
  if (ymToIndex(later.dataMonth) - ymToIndex(earlier.dataMonth) !== 1) {
    return {
      ...base,
      status: "non-adjacent-months",
      reason: "months-not-consecutive",
    };
  }
  if (!sameSource(earlier.source, later.source)) {
    return { ...base, status: "mixed-provenance", reason: "sources-differ" };
  }

  const change = later.totalMm - earlier.totalMm;
  const trend: PrecipitationAccumulationTrend =
    Math.abs(change) < threshold
      ? "little-change"
      : change > 0
      ? "wetter"
      : "drier";

  return {
    ...base,
    source: earlier.source,
    status: "available",
    changeMm: change,
    trend,
    reason: null,
  };
}

/**
 * A compact, honest one-line readout of the change, matching the place panel's
 * cited-readout style. Non-`available` results are reported plainly rather than
 * dressed up as a number.
 */
export function formatPrecipitationAccumulationChange(
  change: PrecipitationAccumulationChange
): string {
  const source = change.source
    ? `${change.source.shortName} v${change.source.version}`
    : "unknown source";
  if (change.status !== "available" || change.changeMm === null) {
    return `No month-over-month accumulation change (${
      change.reason ?? change.status
    }); source ${source}`;
  }
  const earlierLabel = formatYm(change.earlier!.dataMonth);
  const laterLabel = formatYm(change.later!.dataMonth);
  if (change.trend === "little-change") {
    return `${laterLabel} vs ${earlierLabel}: little change (${formatSigned(
      change.changeMm
    )} mm); source ${source}`;
  }
  const verb = change.trend === "wetter" ? "wetter" : "drier";
  return `${laterLabel} vs ${earlierLabel}: ${verb} by ${formatMagnitude(
    change.changeMm
  )} mm; source ${source}`;
}

function sameSource(a: DatasetRef, b: DatasetRef): boolean {
  return (
    a.shortName === b.shortName && a.version === b.version && a.doi === b.doi
  );
}

function formatSigned(value: number): string {
  const rounded = Number(value.toPrecision(5));
  return rounded > 0 ? `+${rounded}` : `${rounded}`;
}

function formatMagnitude(value: number): string {
  return Number(Math.abs(value).toPrecision(5)).toString();
}
