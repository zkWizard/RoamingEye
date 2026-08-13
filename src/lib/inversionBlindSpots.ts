import { buildColormapLut, invertColormap } from "./probe";
import { LEGENDS, type GradientLegendSpec } from "./legend";
import { SCALE_CONVERSIONS, type CalibratedLayerId } from "./colormap";
import type { ColormapEntry } from "./colormap";

/**
 * *Where* in a layer's value range the probe's colormap inversion goes blind.
 *
 * `validation.ts` measures how accurately the inversion recovers a value and
 * counts how many of GIBS's ramp colours it rejects outright
 * (`MEASURED_INVERSION.nulls`). Both are whole-layer scalars, and the count is
 * the load-bearing omission: a rejected colour is not merely an untested one.
 * At probe time the same rejection returns null, so the sample is *dropped from
 * the series*. If the rejected colours are spread evenly along the ramp that
 * loss is value-neutral. If they form a contiguous block — every colour between
 * two temperatures, say — the probe cannot see that part of the range at all,
 * and the missingness is **value-dependent**: every mean, trend, anomaly,
 * percentile and record margin computed downstream is conditioned on the values
 * that happened to survive, and biased away from the blind span.
 *
 * Two consequences follow, and neither is visible from a null *count*:
 *  - The published RMSE is a **survivor-only** figure. It describes accuracy
 *    over the colours that inverted, not over the ramp; where rejection is
 *    heavy it is measured on the easy part of the palette.
 *  - A blind span that reaches a ramp end truncates the readable range, so the
 *    probe's observed extreme is a censoring artefact rather than an
 *    observation.
 *
 * This module locates the blind spans in the layer's own physical units, states
 * whether they sit at an end or in the interior, and says so plainly. It is a
 * descriptive audit of our own pipeline: it makes no claim about the source
 * product's accuracy or coverage, and it neither repairs the gradient nor
 * re-weights any downstream statistic. Inverting against the authoritative GIBS
 * colormaps instead of our approximate legends is tracked as #170; each layer
 * whose legend is recalibrated should shrink its spans here.
 *
 * Pure and offline-testable against `ColormapEntry[]`; the live-XML re-measure
 * is a contract test, exactly like the inversion-accuracy figures it extends.
 */

/** A contiguous run of ramp colours the inversion rejects, in reported units. */
export interface BlindSpan {
  /** Lowest colormap value in the run (bin midpoint, reported units). */
  lo: number;
  /** Highest colormap value in the run (bin midpoint, reported units). */
  hi: number;
  /** Ramp entries in the run. */
  entries: number;
  /** `hi − lo` as a fraction of the ramp's full midpoint-to-midpoint span. */
  valueShare: number;
  /** The run reaches the low end of the ramp — the readable range is censored there. */
  atLowEnd: boolean;
  /** The run reaches the high end of the ramp. */
  atHighEnd: boolean;
}

export type BlindSpotShape =
  /** Every ramp colour inverts; no value range is unreadable. */
  | "none"
  /** Rejections exist but no run spans a material share of the range. */
  | "scattered"
  /** One or more material runs, all interior — a hole inside the range. */
  | "interior"
  /** A material run reaches a ramp end — the readable range is truncated. */
  | "end-truncated"
  /** No colour inverts; the layer's value range is entirely unreadable. */
  | "total";

export interface InversionBlindSpots {
  kind: "inversion-blind-spots";
  layer: CalibratedLayerId;
  /** Unit the spans are expressed in, or null when none was supplied. */
  unit: string | null;
  /** Ramp entries considered. */
  total: number;
  /** Entries that inverted to a value. */
  recovered: number;
  /** Entries the gradient rejected as no-data. */
  rejected: number;
  /** `recovered / total`; 0 when there is nothing to assess. */
  recoveredFraction: number;
  /** Rejected runs in ascending value order. */
  spans: BlindSpan[];
  /** The run hiding the largest share of the range, or null when there are none. */
  widest: BlindSpan | null;
  shape: BlindSpotShape;
  /**
   * True when a material run reaches a ramp end. The layer's observed extreme
   * is then a censoring artefact of our gradient, not a measurement.
   */
  truncatesRange: boolean;
  /**
   * True when some — but not all — colours inverted, so the layer's published
   * RMSE describes only the readable part of the ramp.
   */
  survivorOnlyRmse: boolean;
  /** Honest, limits-carrying sentence; no accuracy or fitness claim. */
  statement: string;
  limits: string[];
}

export interface BlindSpotOptions {
  /**
   * Unit the colormap's values are stored in (the `units` attribute of its data
   * ColorMap section). Ignored for layers with a `SCALE_CONVERSIONS` entry,
   * whose spans are converted and so carry the probe's reported unit instead —
   * a span is never labelled with a unit it is not expressed in.
   */
  unit?: string;
}

