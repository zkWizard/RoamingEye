import { SCALE_CONVERSIONS, type CalibratedLayerId } from "./colormap";
import type {
  EnvironmentSignalBrief,
  EnvironmentSignalId,
} from "./environmentBrief";
import { LEGENDS } from "./legend";
import { PROBE_SCALES } from "./probe";
import type { DatasetRef, LayerId } from "./timeline";
import { MEASURED_INVERSION } from "./validation";

/**
 * Provenance-first value-uncertainty descriptor for a multi-signal environment
 * brief.
 *
 * The brief renders each signal's absolute value — e.g. "Soil moisture: 24.5
 * kg/m² observed for 2026-05" — as a confident-looking point number. But for the
 * raster layers RoamingEye reads by inverting a sampled colour through the
 * legend gradient, that absolute value carries a measured end-to-end
 * uncertainty: feeding GIBS's authoritative colormap through the production
 * inversion recovers each layer only to within its published RMSE, and how
 * large that is depends entirely on whether the layer's gradient was rebuilt
 * from GIBS's own ramp — tight where it was (soil, air temperature,
 * precipitation), nothing at all where it was not (LST recovers 0 of 250
 * colormap steps). No figure is restated here: the CI-asserted numbers live in
 * `MEASURED_INVERSION` and move as legends are recalibrated (METHODS §3,
 * docs/validation.md). The brief itself never surfaces any of this, so a reader
 * can mistake an inversion estimate for a precise reading.
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
 *  - Only layers with a measured inversion figure are bounded, and *why* a layer
 *    has none is stated rather than flattened. An unbounded signal is not one
 *    fact but four, and they license opposite readings — so each carries an
 *    explicit `uncharacterizedReason` derived from committed evidence, never
 *    from prose:
 *      · `categorical-layer` — read as discrete classes, no ramp to invert
 *        (`LEGENDS[id].kind === "classes"`: land cover).
 *      · `uncalibrated-scale` — the ramp inverts, but the scale is a fraction of
 *        the colour bar with no physical units, so an absolute band is undefined
 *        (`PROBE_SCALES[id].calibrated === false`: terrain).
 *      · `unvalidated-inversion` — read by inverting a sampled colour through the
 *        approximate legend gradient *exactly like the bounded layers*, but no
 *        measured figure exists for it (absent from `MEASURED_INVERSION`), so the
 *        error was never quantified (EVI, snow).
 *      · `inversion-recovers-nothing` — measured against GIBS's colormap and not
 *        one ramp colour inverted (`MEASURED_INVERSION.lst`: 0 of 250), so the
 *        evidence is retained and reported.
 *    The first two mean no band is *meaningful*; the last two mean a band is
 *    missing while the inversion uncertainty is real — unquantified, not absent.
 *    A band is still never invented for any of the four.
 *
 *    Every classification is read off committed evidence at call time, so a
 *    layer moves category on its own as the repository learns. Vegetation is the
 *    worked example: NDVI was the brief's unbounded case until its legend was
 *    rebuilt from GIBS's `MODIS_L3_NDVI` ramp, and it now carries a measured
 *    figure like every other brief signal. EVI stayed behind — its ramp contains
 *    pure black, which is also an undrawn tile pixel, so it cannot be calibrated
 *    the way NDVI's was. Nothing here is keyed on a layer name, so neither move
 *    left stale prose behind in the classifier.
 */

export type ValueUncertaintyStatus =
  /** The layer has a measured end-to-end colormap-inversion RMSE. */
  | "characterized"
  /** No usable measured band for this layer; see `uncharacterizedReason`. */
  | "uncharacterized";

/**
 * Why a layer carries no ± band. Each case is decided by a different committed
 * source, and they are not interchangeable: the first two say a band would be
 * meaningless, the last two say the inversion error is real but unstated.
 */
export type UncharacterizedReason =
  /** Discrete class swatches, not a continuous ramp — nothing to invert. */
  | "categorical-layer"
  /** Ramp inverts, but the scale is fraction-of-colour-bar with no units. */
  | "uncalibrated-scale"
  /** Ramp-inverted like the bounded layers, but GIBS publishes no colormap. */
  | "unvalidated-inversion"
  /** Measured against the colormap; zero ramp colours inverted at all. */
  | "inversion-recovers-nothing";

