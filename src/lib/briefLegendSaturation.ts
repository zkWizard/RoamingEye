import { SCALE_CONVERSIONS } from "./colormap";
import type {
  EnvironmentSignalBrief,
  EnvironmentSignalId,
} from "./environmentBrief";
import { PROBE_SCALES } from "./probe";
import type { DatasetRef, LayerId } from "./timeline";

/**
 * Provenance-first legend-saturation (representable-range position) descriptor
 * for a multi-signal environment brief.
 *
 * RoamingEye reads a value by inverting a sampled colour through a layer's
 * legend gradient and scaling the 0..1 position onto the layer's documented
 * physical range (`PROBE_SCALES`, derived from GIBS's colormap metadata; see
 * METHODS §1). That legend can only represent values inside its own [min, max]:
 * every colour at or past the ramp's end maps to the endpoint value, so an
 * inverted value that lands on an extreme stop is *saturated* — the true value
 * could be at, or beyond, that bound. A reader who sees "Soil moisture: 50 kg/m²"
 * (the top of the soil ramp) can mistake a ceiling for a two-sided reading.
 *
 * `briefValueUncertainty.ts` already attaches a *symmetric* ± band from the
 * layer's measured inversion RMSE. This descriptor is the complementary,
 * *one-sided* honesty: where in the legend's representable window each value
 * sits, and whether it is pinned at (or beyond) an extreme where the band is no
 * longer two-sided. The two are deliberately orthogonal, and they draw on
 * different truth sources: the ± band keys off `MEASURED_INVERSION` (which has
 * no NDVI entry, so value-uncertainty leaves NDVI uncharacterized), whereas the
 * legend range keys off `PROBE_SCALES` (which *does* carry NDVI's calibrated
 * 0..1 range) — so a signal can be range-characterized here yet unbounded there.
 *
 * Honesty rules that are load-bearing:
 *  - Position is measured against the legend's *representable* range, not the
 *    product's geophysical validity range. "at-ceiling" means the legend cannot
 *    resolve anything higher, never that the geophysical value is a record high.
 *  - The observed value is in the signal's native unit; the scale is in the
 *    probe's reported unit (mm/day for precipitation, after the kg/m²/s → mm/day
 *    factor). The value is converted with the same `SCALE_CONVERSIONS` factor the
 *    probe used, so a position is never computed against a mismatched unit.
 *  - Only layers whose `PROBE_SCALES` range is `calibrated` (a trusted physical
 *    range) are placed; an uncalibrated fraction-of-scale layer is reported as
 *    `uncharacterized` — a range is never invented.
 *
 * It reports representability structure over one value only. It never combines
 * the signal values, weights them, or infers any condition, risk, causation, or
 * forecast — the shared method limits of the brief still hold.
 */

export type RangePosition =
  /** Below the legend's minimum representable value (outside the ramp). */
  | "below-range"
  /** Within one colormap step of the minimum: the legend saturates low. */
  | "at-floor"
  /** Safely inside the representable range; the legend resolves both sides. */
  | "interior"
  /** Within one colormap step of the maximum: the legend saturates high. */
  | "at-ceiling"
  /** Above the legend's maximum representable value (outside the ramp). */
  | "above-range"
  /** Signal considered but carrying no finite value to place. */
  | "no-value"
  /** Layer has no trusted physical range (uncalibrated scale); never guessed. */
  | "uncharacterized";

/**
 * One colormap step in 0..1 position space. The probe inverts through a
 * 256-entry lookup table, so a value is resolved only to `span / 255` (the same
 * quantization METHODS §3 reports as `± half a step`); a value within one step
 * of a bound is indistinguishable from the endpoint colour.
 */
export const LEGEND_STEP = 1 / 255;

/** One brief signal placed within its layer's representable legend range. */
export interface SignalRangePosition {
  id: EnvironmentSignalId;
  label: string;
  layerId: LayerId;
  /** Provenance for the observation; never dropped. */
  source: DatasetRef;
  /** Observed value in the signal's native unit, or null when none is usable. */
  observedValue: number | null;
  nativeUnit: string;
  position: RangePosition;
  /**
   * True when the value sits at or beyond a legend extreme (`below-range`,
   * `at-floor`, `at-ceiling`, `above-range`): the ramp saturates there, so an
   * inverted value is a one-sided bound, not a two-sided reading. False for
   * `interior`; false for the off-nominal `no-value` / `uncharacterized`.
   */
  saturated: boolean;
  /** Legend's representable minimum in the reported unit; null when uncharacterized. */
  scaleMin: number | null;
  /** Legend's representable maximum in the reported unit; null when uncharacterized. */
  scaleMax: number | null;
  /** The reported-unit label the scale is expressed in; null when uncharacterized. */
  reportedUnit: string | null;
  /**
   * Observed value converted into the reported unit (× `SCALE_CONVERSIONS`
   * factor), so it is comparable to `scaleMin`/`scaleMax`. Null when there is no
   * usable value or the layer is uncharacterized.
   */
  reportedValue: number | null;
  /**
   * Fractional position of the value within [min, max]: `(v − min) / (max − min)`.
   * < 0 sits below the ramp, > 1 above it, 0..1 inside. Null when there is no
   * usable value or the layer is uncharacterized.
   */
  positionInScale: number | null;
  /** Honest, source-carrying sentence; no fitness, condition, or value claim. */
  statement: string;
}

