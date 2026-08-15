import { GLDAS_RAMP_SATURATION } from "./gldasRampSaturation";
import type { GldasRampLayerId } from "./gldasRampSaturation";
import type { LayerId } from "./timeline";

/**
 * What share of an averaged footprint a charted GLDAS water-cycle mean actually
 * covered — and why the rest of it cannot be read as dry.
 *
 * Precipitation and soil moisture are the two fields RoamingEye renders from one
 * GLDAS_NOAH025_M v2.1 run, and they are the only averaged layers whose series
 * surface stated no share at all. Sea-surface temperature, the vegetation
 * indices and snow cover each say what their mean covered
 * (marineAveragedSstSupport.ts, vegetationAveragedSupport.ts,
 * snowAveragedSupport.ts); an area or drawn-region probe of the water-cycle
 * layers charted a bare mean, and a mean over part of a box reads as a mean of
 * the box.
 *
 * Three separate things leave a pixel out of that mean, and the sampler
 * collapses all of them into one absent sample:
 *
 *  - **Off the land domain.** The GLDAS Noah land-surface model is solved on
 *    land cells only, so open water carries no value by construction and GIBS
 *    draws nothing there (soilProbeDomain.ts, atmosphereProbeDomain.ts).
 *  - **The `< 0` fill cap.** Negative precipitation rate and negative column
 *    water are physically impossible, so that swatch is model fill rather than a
 *    measurement, and the inversion rejects it.
 *  - **The open top cap.** Both ramps end in a saturating catch-all —
 *    `≥ 5.0e-04 kg/m²/s` (≡ 43.2 mm/day) for precipitation, `≥ 50.0 kg/m²` for
 *    soil moisture — which `parseColormapEntries` drops by documented design, so
 *    a saturated cell inverts to `null` too (gldasRampSaturation.ts).
 *
 * The third one is why this module is not a copy of the snow clause. Snow's
 * undrawn pixels are its *lowest* ones (GIBS leaves percent 0 transparent), so
 * that clause can say the charted swing is damped. Here the discarded set spans
 * both ends of the ramp at once: it holds the footprint's wettest cells and its
 * off-domain ones together. So a low drawn share carries no direction, and the
 * clause's load-bearing job is to refuse the dry reading — the same refusal
 * `soilProbeDomain.ts` makes for a wholly empty record, extended to the partial
 * one the series surface actually charts.
 *
 * Honesty limits:
 *  - `validFraction` is the only input, and it cannot separate the three
 *    exclusions (GLDAS_RAMP_SATURATION_LIMITATIONS states this). The clause
 *    therefore reports the drawn share and names the three readings; it never
 *    says which applies to any pixel, month, or footprint.
 *  - No direction of error is claimed, and no corrected, reweighted, or
 *    substituted mean is offered. Distinguishing the exclusions needs the
 *    sampled colours (`classifyGldasRampSample`), which the probe path does not
 *    load; until it does, a share is the honest limit of what can be said.
 *  - The drawn share does not locate the drawn cells within the footprint and is
 *    never a wetted-area or land-fraction measurement for it.
 *  - Nothing here claims drought or flood state, recharge, runoff,
 *    water-balance closure, cause, or any future value.
 *
 * Pure, render-free logic (see gldasAveragedSupport.test.ts). Provenance is the
 * GIBS colormap document named per layer in `GLDAS_RAMP_SATURATION`; the cited
 * dataset is unchanged.
 */

/** Which averaged footprint the shares describe. A point probe has none. */
export type GldasAveragedFootprint = "drawn-region" | "sampled-area";

export type GldasAveragedSupportStatus =
  /** No shares supplied — a point probe charts a median, not a mean. */
  | "unreported"
  /** Shares supplied, but no month charted a value to qualify. */
  | "no-charted-month"
  /** Charted months exist, but none carried a usable share. */
  | "unclassifiable"
  /** Every charted month covered the whole footprint. */
  | "fully-drawn"
  /** At least one charted mean covered less than the whole footprint. */
  | "partly-drawn";

export const GLDAS_AVERAGED_SUPPORT_LIMITATIONS = [
  "Each charted mean covers only the pixels GLDAS drew; it is never a mean of the drawn or sampled footprint.",
  "An undrawn pixel is off the land domain, at the ramp's `< 0` fill cap, or at or above its open top cap, and validFraction cannot separate the three.",
  "Because the discarded set includes the footprint's wettest cells, a low drawn share is not evidence of dry ground and no direction of error is stated.",
  "The drawn share does not locate the drawn cells within the footprint and is not a wetted-area or land-fraction measurement for it.",
  "Months are summarized as a range of drawn shares; the range does not say which months sat at either end, and gives no trend.",
  "The descriptor reports sampling support only; it never infers a condition, drought or flood state, recharge, runoff, water-balance closure, cause, or any future value.",
] as const;

export interface GldasAveragedSupportSummary {
  layerId: GldasRampLayerId;
  footprint: GldasAveragedFootprint;
  status: GldasAveragedSupportStatus;
  /** Months that plotted a mean. */
  chartedMonths: number;
  /** Charted months that also carried a share in [0, 1]. */
  classifiedMonths: number;
  /** Range of drawn share across the classified months. */
  minFraction: number | null;
  maxFraction: number | null;
}

