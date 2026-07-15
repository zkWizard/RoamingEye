import { SCALE_CONVERSIONS, type CalibratedLayerId } from "./colormap";
import type {
  EnvironmentSignalBrief,
  EnvironmentSignalId,
} from "./environmentBrief";
import type { DatasetRef, LayerId } from "./timeline";
import { MEASURED_INVERSION } from "./validation";

/**
 * Provenance-first value-uncertainty descriptor for a multi-signal environment
 * brief.
 *
 * The brief renders each signal's absolute value — e.g. "Soil moisture: 24.5
 * kg/m² observed for 2026-05" — as a confident-looking point number. But for the
 * raster layers RoamingEye reads by inverting a sampled colour through an
 * *approximate* legend gradient, that absolute value carries a large, measured
 * end-to-end uncertainty: feeding GIBS's authoritative colormap through the
 * production inversion recovers soil moisture only to ±8.2 kg/m², air
 * temperature to ±19 K, and precipitation to ±20 mm/day (METHODS §3;
 * docs/validation.md; the CI-asserted figures live in `MEASURED_INVERSION`).
 * The brief itself never surfaces this, so a reader can mistake an inversion
 * estimate for a precise reading.
 *
 * This helper binds each brief signal's observed value to its layer's *measured*
 * end-to-end colormap-inversion RMSE, expressed as a ± band in the signal's own
 * native reported unit, so the uncertainty travels with the synthesized brief.
 * It reports provenance and a documented error figure only; it never combines
 * the signal values, weights them, re-derives an error, or infers any
 * condition, risk, causation, or forecast — the shared method limits still hold.
 *
 * Two honesty rules are load-bearing here:
 *  - The RMSE is documented in the probe's *reported* unit (mm/day for
 *    precipitation, after the kg/m²/s → mm/day scale conversion), which differs
 *    from the brief's native unit. The band is converted back to the native unit
 *    with the same `SCALE_CONVERSIONS` factor the probe used, so a ± value is
 *    never dimensionally mismatched to the number it qualifies.
 *  - Only layers with a measured inversion figure are bounded. Vegetation (NDVI)
 *    is a satellite-derived index, not one of the calibrated colormap-inverted
 *    layers, so it has no measured inversion RMSE and is reported as
 *    `uncharacterized` — a band is never invented for it.
 */

export type ValueUncertaintyStatus =
  /** The layer has a measured end-to-end colormap-inversion RMSE. */
  | "characterized"
  /** No measured inversion figure for this layer (e.g. NDVI); never invented. */
  | "uncharacterized";

/** One brief signal with its measured colormap-inversion uncertainty attached. */
export interface SignalValueUncertainty {
  id: EnvironmentSignalId;
  label: string;
  layerId: LayerId;
  source: DatasetRef;
  status: ValueUncertaintyStatus;
  /** Observed value in the signal's native unit, or null when none is usable. */
  observedValue: number | null;
  nativeUnit: string;
  /**
   * End-to-end colormap-inversion RMSE in the signal's *native* unit (the same
   * unit as `observedValue`), or null when the layer is uncharacterized.
   */
  nativeRmse: number | null;
  /**
   * The same RMSE in the probe's documented *reported* unit (e.g. mm/day for
   * precipitation), retained so the published figure is traceable. Equals
   * `nativeRmse` for layers with no unit conversion. Null when uncharacterized.
   */
  reportedRmse: number | null;
  /** The reported-unit label (e.g. "mm/day"); null when uncharacterized. */
  reportedUnit: string | null;
  /** `observedValue − nativeRmse`; null when no value or uncharacterized. */
  lower: number | null;
  /** `observedValue + nativeRmse`; null when no value or uncharacterized. */
  upper: number | null;
  /**
   * Colormap steps that inverted to a value in the validation run, and the total
   * considered. A low ratio means much of the layer's colour range does not even
   * invert — added context on how partial the recovery is. Null when
   * uncharacterized.
   */
  recoveredSteps: number | null;
  totalSteps: number | null;
  /** Honest, source-carrying sentence; no fitness, condition, or value claim. */
  statement: string;
}