/** One brief signal with its measured colormap-inversion uncertainty attached. */
export interface SignalValueUncertainty {
  id: EnvironmentSignalId;
  label: string;
  layerId: LayerId;
  source: DatasetRef;
  status: ValueUncertaintyStatus;
  /**
   * Why no band is attached, or null when the signal is characterized. Kept
   * explicit so a reader can tell "a band would be meaningless here" from "this
   * value carries the same inversion error as the bounded ones, unmeasured".
   */
  uncharacterizedReason: UncharacterizedReason | null;
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
   * invert — added context on how partial the recovery is. Populated whenever a
   * validation run exists, including the `inversion-recovers-nothing` case (0 of
   * n), so that measurement is reported rather than discarded; null only for
   * layers that were never measured at all.
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
  /** Considered signals carrying no ± band, for any of the four reasons. */
  uncharacterizedCount: number;
  /**
   * Of the unbounded signals, those whose value is still produced by the same
   * gradient inversion as the bounded ones — `unvalidated-inversion` (never
   * measured) plus `inversion-recovers-nothing` (measured, nothing recovered).
   * These carry real but unstated inversion error, so they must not be read as
   * exempt; the remaining reasons are layers where a band is simply not a
   * meaningful quantity.
   */
  unquantifiedInversionCount: number;
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
  "Layers with no usable measured figure are reported as uncharacterized with an explicit reason, and an uncertainty is never invented for them. Two of those reasons still describe a colormap-inverted value: the value is read by inverting a sampled colour through the legend gradient exactly like the bounded layers, so its inversion error is unmeasured rather than absent — such a layer is not exempt by virtue of being a derived index.",
  "An unbounded signal is never evidence of a *smaller* uncertainty than a bounded one. Land surface temperature, for instance, was measured and recovered 0 of 250 colormap steps, so its absolute values rest on an inversion the validation run could not reproduce at all.",
];

/** One layer's inversion-characterization verdict and the evidence behind it. */
export interface LayerInversionCharacterization {
  status: ValueUncertaintyStatus;
  /** Null exactly when `status === "characterized"`. */
  reason: UncharacterizedReason | null;
  /** Validation-run recovery, when a run exists for the layer (else null). */
  recoveredSteps: number | null;
  totalSteps: number | null;
}

/**
 * Classify how well a layer's absolute values are characterized, deciding each
 * case from the committed source that actually settles it — the legend's kind,
 * the probe scale's `calibrated` flag, membership of `COLORMAP_DOCS` (via
 * `MEASURED_INVERSION`), and that entry's RMSE. Nothing here is hardcoded per
 * layer, so adding a colormap document or recalibrating a legend reclassifies
 * the layer automatically instead of leaving stale prose behind.
 */
export function characterizeLayerInversion(
  layerId: LayerId
): LayerInversionCharacterization {
  const unmeasured = (
    reason: UncharacterizedReason
  ): LayerInversionCharacterization => ({
    status: "uncharacterized",
    reason,
    recoveredSteps: null,
    totalSteps: null,
  });

  // Discrete classes: there is no continuous ramp position to invert.
  if (LEGENDS[layerId].kind === "classes")
    return unmeasured("categorical-layer");
  // A fraction-of-scale layer (terrain) has no physical units to bound.
  if (!PROBE_SCALES[layerId].calibrated)
    return unmeasured("uncalibrated-scale");
  // Ramp-inverted with a physical scale, but never validated: no GIBS colormap.
  if (!Object.prototype.hasOwnProperty.call(MEASURED_INVERSION, layerId)) {
    return unmeasured("unvalidated-inversion");
  }

  const measured = MEASURED_INVERSION[layerId as CalibratedLayerId];
  const recoveredSteps = measured.total - measured.nulls;
  if (measured.rmse === null) {
    // Measured, and the gradient rejected every ramp colour. Keep the counts:
    // "0 of 250 recovered" is a finding, not the absence of one.
    return {
      status: "uncharacterized",
      reason: "inversion-recovers-nothing",
      recoveredSteps,
      totalSteps: measured.total,
    };
  }
  return {
    status: "characterized",
    reason: null,
    recoveredSteps,
    totalSteps: measured.total,
  };
}

/** The reasons whose signals still carry real, merely unstated, inversion error. */
const UNQUANTIFIED_INVERSION_REASONS: readonly UncharacterizedReason[] = [
  "unvalidated-inversion",
  "inversion-recovers-nothing",
];

/** Clause explaining each reason, in the signal's own statement. */
const REASON_NOTES: Record<UncharacterizedReason, string> = {
  "categorical-layer":
    "this layer is read as discrete classes rather than by inverting a continuous colour ramp, so a ± value band is not a meaningful quantity for it",
  "uncalibrated-scale":
    "this layer's probe scale is a fraction of the colour ramp with no physical units, so an absolute ± band is undefined",
  "unvalidated-inversion":
    "this value is read by inverting a sampled colour through the approximate legend gradient, the same way the bounded layers are, but no validation run has measured that gradient against GIBS's colormap — so the inversion error is unmeasured, not absent, and the value is no more precise than a bounded one",
  "inversion-recovers-nothing":
    "measured against GIBS's authoritative colormap, this layer's legend gradient recovered none of the ramp's colours, so no band can be stated and any absolute value rests on an inversion the validation run could not reproduce",
};

