import {
  COLORMAP_DOCS,
  MAX_LINEARITY_DEVIATION,
  type CalibratedLayerId,
} from "./colormap";
import type { ProbeInversionAccuracyStatus } from "./probeInversionAccuracy";
import type { LayerId } from "./timeline";
import { MEASURED_INVERSION } from "./validation";

/**
 * How faithfully RoamingEye's vegetation-index legend reproduces NASA GIBS's
 * own MOD13A3 NDVI and EVI ramps — measured, not assumed.
 *
 * The probe reads a vegetation index by inverting a sampled colour through our
 * approximate legend gradient and mapping that 0..1 position *linearly* onto
 * the layer's scale (`PROBE_SCALES.ndvi` / `.evi`, both 0–1). That linear step
 * is only honest if GIBS's ramp is itself linear in value. For the calibrated
 * layers it is: `linearityDeviation` sits at 0–0.16% of span, comfortably under
 * the `MAX_LINEARITY_DEVIATION` ceiling the probe-scale contract enforces.
 *
 * The two vegetation indices are the exception, and it is not a small one.
 * GIBS renders MOD13A3 with a deliberately non-uniform ramp: the sub-0.2 range
 * (bare soil, senescent and sparsely vegetated surfaces) is compressed into
 * narrow bins under a separate brown palette, and the upper canopy range is
 * stretched into progressively wider ones. Measured against the live documents,
 * the ramps depart from linear-in-value by 12.9% (NDVI) and 21.3% (EVI) of
 * span — 6.4x and 10.7x the ceiling.
 *
 * A non-uniform ramp is not by itself disqualifying, and the two indices have
 * since parted company on exactly that point:
 *  - **NDVI is calibrated.** Its legend stops were rebuilt from MODIS_L3_NDVI
 *    and placed at that ramp's own *value* fractions (the 0.28→0.30 hue jump is
 *    encoded in stop position rather than smoothed over), which absorbs the
 *    bin-width non-uniformity instead of inheriting it. `ndvi` therefore joined
 *    `COLORMAP_DOCS`, and the linear position→value step it asserts is measured
 *    and CI-asserted: all 140 published colours recover, at RMSE 0.024 with a
 *    mean error of +0.002 on a 0–1 index (`MEASURED_INVERSION.ndvi`).
 *  - **EVI cannot follow, for an unrelated reason.** Its GIBS ramp contains pure
 *    black, which the JPEG transport makes indistinguishable from an undrawn
 *    pixel (see vegetationIndexNoData.ts), so no stop placement can calibrate
 *    it. `evi` stays out of `COLORMAP_DOCS`, its values remain gradient
 *    positions rather than colormap-inverted ones, and its error stays
 *    directional: reported EVI reads greener than the ramp by +0.22 on average
 *    at an RMSE of 0.29 — figures that dwarf the colormap quantization band the
 *    probe prints alongside its values, which describes only the ramp's step
 *    size and not this end-to-end error.
 *
 * Scope limits, in the repo's usual order:
 *  - This measures *our inversion against GIBS's ramp*, the tightest reference
 *    available client-side. It does NOT validate MOD13A3 itself against in-situ
 *    measurements; that is the MODIS land team's published validation, which we
 *    cite via the layer's DOI.
 *  - NDVI and EVI are unitless reflectance indices. Nothing here licenses a
 *    claim about vegetation cover, biomass, condition, habitat, or health, and
 *    a bias correction is deliberately NOT applied — the residual is not a
 *    constant offset, and silently shifting values would trade a documented
 *    error for an undocumented one.
 *  - The pinned figures are a snapshot. GIBS can re-render a palette, so the
 *    vegetation-index ramp contract re-measures them against the live documents
 *    and fails naming the index if they drift.
 */

/** Layers this module characterizes: the MOD13A3 vegetation indices. */
export type VegetationIndexId = "ndvi" | "evi";

/**
 * The authoritative GIBS colormap document for each vegetation index, verified
 * against the live service on 2026-08-11. `MODIS_L3_EVI` is recorded here for
 * the first time; unlike NDVI it had no name anywhere in the codebase, so the
 * EVI legend could not be checked against its source at all.
 */
export const VEGETATION_INDEX_COLORMAP_DOCS: Record<VegetationIndexId, string> =
  {
    ndvi: "MODIS_L3_NDVI",
    evi: "MODIS_L3_EVI",
  };