/**
 * Smallest share of the ramp's value span a rejected run must cover to count as
 * a blind *span* rather than incidental scatter. 5% is deliberately low: at this
 * width a run already removes a resolvable slice of the range, while
 * single-entry rejections from palette quantisation stay classified as scatter.
 */
export const MIN_BLIND_SPAN_SHARE = 0.05;

const BLIND_SPOT_LIMITS = [
  "Spans are measured against GIBS's authoritative colormap entries, so they locate where RoamingEye's legend gradient fails — not where the source product is missing or wrong.",
  "Bounds are bin midpoints, so a run's true unreadable width extends up to half a bin beyond each end; the reported span is the conservative inner bound.",
  "A blind span means probe samples in that range return no value and drop out of the series, biasing any statistic derived from the survivors; it is not a statement about the source product's coverage.",
  "Rejection is judged by the same no-data distance threshold the probe uses, which cannot distinguish a colour our gradient omits from genuine no-data fill.",
];

/**
 * Locate the value ranges a layer's colormap inversion cannot read.
 *
 * Entries are ordered by physical value (not ramp index) so a run is contiguous
 * in the quantity a reader cares about, and converted with the same
 * `SCALE_CONVERSIONS` factor the probe applies, so spans are quoted in the unit
 * the probe reports. Class legends carry no gradient to invert and return an
 * explicitly unassessed result rather than a fabricated one.
 */
export function findInversionBlindSpots(
  layer: CalibratedLayerId,
  entries: readonly ColormapEntry[],
  options?: BlindSpotOptions
): InversionBlindSpots {
  const spec = LEGENDS[layer];
  const conversion = SCALE_CONVERSIONS[layer];
  const unit = conversion?.unit ?? options?.unit ?? null;
  if (spec.kind === "classes" || entries.length === 0) {
    return unassessed(layer, unit);
  }

  const lut = buildColormapLut((spec as GradientLegendSpec).stops);
  const factor = conversion?.factor ?? 1;
  const ordered = entries
    .map((entry) => ({
      value: entry.value * factor,
      recovered: invertColormap(entry.rgb, lut) !== null,
    }))
    .sort((a, b) => a.value - b.value);

  const total = ordered.length;
  const recovered = ordered.filter((e) => e.recovered).length;
  const rampSpan = ordered[total - 1].value - ordered[0].value;

  const spans: BlindSpan[] = [];
  for (let i = 0; i < total; i++) {
    if (ordered[i].recovered) continue;
    let end = i;
    while (end + 1 < total && !ordered[end + 1].recovered) end++;
    const lo = ordered[i].value;
    const hi = ordered[end].value;
    spans.push({
      lo,
      hi,
      entries: end - i + 1,
      valueShare: rampSpan > 0 ? (hi - lo) / rampSpan : 0,
      atLowEnd: i === 0,
      atHighEnd: end === total - 1,
    });
    i = end;
  }

  const material = spans.filter((s) => s.valueShare >= MIN_BLIND_SPAN_SHARE);
  const widest = widestSpan(spans);
  const rejected = total - recovered;
  const shape = classifyShape(recovered, rejected, material);

  return {
    kind: "inversion-blind-spots",
    layer,
    unit,
    total,
    recovered,
    rejected,
    recoveredFraction: recovered / total,
    spans,
    widest,
    shape,
    truncatesRange: material.some((s) => s.atLowEnd || s.atHighEnd),
    // The RMSE only speaks for the whole ramp when nothing was dropped, and
    // there is no RMSE at all when nothing was recovered.
    survivorOnlyRmse: recovered > 0 && rejected > 0,
    statement: statementFor(layer, unit, recovered, total, shape, widest),
    limits: BLIND_SPOT_LIMITS,
  };
}

/**
 * A run's value share is the honest measure of how much of the range it hides,
 * but a single-entry run has zero width. Ties break on entry count, then on the
 * lower bound, so the pick is deterministic.
 */
function widestSpan(spans: readonly BlindSpan[]): BlindSpan | null {
  let best: BlindSpan | null = null;
  for (const span of spans) {
    if (
      best === null ||
      span.valueShare > best.valueShare ||
      (span.valueShare === best.valueShare &&
        (span.entries > best.entries ||
          (span.entries === best.entries && span.lo < best.lo)))
    ) {
      best = span;
    }
  }
  return best;
}

/**
 * End truncation outranks an interior hole: a censored extreme silently
 * rewrites the layer's observed minimum or maximum, whereas an interior hole
 * leaves both bounds intact.
 */
function classifyShape(
  recovered: number,
  rejected: number,
  material: readonly BlindSpan[]
): BlindSpotShape {
  if (rejected === 0) return "none";
  if (recovered === 0) return "total";
  if (material.some((s) => s.atLowEnd || s.atHighEnd)) return "end-truncated";
  if (material.length > 0) return "interior";
  return "scattered";
}