/**
 * Resolve a brief layer id to a calibrated (colormap-inverted) layer that has a
 * measured inversion figure, or null. A layer qualifies only if it is a key of
 * `MEASURED_INVERSION` *and* that entry carries a non-null RMSE — the LST
 * gradient, for instance, inverts to no value at all and so bounds nothing.
 * A null answer says only that no band is available; use
 * `characterizeLayerInversion` when the *reason* matters, since it separates a
 * layer where a band is meaningless from one whose inversion error is merely
 * unmeasured.
 */
export function calibratedLayerWithRmse(
  layerId: LayerId
): CalibratedLayerId | null {
  return characterizeLayerInversion(layerId).status === "characterized"
    ? (layerId as CalibratedLayerId)
    : null;
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
 * their native unit; signals on an uncharacterized layer are reported honestly
 * with no band, carrying the reason they have none.
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
  const unquantifiedInversionCount = assessed.filter(
    (s) =>
      s.uncharacterizedReason !== null &&
      UNQUANTIFIED_INVERSION_REASONS.includes(s.uncharacterizedReason)
  ).length;

  return {
    kind: "brief-value-uncertainty",
    consideredSignalIds: assessed.map((s) => s.id),
    signals: assessed,
    characterizedCount,
    uncharacterizedCount,
    unquantifiedInversionCount,
    statement: summaryStatement(
      assessed.length,
      characterizedCount,
      uncharacterizedCount,
      unquantifiedInversionCount
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
    // Reason and evidence come from the same classifier, so the sentence can
    // never disagree with the reported counts.
    const characterization = characterizeLayerInversion(signal.layerId);
    const reason = characterization.reason as UncharacterizedReason;
    const recovery =
      characterization.totalSteps === null
        ? ""
        : ` (${characterization.recoveredSteps}/${characterization.totalSteps} colormap steps recovered)`;
    return {
      ...base,
      status: "uncharacterized",
      uncharacterizedReason: reason,
      observedValue: signal.observedValue,
      nativeRmse: null,
      reportedRmse: null,
      reportedUnit: null,
      lower: null,
      upper: null,
      recoveredSteps: characterization.recoveredSteps,
      totalSteps: characterization.totalSteps,
      statement: `${signal.label}: no characterized end-to-end colormap-inversion uncertainty for this layer, so a value band is not asserted — ${REASON_NOTES[reason]}${recovery}; source ${sourceLabel(signal.source)}.`,
    };
  }

  const value = signal.observedValue;
  const hasValue = value !== null && Number.isFinite(value);
  const lower = hasValue ? (value as number) - uncertainty.nativeRmse : null;
  const upper = hasValue ? (value as number) + uncertainty.nativeRmse : null;

  return {
    ...base,
    status: "characterized",
    uncharacterizedReason: null,
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
  uncharacterizedCount: number,
  unquantifiedInversionCount: number
): string {
  if (consideredCount === 0) {
    return "No usable observations to bound with an inversion-uncertainty band.";
  }
  const noun = consideredCount === 1 ? "signal" : "signals";
  const uncharacterizedClause =
    uncharacterizedCount > 0
      ? ` ${uncharacterizedCount} ${uncharacterizedCount === 1 ? "layer has" : "layers have"} no measured inversion figure and ${uncharacterizedCount === 1 ? "is" : "are"} left unbounded.`
      : "";
  // Naming this count is the point of the reason split: an unbounded signal that
  // is still colormap-inverted must not read as a more certain number.
  const unquantifiedClause =
    unquantifiedInversionCount > 0
      ? ` Of those, ${unquantifiedInversionCount} ${unquantifiedInversionCount === 1 ? "is" : "are"} still read by colormap inversion, so ${unquantifiedInversionCount === 1 ? "its" : "their"} inversion error is unquantified rather than absent — not a sign of greater precision.`
      : "";
  return `${characterizedCount} of ${consideredCount} usable ${noun} carry a measured end-to-end colormap-inversion band; these absolute values are best used for relative and temporal analysis, not as precise magnitudes.${uncharacterizedClause}${unquantifiedClause}`;
}

/** Compact fixed-significant-figure format; keeps small rates and large bands readable. */
function formatNumber(value: number): string {
  return Number(value.toPrecision(4)).toString();
}

function sourceLabel(source: DatasetRef): string {
  return `${source.shortName} v${source.version}`;
}