export interface BriefValueUncertaintySummary {
  kind: "brief-value-uncertainty";
  /** Signals assessed (usable observations by default), in signal order. */
  consideredSignalIds: EnvironmentSignalId[];
  /** Per-signal uncertainty, in signal order. */
  signals: SignalValueUncertainty[];
  /** Considered signals whose layer carries a measured inversion figure. */
  characterizedCount: number;
  /** Considered signals with no measured inversion figure (e.g. NDVI). */
  uncharacterizedCount: number;
  /** Honest one-line summary; carries no claim about the reported values. */
  statement: string;
  limits: string[];
}

export interface BriefValueUncertaintyOptions {
  /**
   * Which signals to assess. "available" (default) considers only signals
   * carrying a usable observation, because a value band is what a reader would
   * actually attach; "all" describes every signal's layer characterization
   * regardless of per-signal status (bands are still only computed where a
   * usable value exists).
   */
  include?: "available" | "all";
}

const VALUE_UNCERTAINTY_LIMITS = [
  "Uncertainty is the pipeline's end-to-end colormap-inversion RMSE measured against GIBS's authoritative colormap (METHODS §3, docs/validation.md), not the source product's own validation against in-situ measurements.",
  "The band qualifies an absolute value read via RoamingEye's raster colormap inversion; these absolute values carry large uncertainty on several layers — prefer relative and temporal analysis (trends, anomalies, seasonality).",
  "No relative-percentage error is reported: relative error is scale-dependent and misleading on offset scales such as Kelvin, so only the absolute band in native units is asserted.",
  "Layers with no measured inversion figure (e.g. NDVI, a satellite-derived index) are reported as uncharacterized; an uncertainty is never invented for them.",
];

/**
 * Resolve a brief layer id to a calibrated (colormap-inverted) layer that has a
 * measured inversion figure, or null. A layer is only calibrated if it is a key
 * of `MEASURED_INVERSION` *and* that entry carries a non-null RMSE — the LST
 * gradient, for instance, inverts to no value at all and so bounds nothing.
 */
export function calibratedLayerWithRmse(
  layerId: LayerId
): CalibratedLayerId | null {
  if (!Object.prototype.hasOwnProperty.call(MEASURED_INVERSION, layerId)) {
    return null;
  }
  const cal = layerId as CalibratedLayerId;
  return MEASURED_INVERSION[cal].rmse === null ? null : cal;
}

/** One layer's measured inversion uncertainty, in both reported and native units. */
export interface LayerInversionUncertainty {
  reportedRmse: number;
  reportedUnit: string;
  nativeRmse: number;
  recoveredSteps: number;
  totalSteps: number;
}

/**
 * Look up a layer's measured end-to-end colormap-inversion uncertainty and
 * convert it from the probe's reported unit into the given native unit using the
 * same `SCALE_CONVERSIONS` factor the probe applied. Returns null for any layer
 * without a measured figure, so an uncertainty is never fabricated.
 */
export function inversionUncertaintyForLayer(
  layerId: LayerId,
  nativeUnit: string
): LayerInversionUncertainty | null {
  const cal = calibratedLayerWithRmse(layerId);
  if (cal === null) return null;

  const measured = MEASURED_INVERSION[cal];
  // rmse is non-null by the calibratedLayerWithRmse guard above.
  const reportedRmse = measured.rmse as number;
  const conversion = SCALE_CONVERSIONS[cal];
  const factor = conversion?.factor ?? 1;
  const reportedUnit = conversion?.unit ?? nativeUnit;

  return {
    reportedRmse,
    reportedUnit,
    // reported = native × factor (see validateInversion), so native = reported / factor.
    nativeRmse: reportedRmse / factor,
    recoveredSteps: measured.total - measured.nulls,
    totalSteps: measured.total,
  };
}

/**
 * Attach each brief signal's measured colormap-inversion uncertainty to its
 * observed value. Signals on a calibrated layer are bounded with a ± band in
 * their native unit; signals on an uncharacterized layer (e.g. NDVI) are
 * reported honestly with no band.
 */
export function summarizeBriefValueUncertainty(
  signals: readonly EnvironmentSignalBrief[],
  options?: BriefValueUncertaintyOptions
): BriefValueUncertaintySummary {
  const include = options?.include ?? "available";
  const considered = signals.filter((signal) =>
    include === "all" ? true : signal.status === "available"
  );

  const assessed = considered.map((signal) => assessSignal(signal));
  const characterizedCount = assessed.filter(
    (s) => s.status === "characterized"
  ).length;
  const uncharacterizedCount = assessed.length - characterizedCount;

  return {
    kind: "brief-value-uncertainty",
    consideredSignalIds: assessed.map((s) => s.id),
    signals: assessed,
    characterizedCount,
    uncharacterizedCount,
    statement: summaryStatement(
      assessed.length,
      characterizedCount,
      uncharacterizedCount
    ),
    limits: VALUE_UNCERTAINTY_LIMITS,
  };
}