export interface BriefLegendSaturationSummary {
  kind: "brief-legend-saturation";
  /** Signals assessed (usable observations by default), in signal order. */
  consideredSignalIds: EnvironmentSignalId[];
  /** Per-signal range position, in signal order. */
  signals: SignalRangePosition[];
  /** Considered signals whose value sits at or beyond a legend extreme. */
  saturatedCount: number;
  /** Considered signals resolved safely inside the representable range. */
  interiorCount: number;
  /** Considered signals with no trusted physical range (uncharacterized). */
  uncharacterizedCount: number;
  /** Honest one-line summary; carries no claim about the reported values. */
  statement: string;
  limits: string[];
}

export interface BriefLegendSaturationOptions {
  /**
   * Which signals to assess. "available" (default) considers only signals
   * carrying a usable observation, because a position is what a reader would
   * actually attach to a value; "all" describes every signal's layer range
   * regardless of per-signal status (a position is still only computed where a
   * usable value exists).
   */
  include?: "available" | "all";
}

const LEGEND_SATURATION_LIMITS = [
  "Position is measured against the legend's documented representable range (PROBE_SCALES, from GIBS's colormap metadata — METHODS §1), not the source product's geophysical validity range.",
  "A value at or beyond a legend extreme is a one-sided bound from colormap inversion (colours at or past the ramp end saturate to the endpoint value), not evidence the true geophysical value is extreme — treat it as a floor or ceiling, not a two-sided reading.",
  "The reported-unit position complements, and does not replace, the symmetric inversion-RMSE band (briefValueUncertainty.ts): near a bound that band is no longer two-sided.",
  "Layers without a trusted physical range (an uncalibrated fraction-of-scale legend) are reported as uncharacterized; a range is never invented.",
];

/** The reported-unit scale factor for a layer (1 unless the probe converts it). */
function reportedFactor(layerId: LayerId): number {
  // SCALE_CONVERSIONS is a Partial keyed by CalibratedLayerId; a plain LayerId
  // lookup returns undefined for any layer the probe does not convert (all but
  // precipitation), which is exactly the factor-of-1 default we want.
  const conversions = SCALE_CONVERSIONS as Record<
    string,
    { factor: number; unit: string } | undefined
  >;
  return conversions[layerId]?.factor ?? 1;
}

/**
 * Place a brief signal's observed value within its layer's representable legend
 * range, or report it as uncharacterized when the layer carries no trusted
 * physical range. The value is converted into the scale's reported unit before
 * placement so the position is never computed against a mismatched unit.
 */
export function assessRangePosition(
  signal: EnvironmentSignalBrief
): SignalRangePosition {
  const base = {
    id: signal.id,
    label: signal.label,
    layerId: signal.layerId,
    source: signal.source,
    nativeUnit: signal.nativeUnit,
  };
  const scale = PROBE_SCALES[signal.layerId];
  const span = scale.max - scale.min;

  // Only a calibrated scale with a positive span carries a trusted range.
  if (!scale.calibrated || !(span > 0)) {
    return {
      ...base,
      observedValue: signal.observedValue,
      position: "uncharacterized",
      saturated: false,
      scaleMin: null,
      scaleMax: null,
      reportedUnit: null,
      reportedValue: null,
      positionInScale: null,
      statement: `${signal.label}: no trusted physical range for this layer; legend position is not asserted; source ${sourceLabel(signal.source)}.`,
    };
  }

  const value = signal.observedValue;
  if (value === null || !Number.isFinite(value)) {
    return {
      ...base,
      observedValue: value,
      position: "no-value",
      saturated: false,
      scaleMin: scale.min,
      scaleMax: scale.max,
      reportedUnit: scale.unit,
      reportedValue: null,
      positionInScale: null,
      statement: `${signal.label}: no usable value to place in the ${formatRange(scale)} legend range; source ${sourceLabel(signal.source)}.`,
    };
  }

  const reportedValue = value * reportedFactor(signal.layerId);
  const positionInScale = (reportedValue - scale.min) / span;
  const position = classifyPosition(positionInScale);
  const saturated = position !== "interior";

  return {
    ...base,
    observedValue: value,
    position,
    saturated,
    scaleMin: scale.min,
    scaleMax: scale.max,
    reportedUnit: scale.unit,
    reportedValue,
    positionInScale,
    statement: positionStatement(signal, scale, reportedValue, position),
  };
}

