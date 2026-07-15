import { inversionUncertaintyForLayer } from "./briefValueUncertainty";
import type {
  EnvironmentSignalBrief,
  EnvironmentSignalId,
} from "./environmentBrief";
import type { DatasetRef, LayerId } from "./timeline";

/**
 * Provenance-first *reported-precision* descriptor for a multi-signal
 * environment brief.
 *
 * `briefValueUncertainty` attaches a measured ± band to each colormap-inverted
 * signal value. This module answers the complementary metrology question that
 * band raises but does not resolve: **to how many figures may the value honestly
 * be reported at all?** The environment brief renders every observed value to
 * six significant figures (`toPrecision(6)` in environmentBrief.ts) — e.g. "Air
 * temperature: 287.34 K" — but the layer's end-to-end colormap-inversion RMSE is
 * ±19 K, so digits past the tens place are noise. Reporting them is false
 * precision: it dresses a coarse inversion estimate as a laboratory reading.
 *
 * The convention applied is the standard significant-figure / GUM rounding
 * practice: a reported value's least-significant digit should sit at the decimal
 * place of its standard uncertainty. We take the uncertainty's order of
 * magnitude p = floor(log10(u)) as that place (equivalently, round the
 * uncertainty to one significant figure to fix the place), round the value to
 * 10^p, and count the significant figures that survive. So ±19 K → round the
 * value to the nearest 10 K → 290 K → two justified significant figures.
 *
 * This is a precision-honesty descriptor only. It makes no claim about the value
 * itself, never re-derives the uncertainty (it reuses the CI-asserted
 * `MEASURED_INVERSION` figures via `inversionUncertaintyForLayer`), never
 * combines or weights signals, and never invents a figure for an uncharacterized
 * layer (e.g. NDVI, a satellite-derived index with no measured inversion RMSE) —
 * such a layer's justified precision is genuinely unknown and is reported as
 * such. The shared method limits still hold.
 */

/** Significant figures the environment brief renders per value (`toPrecision(6)`). */
export const BRIEF_RENDER_SIGNIFICANT_FIGURES = 6;

export type ReportedPrecisionStatus =
  /** The layer has a measured inversion RMSE, so a justified precision exists. */
  | "characterized"
  /** No measured inversion figure for this layer; precision is not asserted. */
  | "uncharacterized";

/** The uncertainty-justified precision of a single value. */
export interface JustifiedPrecision {
  /**
   * Power-of-ten place of the least-significant justified digit
   * (p = floor(log10(uncertainty))). Negative for sub-unit uncertainties
   * (decimal places), 0 for units, positive for tens/hundreds/…
   */
  roundingPlace: number;
  /** The value rounded so its last digit sits at 10^roundingPlace. */
  roundedValue: number;
  /**
   * Significant figures the uncertainty justifies for this value. 0 when the
   * value's magnitude is below its own uncertainty (it is not resolved from
   * zero even at one figure).
   */
  significantFigures: number;
}

/** One brief signal with its uncertainty-justified reporting precision. */
export interface SignalReportedPrecision {
  id: EnvironmentSignalId;
  label: string;
  layerId: LayerId;
  source: DatasetRef;
  status: ReportedPrecisionStatus;
  /** Observed value in the signal's native unit, or null when none is usable. */
  observedValue: number | null;
  nativeUnit: string;
  /** Measured inversion RMSE in the native unit, or null when uncharacterized. */
  uncertainty: number | null;
  /**
   * The value's uncertainty-justified precision, or null when the layer is
   * uncharacterized or no usable value exists to round.
   */
  justified: JustifiedPrecision | null;
  /** Significant figures the brief actually renders for this value, or null. */
  renderedSignificantFigures: number | null;
  /**
   * True when the brief renders more significant figures than the uncertainty
   * justifies — i.e. the default rendering overstates the value's precision.
   */
  overstatesPrecision: boolean;
  /** Honest, source-carrying sentence; no condition, value, or fitness claim. */
  statement: string;
}

export interface BriefReportedPrecisionSummary {
  kind: "brief-reported-precision";
  /** Signals assessed, in signal order. */
  consideredSignalIds: EnvironmentSignalId[];
  /** Per-signal reported precision, in signal order. */
  signals: SignalReportedPrecision[];
  /** Considered signals whose layer carries a measured inversion figure. */
  characterizedCount: number;
  /** Considered signals with no measured inversion figure (e.g. NDVI). */
  uncharacterizedCount: number;
  /** Considered signals whose brief rendering overstates the justified precision. */
  overstatedCount: number;
  /** Honest one-line summary; carries no claim about the reported values. */
  statement: string;
  limits: string[];
}