function assessSignal(signal: EnvironmentSignalBrief): SignalValueUncertainty {
  const base = {
    id: signal.id,
    label: signal.label,
    layerId: signal.layerId,
    source: signal.source,
    nativeUnit: signal.nativeUnit,
  };

  const uncertainty = inversionUncertaintyForLayer(
    signal.layerId,
    signal.nativeUnit
  );
  if (uncertainty === null) {
    return {
      ...base,
      status: "uncharacterized",
      observedValue: signal.observedValue,
      nativeRmse: null,
      reportedRmse: null,
      reportedUnit: null,
      lower: null,
      upper: null,
      recoveredSteps: null,
      totalSteps: null,
      statement: `${signal.label}: no characterized end-to-end colormap-inversion uncertainty for this layer; a value band is not asserted; source ${sourceLabel(signal.source)}.`,
    };
  }

  const value = signal.observedValue;
  const hasValue = value !== null && Number.isFinite(value);
  const lower = hasValue ? (value as number) - uncertainty.nativeRmse : null;
  const upper = hasValue ? (value as number) + uncertainty.nativeRmse : null;

  return {
    ...base,
    status: "characterized",
    observedValue: value,
    nativeRmse: uncertainty.nativeRmse,
    reportedRmse: uncertainty.reportedRmse,
    reportedUnit: uncertainty.reportedUnit,
    lower,
    upper,
    recoveredSteps: uncertainty.recoveredSteps,
    totalSteps: uncertainty.totalSteps,
    statement: characterizedStatement(signal, uncertainty, hasValue),
  };
}

function characterizedStatement(
  signal: EnvironmentSignalBrief,
  uncertainty: LayerInversionUncertainty,
  hasValue: boolean
): string {
  const recovery = `${uncertainty.recoveredSteps}/${uncertainty.totalSteps} colormap steps recovered`;
  const source = sourceLabel(signal.source);
  // The reported-unit figure is the one published in METHODS/validation; surface
  // it whenever the native unit differs (precipitation), so the documented value
  // stays traceable even though the band itself is in the native unit.
  const reportedNote =
    uncertainty.reportedUnit === signal.nativeUnit
      ? ""
      : ` (published RMSE ${formatNumber(uncertainty.reportedRmse)} ${uncertainty.reportedUnit})`;

  if (!hasValue) {
    return `${signal.label}: no usable value to bound; this layer's end-to-end colormap-inversion RMSE is ${formatNumber(uncertainty.nativeRmse)} ${signal.nativeUnit}${reportedNote} (${recovery}); source ${source}.`;
  }

  return `${signal.label}: ${formatNumber(signal.observedValue as number)} ± ${formatNumber(uncertainty.nativeRmse)} ${signal.nativeUnit}${reportedNote}, end-to-end colormap-inversion RMSE (${recovery}); this absolute value carries large inversion uncertainty — prefer relative/temporal analysis; source ${source}.`;
}

function summaryStatement(
  consideredCount: number,
  characterizedCount: number,
  uncharacterizedCount: number
): string {
  if (consideredCount === 0) {
    return "No usable observations to bound with an inversion-uncertainty band.";
  }
  const noun = consideredCount === 1 ? "signal" : "signals";
  const uncharacterizedClause =
    uncharacterizedCount > 0
      ? ` ${uncharacterizedCount} ${uncharacterizedCount === 1 ? "layer has" : "layers have"} no measured inversion figure and ${uncharacterizedCount === 1 ? "is" : "are"} left unbounded.`
      : "";
  return `${characterizedCount} of ${consideredCount} usable ${noun} carry a measured end-to-end colormap-inversion band; these absolute values are best used for relative and temporal analysis, not as precise magnitudes.${uncharacterizedClause}`;
}

/** Compact fixed-significant-figure format; keeps small rates and large bands readable. */
function formatNumber(value: number): string {
  return Number(value.toPrecision(4)).toString();
}

function sourceLabel(source: DatasetRef): string {
  return `${source.shortName} v${source.version}`;
}
