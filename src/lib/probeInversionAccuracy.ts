import type { CalibratedLayerId } from "./colormap";
import { PROBE_SCALES, uncertaintyText, type ProbeScale } from "./probe";
import type { LayerId } from "./timeline";
import { MEASURED_INVERSION } from "./validation";

/**
 * Report the probe's *measured* end-to-end accuracy on the surfaces a reader
 * actually sees.
 *
 * The probe panel and the probe CSV both quote `uncertaintyText` — half a LUT
 * step, e.g. "±0.06 °C" for sea-surface temperature. That figure is real but
 * it is only the **quantization floor** of the inversion: how finely a
 * position on our legend gradient can be resolved. It says nothing about
 * whether that gradient position lands on the right value.
 *
 * The repository already measures the part that matters. `validateInversion`
 * feeds GIBS's authoritative colormap through the production inversion and
 * compares the recovered value to the published one; the committed residuals
 * live in `MEASURED_INVERSION`, are documented in METHODS §3 and
 * docs/validation.md, and are re-asserted weekly against live GIBS by
 * `contract/inversion-validation.contract.test.ts`. For sea-surface
 * temperature that measurement is **RMSE 5.11 °C with 85 of the 213 published
 * ramp colours rejected as no-data** — about eighty times the ±0.06 °C the
 * panel quotes, and the unreadable colours are not scattered noise but whole
 * contiguous temperature bands (near-freezing polar water, most of the
 * 18–24 °C range covering the world's productive shelf seas, and the warmest
 * tropical water).
 *
 * A reader comparing two months of SST, or reading the trend clause, needs to
 * know the second number. This module binds each probe layer to its committed
 * figure and formats it for the panel and the CSV, so the honest accuracy
 * travels with the value instead of living only in the docs.
 *
 * Scope discipline, deliberately narrow:
 *  - Nothing here re-derives, re-measures, or improves the inversion. It only
 *    reports a figure that is already measured, cited, and CI-asserted.
 *  - RMSE is quoted in the probe's *reported* unit — the same unit the panel
 *    and the CSV `value` column use, after any `SCALE_CONVERSIONS` factor —
 *    so a ± band is never dimensionally mismatched to the number it qualifies.
 *  - A layer with no measured figure (NDVI, EVI, snow — not colormap-inverted
 *    against a published GIBS ramp) is reported as uncharacterized. A band is
 *    never invented for it, and absence is never rendered as accuracy.
 *  - A layer whose gradient rejects the entire published ramp (LST) has no
 *    RMSE at all; that is reported as its own state rather than as a small
 *    error, because "no colour inverted" is not "the values are close".
 *  - This describes the *rendering-inversion* error only. It is not the
 *    accuracy of GIBS's underlying L3 product against in-situ measurement —
 *    that is the product teams' own published validation, which METHODS.md
 *    cites separately — and it implies nothing biological, ecological,
 *    causal, or predictive.
 *
 * Tightening the inversion itself (sampling through GIBS's real colormaps
 * rather than our display legend) is tracked as issue #170; until that lands,
 * stating the measured error is the honest interim.
 */

export type ProbeInversionAccuracyStatus =
  /** A measured RMSE against the published GIBS colormap exists. */
  | "characterized"
  /** The gradient rejected every published ramp colour (no RMSE to quote). */
  | "all-colours-rejected"
  /** Not one of the colormap-validated layers; no figure exists or is invented. */
  | "uncharacterized";

export interface ProbeInversionAccuracy {
  layerId: LayerId;
  status: ProbeInversionAccuracyStatus;
  /**
   * Measured inversion RMSE in the probe's reported unit, or null when the
   * layer is uncharacterized or rejected every ramp colour.
   */
  rmse: number | null;
  /** Published ramp colours the display gradient rejects as no-data. */
  rejectedColours: number | null;
  /** Published ramp colours considered. */
  totalColours: number | null;
  /** Rejected share in 0..1, or null when there is no measurement. */
  rejectedFraction: number | null;
  /** Quantization floor already quoted by the panel; kept for contrast. */
  quantizationText: string;
  unit: string;
}