export interface BriefReportedPrecisionOptions {
  /**
   * Which signals to assess. "available" (default) considers only signals
   * carrying a usable observation — the values a reader would actually round;
   * "all" describes every signal's layer characterization regardless of status
   * (a justified precision is still only computed where a usable value exists).
   */
  include?: "available" | "all";
}

const REPORTED_PRECISION_LIMITS = [
  "Justified precision follows the standard significant-figure convention: a value's least-significant digit sits at the order of magnitude of its standard uncertainty (the uncertainty rounded to one significant figure); it is a reporting-precision guide, not a re-measurement.",
  "The uncertainty is the pipeline's end-to-end colormap-inversion RMSE against GIBS's authoritative colormap (METHODS §3, docs/validation.md), not the source product's own validation against in-situ measurements.",
  "Layers with no measured inversion figure (e.g. NDVI, a satellite-derived index) are reported as uncharacterized; a justified precision is never invented for them.",
  "This descriptor bounds how a single absolute value should be written; it makes no comparison, trend, condition, or causal claim, and the shared brief method limits still hold.",
];

/**
 * The order-of-magnitude place of the least-significant digit an uncertainty
 * justifies: p = floor(log10(u)). A tiny epsilon guards the float boundary at
 * exact powers of ten (log10(1000) can land at 2.9999…). Null for a
 * non-positive or non-finite uncertainty — a place cannot be fixed from it.
 */
export function justifiedRoundingPlace(uncertainty: number): number | null {
  if (!Number.isFinite(uncertainty) || uncertainty <= 0) return null;
  return Math.floor(Math.log10(uncertainty) + 1e-9);
}

/** Round a value so its least-significant digit sits at the 10^place position. */
export function roundToPlace(value: number, place: number): number {
  if (place <= 0) {
    // -place is the number of decimals to keep (place ≤ 0 ⇒ -place ≥ 0).
    return Number(value.toFixed(-place));
  }
  const factor = 10 ** place;
  return Math.round(value / factor) * factor;
}

/**
 * Significant figures a value carries when its least-significant digit sits at
 * 10^place. 0 when the value is below its own uncertainty's place (not resolved
 * from zero even at one figure), so an unresolved value is never dressed up as
 * a one-figure reading.
 */
function significantFiguresAt(value: number, place: number): number {
  if (value === 0) return 0;
  const msd = Math.floor(Math.log10(Math.abs(value)) + 1e-9);
  return Math.max(0, msd - place + 1);
}

/**
 * The uncertainty-justified precision of a value: where to round it, the rounded
 * value, and the significant figures that survive. Null when the uncertainty
 * cannot fix a place (non-positive / non-finite).
 */
export function justifiedPrecision(
  value: number,
  uncertainty: number
): JustifiedPrecision | null {
  const place = justifiedRoundingPlace(uncertainty);
  if (place === null || !Number.isFinite(value)) return null;
  return {
    roundingPlace: place,
    roundedValue: roundToPlace(value, place),
    significantFigures: significantFiguresAt(value, place),
  };
}

/**
 * Significant figures the environment brief actually renders for a value, i.e.
 * the figures of `Number(value.toPrecision(6))` — the exact rendering
 * environmentBrief.ts emits (trailing zeros collapse, so this is ≤ 6). 0 for a
 * zero value; null for a non-finite one. Kept in step with that renderer; the
 * test suite guards the coupling against a composed brief statement.
 */
export function briefRenderedSignificantFigures(value: number): number | null {
  if (!Number.isFinite(value)) return null;
  const rendered = Number(value.toPrecision(BRIEF_RENDER_SIGNIFICANT_FIGURES));
  if (rendered === 0) return 0;
  // Exponential form has no leading zeros; strip any trailing zeros the
  // collapse left, and count what remains — the significant figures shown.
  const mantissa = Math.abs(rendered)
    .toExponential()
    .split("e")[0]
    .replace(".", "")
    .replace(/0+$/, "");
  return mantissa.length || 1;
}

/**
 * Attach each brief signal's uncertainty-justified reporting precision to its
 * observed value. Signals on a calibrated layer report how many significant
 * figures their measured inversion RMSE justifies and whether the brief's
 * six-figure rendering overstates it; signals on an uncharacterized layer (e.g.
 * NDVI) are reported honestly with no justified precision.
 */