/** Measured fidelity of one vegetation index's legend against GIBS's ramp. */
export interface VegetationRampFidelity {
  /**
   * Largest gap between a bin edge's uniform position and its value position,
   * as a fraction of span (`colormap.linearityDeviation`). 0 = perfectly
   * linear in value.
   */
  linearityDeviation: number;
  /** End-to-end inversion RMSE, in index units (the index is unitless, 0–1). */
  rmse: number;
  /**
   * Mean signed error of recovered − true, index units. Positive means the
   * probe reports a *greener* value than GIBS's ramp assigns to that colour.
   */
  bias: number;
  /** 95th percentile of the absolute error, index units. */
  p95: number;
  /** Ramp colours that our gradient inverted to a value. */
  recoveredSteps: number;
  /** Continuous ramp entries considered. */
  totalSteps: number;
}

/**
 * Committed figures, measured against the GIBS documents using the production
 * `parseColormap` / `linearityDeviation` path and the same legend-LUT inversion
 * `validation.validateInversion` runs for the calibrated layers (that function
 * is typed to `CalibratedLayerId`, so the contract test mirrors its body rather
 * than widening it). Both ramps span 0–1 exactly, so the legend's *end* ticks
 * are faithful.
 *
 * `linearityDeviation` is a property of GIBS's own document — how unevenly its
 * bins are spaced in value — so it is unchanged by anything this app does to
 * its legend. The inversion figures beside it are NOT: they measure this repo's
 * gradient against that ramp, and they move whenever the legend is rebuilt.
 * NDVI's were re-measured 2026-08-14 from the pinned `gibsColormaps.json`
 * snapshot after its stops were placed at the ramp's value fractions; the
 * previous pins (RMSE 0.23, bias +0.133, 108 of 140 recovered) described the
 * retired hand-drawn gradient, whose 32 rejected colours fell in the three
 * contiguous blocks `validation.ts` records. They now agree with
 * `MEASURED_INVERSION.ndvi`, which is the authoritative figure for any
 * calibrated layer; nothing here may restate it differently.
 */
export const MEASURED_VEGETATION_RAMP: Record<
  VegetationIndexId,
  VegetationRampFidelity
> = {
  ndvi: {
    linearityDeviation: 0.129,
    rmse: 0.0236,
    bias: 0.0023,
    p95: 0.0511,
    recoveredSteps: 140,
    totalSteps: 140,
  },
  evi: {
    linearityDeviation: 0.213,
    rmse: 0.294,
    bias: 0.22,
    p95: 0.414,
    recoveredSteps: 94,
    totalSteps: 132,
  },
};

export const VEGETATION_RAMP_LIMITS = [
  "Figures measure RoamingEye's legend-gradient inversion against GIBS's published MOD13A3 ramp, not the MOD13A3 product against in-situ measurements.",
  "The vegetation indices are excluded from the calibrated colormap-inverted layers because their ramps are non-linear in value, so a linear position-to-value reading is an approximation with a documented signed error.",
  "No bias correction is applied: the residual is not a constant offset, so the error is reported rather than silently absorbed into the value.",
  "NDVI and EVI are unitless reflectance indices; none of these figures support a claim about vegetation cover, biomass, condition, or health.",
];

/** Narrow a layer id to a vegetation index, or null for every other layer. */
export function vegetationIndexId(id: LayerId): VegetationIndexId | null {
  return id === "ndvi" || id === "evi" ? id : null;
}

/**
 * The vegetation index as a calibrated layer, or null if it is not one.
 *
 * Membership in `COLORMAP_DOCS` is the repo's single answer to "is a reported
 * value colormap-inverted", and it is asked of the shared record rather than
 * hard-coded here so an index that is later calibrated — or de-calibrated by a
 * GIBS re-render — changes what every surface says at once.
 */
export function calibratedVegetationIndex(
  index: VegetationIndexId
): CalibratedLayerId | null {
  return index in COLORMAP_DOCS ? (index as CalibratedLayerId) : null;
}

/** Measured ramp fidelity for a layer, or null if it is not a vegetation index. */
export function vegetationRampFidelity(
  id: LayerId
): VegetationRampFidelity | null {
  const index = vegetationIndexId(id);
  return index === null ? null : MEASURED_VEGETATION_RAMP[index];
}

/**
 * Whether GIBS's own ramp for a vegetation index is spaced more unevenly in
 * value than the linearity ceiling. Derived from the shared constant, so the
 * claim stays true if the ceiling is ever retuned.
 *
 * This is a statement about the *source document*, not a verdict on the layer.
 * A legend whose stops are placed at the ramp's value fractions inverts
 * correctly through an uneven ramp — NDVI exceeds this ceiling and is
 * calibrated anyway. Use {@link calibratedVegetationIndex} to ask whether a
 * reported value is colormap-inverted.
 */
export function exceedsLinearityCeiling(id: LayerId): boolean {
  const fidelity = vegetationRampFidelity(id);
  return (
    fidelity !== null && fidelity.linearityDeviation > MAX_LINEARITY_DEVIATION
  );
}

