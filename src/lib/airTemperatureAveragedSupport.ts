import { MERRA2_AIR_TEMPERATURE_RAMP_CAPS } from "./atmosphereProbeDomain";
import type { LayerId } from "./timeline";

/**
 * What share of an averaged footprint a charted 2 m air-temperature mean
 * actually covered — and why the rest of it is evidence in neither direction.
 *
 * Air temperature was the last averaged layer whose series surface charted a
 * bare mean. Sea-surface temperature, the vegetation indices, snow cover and
 * the two GLDAS water-cycle fields each say what their mean covered
 * (marineAveragedSstSupport.ts, vegetationAveragedSupport.ts,
 * snowAveragedSupport.ts, gldasAveragedSupport.ts); the two layers whose caps
 * are *censored* rather than rejected are marked instead by their own end-cap
 * screens (probeAerosolAveragedCensoring.ts, probeLstAveragedCensoring.ts).
 * An area or drawn-region probe of `airtemp` had neither, and a mean over part
 * of a box reads as a mean of the box.
 *
 * Unlike its siblings the mechanism here is not a domain boundary. MERRA-2 is a
 * global reanalysis defined over land and ocean alike
 * (atmosphereProbeDomain.ts), so nothing is missing by construction. What
 * removes a cell is the rendered ramp: GIBS publishes
 * `MERRA2_2m_Air_Temperature_Monthly` between 220 K and 310 K and closes it at
 * *both* ends with an open catch-all, `parseColormapEntries` drops both by the
 * same documented design that drops the GLDAS caps, and — measured against the
 * display-legend LUT the probe inverts against on 2026-08-15 — the two cap
 * colours sit 76.6 and 74.5 RGB units from the nearest ramp colour, outside the
 * 60-unit `NO_DATA_DISTANCE`. So a cell beyond either end inverts to `null` and
 * drops out of the weighted mean exactly as an undrawn pixel does. Those bounds
 * and colours are read from `MERRA2_AIR_TEMPERATURE_RAMP_CAPS` rather than
 * restated, so this clause cannot outlive the measured colormap facts.
 *
 * Both discarded ends are physically reachable monthly means — below 220 K
 * (−53.15 °C) on the East Antarctic plateau in winter, at or above 310 K
 * (36.85 °C) in the hottest desert summers — which is why this module says
 * strictly less than the snow and vegetation ones. Their undrawn pixels are all
 * at the *low* end of a ramp, so those clauses can say the charted swing is
 * damped. Here the discarded set can hold the footprint's coldest cells and its
 * hottest cells at once, so a low drawn share carries no direction at all, and
 * the clause's load-bearing job is to refuse *both* readings rather than to
 * name one.
 *
 * `emptyAtmosphereProbeNote` already owns the wholly empty record for this
 * layer and already refuses both readings there; this module is silent in that
 * case, so the two never qualify one record twice. It extends the same refusal
 * to the partial record the series surface actually charts.
 *
 * Honesty limits:
 *  - `validFraction` is the only input, and the sampler collapses every colour
 *    it cannot match into one absent sample (see `onSampledColors` in
 *    probe/ProbeSampler.ts). So this never claims that an undrawn cell *was*
 *    beyond a cap; it reports the drawn share and names what the ramp discards.
 *  - No direction of error is claimed in either sense, and no corrected,
 *    reweighted, or substituted mean is offered.
 *  - The drawn share does not locate the drawn cells within the footprint and
 *    is never a land-fraction or extent measurement for it.
 *  - Nothing here claims heat, cold, comfort, hazard, health, trend, cause, or
 *    any future value. A cell beyond a cap is known only to be outside the
 *    window, never by how much.
 *
 * Pure, render-free logic (see airTemperatureAveragedSupport.test.ts). The
 * cited dataset is unchanged: MERRA-2 `M2TMNXSLV` v5.12.4
 * (doi:10.5067/AP1B0BA5PD2K), rendered through the GIBS colormap document named
 * in `MERRA2_AIR_TEMPERATURE_RAMP_CAPS`.
 */

/** The one layer this module speaks for; kept literal for the drift guard. */
export const AIR_TEMPERATURE_AVERAGED_SUPPORT_LAYER_ID = "airtemp" as const;

/**
 * Which averaged footprint the shares describe. A point probe has none.
 *
 * Declared locally rather than imported from a sibling: an atmosphere module
 * must not depend on the marine or water-cycle ones, and the probe panel passes
 * the same two literals to all of them.
 */
export type AirTemperatureAveragedFootprint = "drawn-region" | "sampled-area";

export type AirTemperatureAveragedSupportStatus =
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

export const AIR_TEMPERATURE_AVERAGED_SUPPORT_LIMITATIONS = [
  "Each charted mean covers only the cells that inverted to a value; it is never a mean of the drawn or sampled footprint.",
  "A cell beyond either open cap on the 220-310 K ramp is discarded, and validFraction cannot say whether an absent sample was one of those or any other unmatched colour.",
  "Both discarded ends are physically reachable monthly means, so a low drawn share is evidence of neither a cooler nor a warmer footprint and no direction of error is stated.",
  "The drawn share does not locate the drawn cells within the footprint and is not a land-fraction or extent measurement for it.",
  "Months are summarized as a range of drawn shares; the range does not say which months sat at either end, and gives no trend.",
  "The descriptor reports sampling support only; it never infers heat, cold, comfort, hazard, health, trend, cause, or any future value.",
] as const;