/**
 * Classify the drawn shares behind a charted water-cycle series.
 *
 * Only an exact 1 counts as fully drawn: the clause reports whole percent, so a
 * footprint printing "100%" at 0.999 still excluded pixels and still needs the
 * caveat. A share outside [0, 1] is not a share and is skipped rather than
 * silently treated as complete.
 */
export function summarizeGldasAveragedSupport(
  layerId: GldasRampLayerId,
  footprint: GldasAveragedFootprint,
  values: readonly (number | null | undefined)[] | null | undefined,
  validFractions: readonly (number | null | undefined)[] | null | undefined
): GldasAveragedSupportSummary {
  const shared = {
    layerId,
    footprint,
    chartedMonths: 0,
    classifiedMonths: 0,
    minFraction: null,
    maxFraction: null,
  } as const;

  if (!values || !validFractions) return { ...shared, status: "unreported" };

  let chartedMonths = 0;
  let classifiedMonths = 0;
  let minFraction = Number.POSITIVE_INFINITY;
  let maxFraction = Number.NEGATIVE_INFINITY;

  for (let i = 0; i < values.length; i++) {
    const value = values[i];
    if (value === null || value === undefined || !Number.isFinite(value)) {
      continue;
    }
    chartedMonths++;
    const fraction = validFractions[i];
    if (
      fraction === null ||
      fraction === undefined ||
      !Number.isFinite(fraction) ||
      fraction < 0 ||
      fraction > 1
    ) {
      continue;
    }
    classifiedMonths++;
    if (fraction < minFraction) minFraction = fraction;
    if (fraction > maxFraction) maxFraction = fraction;
  }

  if (chartedMonths === 0) return { ...shared, status: "no-charted-month" };
  if (classifiedMonths === 0) {
    return { ...shared, chartedMonths, status: "unclassifiable" };
  }

  return {
    layerId,
    footprint,
    status: minFraction === 1 ? "fully-drawn" : "partly-drawn",
    chartedMonths,
    classifiedMonths,
    minFraction,
    maxFraction,
  };
}

/**
 * One status-line clause, or null when there is nothing worth saying.
 *
 * Silent on a fully drawn footprint, whose mean really does cover it; silent
 * when no shares were supplied or none was usable, so an ordinary readout is
 * unchanged.
 *
 * Silent on an empty record too, which is the one place this module diverges
 * from its siblings. `emptyAtmosphereProbeNote` and `emptySoilProbeNote` already
 * own that sentence for these two layers, and both already refuse the dry
 * reading; a second clause beside them would qualify one reading twice.
 */
export function gldasAveragedSupportClause(
  summary: GldasAveragedSupportSummary
): string | null {
  if (summary.status !== "partly-drawn") return null;

  const facts = GLDAS_RAMP_SATURATION[summary.layerId];
  const place = footprintLabel(summary.footprint);
  // The bound in the unit the probe REPORTS, never the published label: the
  // precipitation ramp publishes `≥ 5.0e-04` in native kg/m²/s while the panel
  // beside it prints mm/day, and quoting the label would misstate the ceiling
  // by four orders of magnitude.
  const ceiling = `≥ ${formatBound(facts.ceiling.boundReported)} ${facts.reportedUnit}`;

  return (
    `drawn over ${describeShareRange(summary)} of the ${place} — GLDAS is ` +
    `solved on land cells only, and the ramp's sub-zero fill and its open ` +
    `${ceiling} top bin are discarded as well, so each mean covers its drawn ` +
    `cells alone and an undrawn share is not evidence of dry ground`
  );
}

/**
 * The clause for an averaged probe, or null when it does not apply. Gated to the
 * two GLDAS water-cycle layers: this module reasons about that product's
 * land-only domain and the open caps on its shared ramp, and the same shares
 * mean something different for a layer drawn over its whole domain. A point
 * probe passes no shares and stays silent.
 */
export function gldasAveragedSupportNote(
  layerId: LayerId | null | undefined,
  footprint: GldasAveragedFootprint,
  values: readonly (number | null | undefined)[] | null | undefined,
  validFractions: readonly (number | null | undefined)[] | null | undefined
): string | null {
  if (layerId !== "precip" && layerId !== "soil") return null;
  return gldasAveragedSupportClause(
    summarizeGldasAveragedSupport(layerId, footprint, values, validFractions)
  );
}

function footprintLabel(footprint: GldasAveragedFootprint): string {
  return footprint === "drawn-region" ? "drawn region" : "sampled area";
}

function describeShareRange(summary: GldasAveragedSupportSummary): string {
  const min = summary.minFraction ?? 0;
  const max = summary.maxFraction ?? 0;
  return min === max
    ? formatDrawnShare(min)
    : `${formatDrawnShare(min)}–${formatDrawnShare(max)}`;
}

/**
 * Whole percent, except that a positive share below half a percent reads as
 * "<1%" rather than a "0%" that would contradict the mean printed beside it.
 */
function formatDrawnShare(fraction: number): string {
  const percent = Math.round(fraction * 100);
  return percent === 0 && fraction > 0 ? "<1%" : `${percent}%`;
}

/** Trailing zeros off an integral bound: "50 kg/m²", not "50.0 kg/m²". */
function formatBound(bound: number): string {
  return Number.isInteger(bound) ? String(bound) : bound.toFixed(1);
}
