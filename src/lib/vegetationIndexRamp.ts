import { MAX_LINEARITY_DEVIATION } from "./colormap";
import type { LayerId } from "./timeline";

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
 * span — 6.4x and 10.7x the ceiling. That is why `ndvi` and `evi` are absent
 * from `COLORMAP_DOCS`: they would fail the linear position→value contract that
 * membership asserts, so they are deliberately not treated as calibrated,
 * colormap-inverted layers.
 *
 * The consequence is directional, so it is worth stating plainly: running each
 * GIBS ramp colour back through the production inversion recovers the index
 * with a *positive* mean error. A reported vegetation-index value reads greener
 * than GIBS's ramp says — by +0.13 NDVI and +0.22 EVI on average, with an RMSE
 * of 0.23 and 0.29 on a 0–1 index. Those figures dwarf the colormap
 * quantization band the probe prints alongside its values, which describes only
 * the ramp's step size and not this end-to-end error.
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
 * Committed figures, measured 2026-08-11 against the live GIBS documents using
 * the production `parseColormap` / `linearityDeviation` path and the same
 * legend-LUT inversion `validation.validateInversion` runs for the calibrated
 * layers (that function is typed to `CalibratedLayerId`, so the contract test
 * mirrors its body rather than widening it). Both ramps span 0–1 exactly, so
 * the legend's *end* ticks are faithful; everything between them is where the
 * non-linearity lives.
 */
export const MEASURED_VEGETATION_RAMP: Record<
  VegetationIndexId,
  VegetationRampFidelity
> = {
  ndvi: {
    linearityDeviation: 0.129,
    rmse: 0.23,
    bias: 0.133,
    p95: 0.332,
    recoveredSteps: 108,
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

/** Measured ramp fidelity for a layer, or null if it is not a vegetation index. */
export function vegetationRampFidelity(
  id: LayerId
): VegetationRampFidelity | null {
  const index = vegetationIndexId(id);
  return index === null ? null : MEASURED_VEGETATION_RAMP[index];
}

/**
 * Whether a vegetation index's ramp exceeds the linearity ceiling that
 * membership in `COLORMAP_DOCS` asserts. Derived from the shared constant, so
 * the claim stays true if the ceiling is ever retuned.
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

/** "+0.13" / "-0.04" — a signed index figure at the pinned precision. */
function signed(value: number): string {
  return `${value >= 0 ? "+" : "-"}${Math.abs(value).toFixed(2)}`;
}

/**
 * Caveat for the legend's interior value tick. The end ticks are exact — both
 * ramps span 0–1 — so only the mid-scale number needs qualifying, and it is
 * qualified with the measured deviation rather than a vague "approximate".
 * Null for every layer whose ramp is linear enough to trust throughout.
 */
export function vegetationRampTickCaveat(id: LayerId): string | null {
  const index = vegetationIndexId(id);
  const fidelity = vegetationRampFidelity(id);
  if (index === null || fidelity === null) return null;
  if (!exceedsLinearityCeiling(id)) return null;
  const percent = Math.round(fidelity.linearityDeviation * 100);
  return (
    `Mid-scale ${indexLabel(index)} is a position on RoamingEye's gradient, not a colormap-inverted value: ` +
    `GIBS's ${VEGETATION_INDEX_COLORMAP_DOCS[index]} ramp is non-linear, departing from this scale by up to ${percent}% of span. ` +
    `The end labels are exact.`
  );
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
  return (
    `${indexLabel(index)} values are read off RoamingEye's legend gradient, not GIBS's ` +
    `${VEGETATION_INDEX_COLORMAP_DOCS[index]} colormap: measured against that ramp they carry ` +
    `an RMSE of ${fidelity.rmse.toFixed(2)} and a mean error of ${signed(fidelity.bias)} index units ` +
    `(${fidelity.bias > 0 ? "reported values read greener than the ramp" : "reported values read less green than the ramp"}), ` +
    `over ${fidelity.recoveredSteps} of ${fidelity.totalSteps} ramp colours that invert to a value. ` +
    `No correction is applied and the index implies nothing about cover, biomass, or condition.`
  );
}