export interface AirTemperatureAveragedSupportSummary {
  layerId: typeof AIR_TEMPERATURE_AVERAGED_SUPPORT_LAYER_ID;
  footprint: AirTemperatureAveragedFootprint;
  status: AirTemperatureAveragedSupportStatus;
  /** Months that plotted a mean. */
  chartedMonths: number;
  /** Charted months that also carried a share in [0, 1]. */
  classifiedMonths: number;
  /** Range of drawn share across the classified months. */
  minFraction: number | null;
  maxFraction: number | null;
}

/**
 * Classify the drawn shares behind a charted air-temperature series.
 *
 * Only an exact 1 counts as fully drawn: a footprint at 0.999 still excluded
 * cells and still needs the caveat. `formatDrawnShare` holds up its end by
 * printing that share as ">99%", so the clause never rounds the excluded cells
 * away. A share outside [0, 1] is not a share and is skipped rather than
 * silently treated as complete.
 */
export function summarizeAirTemperatureAveragedSupport(
  footprint: AirTemperatureAveragedFootprint,
  values: readonly (number | null | undefined)[] | null | undefined,
  validFractions: readonly (number | null | undefined)[] | null | undefined
): AirTemperatureAveragedSupportSummary {
  const shared = {
    layerId: AIR_TEMPERATURE_AVERAGED_SUPPORT_LAYER_ID,
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
    layerId: AIR_TEMPERATURE_AVERAGED_SUPPORT_LAYER_ID,
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
 * unchanged; and silent on an empty record, which `emptyAtmosphereProbeNote`
 * already explains for this layer with the same two-sided refusal.
 */
export function airTemperatureAveragedSupportClause(
  summary: AirTemperatureAveragedSupportSummary
): string | null {
  if (summary.status !== "partly-drawn") return null;

  const { closedSpan, unit } = MERRA2_AIR_TEMPERATURE_RAMP_CAPS;
  const place = footprintLabel(summary.footprint);

  return (
    `drawn over ${describeShareRange(summary)} of the ${place} — the MERRA-2 ` +
    `ramp is representable only between ${closedSpan.min} and ` +
    `${closedSpan.max} ${unit}, and the open catch-all beyond each end is ` +
    `discarded rather than averaged in, so each mean covers its drawn cells ` +
    `alone and an undrawn share is evidence of neither a cooler nor a warmer ` +
    `footprint`
  );
}

/**
 * The clause for an averaged probe, or null when it does not apply. Gated to
 * the air-temperature layer: this module reasons about the two open caps on
 * that product's rendered ramp, and the same shares mean something different
 * for a layer whose absent cells are a domain boundary or a censored end bin. A
 * point probe passes no shares and stays silent.
 */
export function airTemperatureAveragedSupportNote(
  layerId: LayerId | null | undefined,
  footprint: AirTemperatureAveragedFootprint,
  values: readonly (number | null | undefined)[] | null | undefined,
  validFractions: readonly (number | null | undefined)[] | null | undefined
): string | null {
  if (layerId !== AIR_TEMPERATURE_AVERAGED_SUPPORT_LAYER_ID) return null;
  return airTemperatureAveragedSupportClause(
    summarizeAirTemperatureAveragedSupport(footprint, values, validFractions)
  );
}

function footprintLabel(footprint: AirTemperatureAveragedFootprint): string {
  return footprint === "drawn-region" ? "drawn region" : "sampled area";
}

/**
 * The span of drawn shares, collapsed to a single share when both ends print
 * the same text. Rounding makes that ordinary: a footprint whose months ran
 * 0.990 to 0.994 is not usefully described as "99%–99%", and comparing the
 * rendered ends rather than the raw fractions keeps the clause from announcing
 * a range it cannot show.
 */
function describeShareRange(
  summary: AirTemperatureAveragedSupportSummary
): string {
  const min = formatDrawnShare(summary.minFraction ?? 0);
  const max = formatDrawnShare(summary.maxFraction ?? 0);
  return min === max ? min : `${min}–${max}`;
}

/**
 * Whole percent, except at the two ends where rounding would contradict the
 * clause it sits in.
 *
 * A positive share below half a percent reads as "<1%" rather than a "0%" that
 * would contradict the mean printed beside it. A share of exactly zero stays
 * "0%": there the absence is real.
 *
 * Symmetrically, a share short of the whole footprint reads as ">99%" rather
 * than a "100%" that the rest of the clause immediately contradicts by saying
 * each mean covers its drawn cells alone and that an undrawn share is evidence
 * of neither a cooler nor a warmer footprint.
 * `summarizeAirTemperatureAveragedSupport` already refuses to call anything but
 * an exact 1 fully drawn for this reason; rounding the same share up to "100%"
 * here gave that refusal nothing to show. A large footprint makes it ordinary
 * rather than rare — a drawn region samples up to 28x28 (lib/probe.ts
 * `regionGridSize`), so one undrawn cell among 784 rounds to 100%. Only an
 * exact 1 prints "100%", matching vegetationAveragedSupport.ts, which formats
 * the same share for the same sampler.
 */
function formatDrawnShare(fraction: number): string {
  const percent = Math.round(fraction * 100);
  if (percent === 0 && fraction > 0) return "<1%";
  if (percent === 100 && fraction < 1) return ">99%";
  return `${percent}%`;
}