function unassessed(
  layer: CalibratedLayerId,
  unit: string | null
): InversionBlindSpots {
  return {
    kind: "inversion-blind-spots",
    layer,
    unit,
    total: 0,
    recovered: 0,
    rejected: 0,
    recoveredFraction: 0,
    spans: [],
    widest: null,
    shape: "none",
    truncatesRange: false,
    survivorOnlyRmse: false,
    statement: `${layer}: no gradient ramp to assess; inversion blind spots are not characterized.`,
    limits: BLIND_SPOT_LIMITS,
  };
}

function statementFor(
  layer: CalibratedLayerId,
  unit: string | null,
  recovered: number,
  total: number,
  shape: BlindSpotShape,
  widest: BlindSpan | null
): string {
  const share = `${recovered} of ${total} ramp colours invert`;
  if (shape === "none") {
    return `${layer}: ${share}; no value range is unreadable, so the measured RMSE speaks for the whole ramp.`;
  }
  if (shape === "total") {
    return `${layer}: no ramp colour inverts; the layer's whole value range is unreadable and no accuracy figure can be measured.`;
  }
  const span = widest ? ` Widest blind span ${formatSpan(widest, unit)}.` : "";
  if (shape === "end-truncated") {
    return `${layer}: ${share}; rejection reaches a ramp end, so the probe's observed extreme is censored by our gradient and the measured RMSE covers only the readable range.${span}`;
  }
  if (shape === "interior") {
    return `${layer}: ${share}; an interior value range is unreadable, so samples there drop from the series and the measured RMSE covers only the readable range.${span}`;
  }
  return `${layer}: ${share}; rejections are scattered rather than banded, but the measured RMSE still covers only the colours that inverted.${span}`;
}

function formatSpan(span: BlindSpan, unit: string | null): string {
  const suffix = unit ? ` ${unit}` : "";
  return `${round(span.lo)}–${round(span.hi)}${suffix} (${Math.round(span.valueShare * 100)}% of the range, ${span.entries} colours)`;
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

/** One layer's measured blind-spot shape, with the span that dominates it. */
export interface MeasuredBlindSpot {
  shape: BlindSpotShape;
  /** Ramp colours that inverted; mirrors `total − nulls` in MEASURED_INVERSION. */
  recovered: number;
  total: number;
  /** Bounds and unit of the widest blind span; null when there is none. */
  widest: { lo: number; hi: number; unit: string } | null;
}

/**
 * Blind-spot shape measured against the live GIBS colormaps (2026-08-12) — the
 * companion to `validation.MEASURED_INVERSION`, and only meaningful read
 * alongside it. Together they say what neither says alone: a layer's RMSE is a
 * whole-ramp figure only where the shape is `none`.
 *
 * The findings name a concrete downstream hazard per layer:
 *  - `lst` recovered *nothing at all* — a `total` blind spot over the whole
 *    200.3–349.7 K ramp — until its legend was rebuilt from
 *    MODIS_Land_Surface_Temp (2026-08-13); it now reads every colour.
 *  - `airtemp`, `precip`, `sst` and `soil` had wide blind spots until their
 *    legends were rebuilt from GIBS's own ramps (#717, #713, #736, #753);
 *    re-measured after those recalibrations, all four read the whole ramp.
 *
 * With LST fixed, no calibrated layer has a blind spot left. The `total` and
 * `banded` shapes are kept because they are what a future legend regression
 * would produce, and the contract test still measures for them weekly.
 *
 * `recovered`/`total` are deliberately redundant with `MEASURED_INVERSION`: the
 * unit test asserts the two tables agree, so recalibrating a legend (as #713,
 * #717 and #736 each do) cannot update one figure and leave the other stale.
 * The contract test re-measures the shapes against the live documents.
 */
export const MEASURED_BLIND_SPOTS: Record<
  CalibratedLayerId,
  MeasuredBlindSpot
> = {
  // Sampled from GIBS's own MODIS_L3_NDVI ramp (#776); reads the whole ramp.
  ndvi: {
    shape: "none",
    recovered: 140,
    total: 140,
    widest: null,
  },
  lst: {
    shape: "none",
    recovered: 250,
    total: 250,
    widest: null,
  },
  airtemp: {
    shape: "none",
    recovered: 180,
    total: 180,
    widest: null,
  },
  sst: {
    shape: "none",
    recovered: 213,
    total: 213,
    widest: null,
  },
  precip: {
    shape: "none",
    recovered: 50,
    total: 50,
    widest: null,
  },
  soil: {
    shape: "none",
    recovered: 50,
    total: 50,
    widest: null,
  },
  aerosol: {
    shape: "none",
    recovered: 180,
    total: 180,
    widest: null,
  },
};