/** Layers with a committed inversion measurement, typed as a lookup guard. */
function measuredLayer(layerId: LayerId): CalibratedLayerId | null {
  return layerId in MEASURED_INVERSION ? (layerId as CalibratedLayerId) : null;
}

/**
 * Bind a probe layer to its committed inversion measurement, converted into
 * the unit the probe reports.
 */
export function probeInversionAccuracy(
  layerId: LayerId,
  scale: ProbeScale = PROBE_SCALES[layerId]
): ProbeInversionAccuracy {
  const quantizationText = uncertaintyText(scale);
  const calibrated = measuredLayer(layerId);
  if (!calibrated) {
    return {
      layerId,
      status: "uncharacterized",
      rmse: null,
      rejectedColours: null,
      totalColours: null,
      rejectedFraction: null,
      quantizationText,
      unit: scale.unit,
    };
  }
  const measured = MEASURED_INVERSION[calibrated];
  // MEASURED_INVERSION is already stored in the probe's *reported* unit:
  // `validateInversion` applies the same SCALE_CONVERSIONS factor the probe
  // applies before differencing, so precipitation's RMSE is mm/day, not
  // kg/m²/s. The figure is therefore quoted as-is and no second conversion is
  // applied here — doing so would scale the error a second time.
  const total = measured.total;
  return {
    layerId,
    status: measured.rmse === null ? "all-colours-rejected" : "characterized",
    rmse: measured.rmse,
    rejectedColours: measured.nulls,
    totalColours: total,
    rejectedFraction: total > 0 ? measured.nulls / total : null,
    quantizationText,
    unit: scale.unit,
  };
}

/** Round an RMSE for display: enough digits to be meaningful, no more. */
function formatRmse(rmse: number, unit: string): string {
  const digits = Math.abs(rmse) >= 10 ? 0 : Math.abs(rmse) >= 1 ? 1 : 2;
  return `±${rmse.toFixed(digits)}${unit ? ` ${unit}` : ""}`;
}

/**
 * Short clause for the probe panel status line, sitting next to the
 * quantization figure it qualifies. Empty for uncharacterized layers — the
 * panel then says only what it can defend.
 */
export function inversionAccuracyClause(
  accuracy: ProbeInversionAccuracy
): string {
  if (accuracy.status === "uncharacterized") return "";
  if (accuracy.status === "all-colours-rejected") {
    return "no colour on this layer's ramp inverts — values unvalidated";
  }
  const rejected =
    accuracy.rejectedFraction !== null && accuracy.rejectedFraction > 0
      ? `, ${Math.round(accuracy.rejectedFraction * 100)}% of ramp unreadable`
      : "";
  return `${formatRmse(accuracy.rmse as number, accuracy.unit)} vs GIBS colormap${rejected}`;
}

/**
 * CSV provenance header for the measured inversion accuracy. Returned as a
 * list so an uncharacterized layer contributes no line at all rather than an
 * empty or hedged one.
 */
export function inversionAccuracyCsvHeaders(
  accuracy: ProbeInversionAccuracy
): string[] {
  if (accuracy.status === "uncharacterized") return [];
  // No commas: a `#` line must never contain a CSV delimiter (see the header
  // discipline documented on csvHeaderText in probe.ts).
  if (accuracy.status === "all-colours-rejected") {
    return [
      `# inversion_validation: the display gradient rejects all ${accuracy.totalColours} published ramp colours — no measured RMSE; treat values as unvalidated (docs/validation.md)`,
    ];
  }
  return [
    `# inversion_validation: RMSE ${formatRmse(accuracy.rmse as number, accuracy.unit)} against the published GIBS colormap; ${accuracy.rejectedColours} of ${accuracy.totalColours} ramp colours rejected as no-data (docs/validation.md; re-asserted weekly against live GIBS)`,
    `# inversion_validation_scope: rendering-inversion error only; not the accuracy of the underlying L3 product against in-situ measurement`,
  ];
}