/**
 * How many times the ceiling a ramp's deviation is, rounded to one decimal —
 * the readable form of `exceedsLinearityCeiling`. Null for other layers.
 */
export function linearityCeilingMultiple(id: LayerId): number | null {
  const fidelity = vegetationRampFidelity(id);
  if (fidelity === null) return null;
  return (
    Math.round((fidelity.linearityDeviation / MAX_LINEARITY_DEVIATION) * 10) /
    10
  );
}

function indexLabel(index: VegetationIndexId): string {
  return index === "ndvi" ? "NDVI" : "EVI";
}

/**
 * "+0.13" / "-0.04" — a signed index figure at the pinned precision, widened to
 * three decimals for a bias that would otherwise print as "+0.00". A rounded
 * zero carrying a sign reads as a measurement of nothing.
 */
function signed(value: number): string {
  return `${value >= 0 ? "+" : "-"}${Math.abs(value).toFixed(
    Math.abs(value) < 0.005 ? 3 : 2
  )}`;
}

/**
 * Half a colormap step on the 0–1 index scale — the resolution floor the probe
 * already prints. A mean error below it is not a direction the method can
 * resolve, so no direction is claimed for one.
 */
const INDEX_QUANTIZATION_STEP = 1 / 255;

/**
 * Caveat for the legend's interior value tick. The end ticks are exact — both
 * ramps span 0–1 — so only the mid-scale number needs qualifying, and it is
 * qualified with a measured figure rather than a vague "approximate".
 *
 * The two indices need opposite sentences, and quoting the uncalibrated one on
 * both is what this branch exists to prevent. A ramp's `linearityDeviation` is
 * how unevenly GIBS spaced its bins; it becomes the *reader's* error only if
 * the legend ignored that spacing. NDVI's does not — its stops sit at the
 * ramp's value fractions — so telling an NDVI reader the mid tick is "not a
 * colormap-inverted value", 13% of span out, denies the layer's calibration and
 * overstates its measured error by roughly fivefold. For a calibrated index the
 * tick therefore carries `MEASURED_INVERSION`'s figure, the same number the
 * probe panel and CSV quote, so the legend cannot contradict them. EVI keeps
 * the original sentence: it is genuinely uncalibrated (its ramp ends in black,
 * which the JPEG transport cannot tell from an undrawn pixel), so its mid tick
 * really is a gradient position.
 *
 * Null for every layer that is neither a vegetation index nor demonstrably off
 * the linear scale — absence is never rendered as accuracy.
 */
export function vegetationRampTickCaveat(id: LayerId): string | null {
  const index = vegetationIndexId(id);
  const fidelity = vegetationRampFidelity(id);
  if (index === null || fidelity === null) return null;
  const calibrated = calibratedVegetationIndex(index);
  if (calibrated !== null) {
    const measured = MEASURED_INVERSION[calibrated];
    // A calibrated layer that inverts nothing has no figure to quote; say
    // nothing rather than dress a null up as precision.
    if (measured.rmse === null) return null;
    const recovered = measured.total - measured.nulls;
    return (
      `Mid-scale ${indexLabel(index)} is inverted through GIBS's ${VEGETATION_INDEX_COLORMAP_DOCS[index]} colormap, ` +
      `whose value fractions this legend's stops sit at: ${recovered} of its ${measured.total} published ramp colours ` +
      `recover with an RMSE of ${measured.rmse.toFixed(2)} on the 0–1 index. The end labels are exact.`
    );
  }
  if (!exceedsLinearityCeiling(id)) return null;
  const percent = Math.round(fidelity.linearityDeviation * 100);
  return (
    `Mid-scale ${indexLabel(index)} is a position on RoamingEye's gradient, not a colormap-inverted value: ` +
    `GIBS's ${VEGETATION_INDEX_COLORMAP_DOCS[index]} ramp is non-linear, departing from this scale by up to ${percent}% of span. ` +
    `The end labels are exact.`
  );
}