export function summarizeBriefValuePrecision(
  signals: readonly EnvironmentSignalBrief[],
  options?: BriefReportedPrecisionOptions
): BriefReportedPrecisionSummary {
  const include = options?.include ?? "available";
  const considered = signals.filter((signal) =>
    include === "all" ? true : signal.status === "available"
  );

  const assessed = considered.map((signal) => assessSignal(signal));
  const characterizedCount = assessed.filter(
    (s) => s.status === "characterized"
  ).length;
  const uncharacterizedCount = assessed.length - characterizedCount;
  const overstatedCount = assessed.filter((s) => s.overstatesPrecision).length;

  return {
    kind: "brief-reported-precision",
    consideredSignalIds: assessed.map((s) => s.id),
    signals: assessed,
    characterizedCount,
    uncharacterizedCount,
    overstatedCount,
    statement: summaryStatement(
      assessed.length,
      characterizedCount,
      overstatedCount
    ),
    limits: REPORTED_PRECISION_LIMITS,
  };
}

function assessSignal(signal: EnvironmentSignalBrief): SignalReportedPrecision {
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
      uncertainty: null,
      justified: null,
      renderedSignificantFigures: null,
      overstatesPrecision: false,
      statement: `${signal.label}: no characterized colormap-inversion uncertainty for this layer; a justified reporting precision is not asserted; source ${sourceLabel(signal.source)}.`,
    };
  }

  const value = signal.observedValue;
  const hasValue = value !== null && Number.isFinite(value);
  const justified = hasValue
    ? justifiedPrecision(value as number, uncertainty.nativeRmse)
    : null;
  const renderedSignificantFigures = hasValue
    ? briefRenderedSignificantFigures(value as number)
    : null;
  const overstatesPrecision =
    justified !== null &&
    renderedSignificantFigures !== null &&
    renderedSignificantFigures > justified.significantFigures;

  return {
    ...base,
    status: "characterized",
    observedValue: value,
    uncertainty: uncertainty.nativeRmse,
    justified,
    renderedSignificantFigures,
    overstatesPrecision,
    statement: characterizedStatement(
      signal,
      uncertainty.nativeRmse,
      justified,
      renderedSignificantFigures
    ),
  };
}

function characterizedStatement(
  signal: EnvironmentSignalBrief,
  nativeRmse: number,
  justified: JustifiedPrecision | null,
  renderedSignificantFigures: number | null
): string {
  const source = sourceLabel(signal.source);
  const rmseText = `${formatNumber(nativeRmse)} ${signal.nativeUnit}`;

  if (justified === null) {
    return `${signal.label}: no usable value to round; this layer's colormap-inversion RMSE is ${rmseText}; source ${source}.`;
  }

  const figures = justified.significantFigures;
  const figureNoun = figures === 1 ? "figure" : "figures";
  const roundedText = `${formatNumber(justified.roundedValue)} ${signal.nativeUnit}`;

  if (figures === 0) {
    return `${signal.label}: value ${formatNumber(signal.observedValue as number)} ${signal.nativeUnit} is within its own ±${rmseText} colormap-inversion uncertainty of zero; no significant figure is justified; source ${source}.`;
  }

  const overstateClause =
    renderedSignificantFigures !== null && renderedSignificantFigures > figures
      ? ` the brief renders ${renderedSignificantFigures} figures and overstates this precision;`
      : "";

  return `${signal.label}: ±${rmseText} colormap-inversion uncertainty justifies ${figures} significant ${figureNoun} — report ${roundedText};${overstateClause} source ${source}.`;
}

function summaryStatement(
  consideredCount: number,
  characterizedCount: number,
  overstatedCount: number
): string {
  if (consideredCount === 0) {
    return "No usable observations to assess for reported precision.";
  }
  const noun = characterizedCount === 1 ? "signal" : "signals";
  if (characterizedCount === 0) {
    return `No characterized layer among ${consideredCount} usable ${consideredCount === 1 ? "signal" : "signals"}; no justified reporting precision is asserted.`;
  }
  const overstateClause =
    overstatedCount > 0
      ? ` ${overstatedCount} ${overstatedCount === 1 ? "renders" : "render"} more significant figures than the measured inversion uncertainty justifies — prefer relative and temporal analysis over these absolute magnitudes.`
      : " none render more figures than the measured inversion uncertainty justifies.";
  return `${characterizedCount} of ${consideredCount} usable ${noun} carry an uncertainty-justified reporting precision;${overstateClause}`;
}

/** Compact fixed-significant-figure format; keeps small rates and large bands readable. */
function formatNumber(value: number): string {
  return Number(value.toPrecision(4)).toString();
}

function sourceLabel(source: DatasetRef): string {
  return `${source.shortName} v${source.version}`;
}