function classifyPosition(
  t: number
): Exclude<RangePosition, "no-value" | "uncharacterized"> {
  if (t < 0) return "below-range";
  if (t <= LEGEND_STEP) return "at-floor";
  if (t >= 1 - LEGEND_STEP) return t > 1 ? "above-range" : "at-ceiling";
  return "interior";
}

/**
 * Place each brief signal within its layer's representable legend range and
 * report how many usable values are pinned at (or beyond) a legend extreme,
 * where an inverted value is a one-sided bound rather than a two-sided reading.
 */
export function summarizeBriefLegendSaturation(
  signals: readonly EnvironmentSignalBrief[],
  options?: BriefLegendSaturationOptions
): BriefLegendSaturationSummary {
  const include = options?.include ?? "available";
  const considered = signals.filter((signal) =>
    include === "all" ? true : signal.status === "available"
  );

  const assessed = considered.map((signal) => assessRangePosition(signal));
  const saturatedCount = assessed.filter((s) => s.saturated).length;
  const interiorCount = assessed.filter(
    (s) => s.position === "interior"
  ).length;
  const uncharacterizedCount = assessed.filter(
    (s) => s.position === "uncharacterized"
  ).length;

  return {
    kind: "brief-legend-saturation",
    consideredSignalIds: assessed.map((s) => s.id),
    signals: assessed,
    saturatedCount,
    interiorCount,
    uncharacterizedCount,
    statement: summaryStatement(
      assessed.length,
      saturatedCount,
      uncharacterizedCount
    ),
    limits: LEGEND_SATURATION_LIMITS,
  };
}

const EXTREME_LABEL: Record<
  "below-range" | "at-floor" | "at-ceiling" | "above-range",
  string
> = {
  "below-range": "below the legend's minimum",
  "at-floor": "at the legend floor",
  "at-ceiling": "at the legend ceiling",
  "above-range": "above the legend's maximum",
};

function positionStatement(
  signal: EnvironmentSignalBrief,
  scale: (typeof PROBE_SCALES)[LayerId],
  reportedValue: number,
  position: Exclude<RangePosition, "no-value" | "uncharacterized">
): string {
  const shown = `${formatNumber(reportedValue)}${unitSuffix(scale.unit)}`;
  const range = formatRange(scale);
  const source = sourceLabel(signal.source);

  if (position === "interior") {
    return `${signal.label}: ${shown} sits inside the ${range} legend range; the legend resolves it on both sides; source ${source}.`;
  }
  const where = EXTREME_LABEL[position];
  const bound =
    position === "at-floor" || position === "below-range"
      ? "a floor"
      : "a ceiling";
  return `${signal.label}: ${shown} is ${where} (${range}); the legend saturates here, so the inverted value is ${bound}, not a two-sided reading — the true value may lie at or beyond this bound; source ${source}.`;
}

function summaryStatement(
  consideredCount: number,
  saturatedCount: number,
  uncharacterizedCount: number
): string {
  if (consideredCount === 0) {
    return "No usable observations to place within a legend range.";
  }
  const noun = consideredCount === 1 ? "value" : "values";
  const uncharacterizedClause =
    uncharacterizedCount > 0
      ? ` ${uncharacterizedCount} ${uncharacterizedCount === 1 ? "layer has" : "layers have"} no trusted physical range and ${uncharacterizedCount === 1 ? "is" : "are"} left unplaced.`
      : "";
  if (saturatedCount === 0) {
    return `All ${consideredCount} usable ${noun} sit inside their legend's representable range.${uncharacterizedClause}`;
  }
  return `${saturatedCount} of ${consideredCount} usable ${noun} sit at or beyond a legend extreme, where the colormap saturates and the inverted value is a one-sided bound rather than a two-sided reading.${uncharacterizedClause}`;
}

function formatRange(scale: (typeof PROBE_SCALES)[LayerId]): string {
  return `${formatNumber(scale.min)}–${formatNumber(scale.max)}${unitSuffix(scale.unit)}`;
}

function unitSuffix(unit: string): string {
  return unit ? ` ${unit}` : "";
}

/** Compact fixed-significant-figure format; keeps small rates and large values readable. */
function formatNumber(value: number): string {
  return Number(value.toPrecision(4)).toString();
}

function sourceLabel(source: DatasetRef): string {
  return `${source.shortName} v${source.version}`;
}