/**
 * The probe status line's measured-error clause for a vegetation index the
 * calibrated-inversion path leaves uncharacterized — today, EVI alone.
 *
 * `probeInversionAccuracy` binds a probe layer to `MEASURED_INVERSION`, which
 * is keyed by `CalibratedLayerId`, so a layer outside `COLORMAP_DOCS` returns
 * "uncharacterized" and `inversionAccuracyClause` renders nothing. That is the
 * right rule for a layer with no measurement — a band is never invented — but
 * EVI is not that layer. Its error against GIBS's published MOD13A3 ramp is
 * measured by the same legend-LUT inversion, committed in
 * {@link MEASURED_VEGETATION_RAMP}, and re-asserted against the live documents
 * by the vegetation-index ramp contract. Only the *lookup* misses it.
 *
 * The consequence is a disclosure inversion on the surface a reader actually
 * uses. Probing NDVI prints "±0.002 per value · ±0.02 vs GIBS colormap";
 * probing EVI prints "±0.002 per value" and stops — so the index whose
 * end-to-end error is more than ten times larger is the one that shows no
 * error figure at all, and its only visible number is the quantization floor
 * this module's own test asserts that error dwarfs. A reader comparing the two
 * layers at one point reads the worse one as the tighter one.
 *
 * The screen is at the consumer, not inside the calibration contract:
 * `COLORMAP_DOCS` membership decides whether a value is colormap-inverted, and
 * widening it to make this clause fire would tell every other surface that EVI
 * is calibrated. Passing the accuracy status in keeps one rule — the clause
 * goes silent by itself the day EVI joins the calibrated set and
 * `inversionAccuracyClause` starts speaking for it, so the two can never both
 * quote a figure.
 *
 * Nothing here is re-measured or improved, and the direction is claimed only
 * when the bias clears one colormap step, on the same terms as
 * {@link describeVegetationRampFidelity}. Null for every layer that is not an
 * uncharacterized vegetation index, and for a ramp that lost no colours and
 * has no direction to name — absence is never rendered as accuracy.
 */
export function uncalibratedVegetationAccuracyClause(
  id: LayerId,
  inversionAccuracyStatus: ProbeInversionAccuracyStatus
): string | null {
  if (inversionAccuracyStatus !== "uncharacterized") return null;
  const index = vegetationIndexId(id);
  const fidelity = vegetationRampFidelity(id);
  if (index === null || fidelity === null) return null;
  const direction =
    Math.abs(fidelity.bias) > INDEX_QUANTIZATION_STEP
      ? `, reads ${signed(fidelity.bias)} ${
          fidelity.bias > 0 ? "greener" : "less green"
        } on average`
      : "";
  const rejected = fidelity.totalSteps - fidelity.recoveredSteps;
  const unreadable =
    rejected > 0
      ? `, ${rejectedShare(rejected / fidelity.totalSteps)} of ramp unreadable`
      : "";
  return (
    `±${fidelity.rmse.toFixed(2)} vs GIBS ${VEGETATION_INDEX_COLORMAP_DOCS[index]} ramp ` +
    `(gradient reading, not colormap-inverted)${direction}${unreadable}`
  );
}

/**
 * A rejected-colour share as a percentage that never rounds a real loss away
 * to "0%", matching how the land-cover and vegetation-support notes format a
 * share. A ramp that lost colours must not report the same "0%" as one that
 * lost none, which is the state the caller's own guard renders as silence.
 */
function rejectedShare(fraction: number): string {
  const percent = Math.round(fraction * 100);
  return percent === 0 && fraction > 0 ? "<1%" : `${percent}%`;
}

/**
 * Honest one-line characterization of a vegetation index's reported values,
 * carrying the source, the measured error, and its direction. Null for layers
 * this module does not characterize.
 */
export function describeVegetationRampFidelity(id: LayerId): string | null {
  const index = vegetationIndexId(id);
  const fidelity = vegetationRampFidelity(id);
  if (index === null || fidelity === null) return null;
  const source =
    calibratedVegetationIndex(index) !== null
      ? `${indexLabel(index)} values are inverted through GIBS's ${VEGETATION_INDEX_COLORMAP_DOCS[index]} colormap, whose value fractions this legend's stops sit at`
      : `${indexLabel(index)} values are read off RoamingEye's legend gradient, not GIBS's ${VEGETATION_INDEX_COLORMAP_DOCS[index]} colormap`;
  // A mean error the method cannot resolve is not a direction. Naming one
  // anyway would turn a calibrated layer's residual scatter into a claim that
  // its values lean green — the same overstatement the tick caveat carried.
  const direction =
    Math.abs(fidelity.bias) > INDEX_QUANTIZATION_STEP
      ? ` (${fidelity.bias > 0 ? "reported values read greener than the ramp" : "reported values read less green than the ramp"})`
      : " (below one colormap step, so no direction is claimed)";
  return (
    `${source}: measured against that ramp they carry ` +
    `an RMSE of ${fidelity.rmse.toFixed(2)} and a mean error of ${signed(fidelity.bias)} index units` +
    `${direction}, ` +
    `over ${fidelity.recoveredSteps} of ${fidelity.totalSteps} ramp colours that invert to a value. ` +
    `No correction is applied and the index implies nothing about cover, biomass, or condition.`
  );
}
