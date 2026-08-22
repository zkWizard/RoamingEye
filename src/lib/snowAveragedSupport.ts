import type { LayerId } from "./timeline";

/**
 * What share of an averaged footprint a charted snow-cover mean actually
 * covered — and what the rest of it is.
 *
 * GIBS renders percent 0 transparent in MODIS_Terra_NDSI_Snow_Cover (see
 * snowCoverRamp.ts), so snow-free ground is not drawn at all and the sampler
 * rejects those pixels rather than averaging them in. A rendered tile therefore
 * cannot separate "no snow" from "not observed": both arrive as absent pixels,
 * and both lower `validFraction`.
 *
 * The consequence has to be stated, because the charted number reads like a
 * share of the footprint and is not one — it is the average cover *where cover
 * was drawn*. The place panel already says this for a single month
 * (snowCoverNarrative.ts DRAWN_FRACTION_CAVEAT); the series surface reported a
 * bare mean.
 *
 * A time series makes it worse than a single card faces, in a way specific to
 * this layer. The undrawn share is not a fixed offset: it is smallest at peak
 * cover and largest through the melt season, when only the remaining patches
 * are drawn and the mean is taken over them alone. The charted seasonal swing
 * is therefore damped against a swing over the whole footprint, not merely
 * shifted from it — so a reader comparing summer to winter on this chart is
 * comparing two different sampled areas.
 *
 * Nothing here fills the undrawn share in. Snow-free ground would enter a
 * whole-footprint mean as 0%, but unobserved ground — cloud, polar darkness, a
 * failed retrieval — could hold any cover at all, and the tile does not say
 * which pixels are which. So the clause names what was excluded and declines to
 * state a corrected mean or a direction of error. It claims no snow depth,
 * snow-water equivalent, melt or accumulation rate, runoff, cause, or forecast,
 * and a low share is a statement about how much of the footprint carried drawn
 * snow, never about the accuracy of the pixels that did.
 *
 * Pure, render-free logic (see snowAveragedSupport.test.ts).
 */

/** Which averaged footprint the shares describe. A point probe has none. */
export type SnowAveragedFootprint = "drawn-region" | "sampled-area";

export type SnowAveragedSupportStatus =
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

export const SNOW_AVERAGED_SUPPORT_LIMITATIONS = [
  "GIBS draws no colour for 0% snow, so snow-free and unobserved ground are indistinguishable in the rendered tile and both are excluded from the mean.",
  "Each charted mean covers only its drawn pixels; it is never a mean of the drawn or sampled footprint.",
  "The undrawn share is largest through the melt season, so the charted seasonal swing is damped rather than offset by a fixed amount.",
  "The drawn share does not locate the drawn snow within the footprint and is not a snow-covered-area measurement for the footprint.",
  "Months are summarized as a range of drawn shares; the range does not say which months sat at either end, and gives no trend.",
  "Snow cover is a fractional-area descriptor and never a depth, snow-water-equivalent, melt-rate, or runoff measurement.",
] as const;

export interface SnowAveragedSupportSummary {
  footprint: SnowAveragedFootprint;
  status: SnowAveragedSupportStatus;
  /** Months that plotted a mean. */
  chartedMonths: number;
  /** Charted months that also carried a share in [0, 1]. */
  classifiedMonths: number;
  /** Range of drawn share across the classified months. */
  minFraction: number | null;
  maxFraction: number | null;
}

/**
 * Classify the drawn shares behind a charted snow-cover series.
 *
 * Only an exact 1 counts as fully drawn: a footprint at 0.999 still excluded
 * pixels and still needs the caveat. `formatDrawnShare` holds up its end by
 * printing that share as ">99%", so the clause never rounds the excluded pixels
 * away. A share outside [0, 1] is not a share and is skipped rather than
 * silently treated as complete.
 */
export function summarizeSnowAveragedSupport(
  footprint: SnowAveragedFootprint,
  values: readonly (number | null | undefined)[] | null | undefined,
  validFractions: readonly (number | null | undefined)[] | null | undefined
): SnowAveragedSupportSummary {
  const shared = {
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
    footprint,
    status: minFraction === 1 ? "fully-drawn" : "partly-drawn",
    chartedMonths,
    classifiedMonths,
    minFraction,
    maxFraction,
  };
}

/**
 * The mechanism, stated once, in the same terms the place panel already uses.
 * It says what the absent pixels are without claiming any particular pixel is
 * snow-free rather than unobserved.
 */
const UNDRAWN_MECHANISM =
  "GIBS draws no colour for 0% snow, so snow-free and unobserved ground are " +
  "indistinguishable and excluded";

/**
 * One status-line clause, or null when there is nothing worth saying.
 *
 * Silent on a fully drawn footprint, whose mean really does cover it and where
 * the clause would describe an exclusion that did not happen; silent when no
 * shares were supplied or none was usable, so an ordinary readout is unchanged.
 */
export function snowAveragedSupportClause(
  summary: SnowAveragedSupportSummary
): string | null {
  if (
    summary.status === "unreported" ||
    summary.status === "unclassifiable" ||
    summary.status === "fully-drawn"
  ) {
    return null;
  }

  const place = footprintLabel(summary.footprint);

  if (summary.status === "no-charted-month") {
    // Snow-free ground empties this record exactly as a failed retrieval does,
    // and over most of the globe it is the ordinary reason. The panel would
    // otherwise report it as "no data", so name both readings and pick
    // neither.
    return `no month charted a drawn snow mean over the ${place} — ${UNDRAWN_MECHANISM}, so a ${place} that was snow-free all record reads the same as one that was never observed`;
  }

  return (
    `snow drawn over ${describeShareRange(summary)} of the ${place} — ` +
    `${UNDRAWN_MECHANISM}; each monthly mean covers only its drawn pixels, ` +
    `and the undrawn share is largest through the melt season, so the charted ` +
    `swing is damped rather than offset`
  );
}

/**
 * The clause for an averaged probe, or null when it does not apply. Gated to
 * the snow layer: this module reasons about the MOD10CM colormap's transparent
 * percent-0 band, and the same shares mean something different for a layer
 * drawn over its whole domain. A point probe passes no shares and stays silent.
 */
export function snowAveragedSupportNote(
  layerId: LayerId | null | undefined,
  footprint: SnowAveragedFootprint,
  values: readonly (number | null | undefined)[] | null | undefined,
  validFractions: readonly (number | null | undefined)[] | null | undefined
): string | null {
  if (layerId !== "snow") return null;
  return snowAveragedSupportClause(
    summarizeSnowAveragedSupport(footprint, values, validFractions)
  );
}

function footprintLabel(footprint: SnowAveragedFootprint): string {
  return footprint === "drawn-region" ? "drawn region" : "sampled area";
}

/**
 * The span of drawn shares, collapsed to a single share when both ends print
 * the same text. Rounding makes that ordinary: a footprint whose months ran
 * 0.990 to 0.994 is not usefully described as "99%–99%", and comparing the
 * rendered ends rather than the raw fractions keeps the clause from announcing
 * a range it cannot show.
 */
function describeShareRange(summary: SnowAveragedSupportSummary): string {
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
 * each mean covers only its drawn pixels and that the undrawn share grows
 * through the melt season. `summarizeSnowAveragedSupport` already refuses to
 * call anything but an exact 1 fully drawn for this reason; rounding the same
 * share up to "100%" here gave that refusal nothing to show. A large footprint
 * makes it ordinary rather than rare — a drawn region samples up to 28x28
 * (lib/probe.ts `regionGridSize`), so one undrawn pixel among 784 rounds to
 * 100%.
 *
 * This layer carries the sharpest version of the contradiction, because its
 * two ends are not interchangeable. The minimum is the meltiest charted month
 * and the maximum the fullest, which is why the clause reasons about a damped
 * swing at all. A rounded "100%" in the minimum position therefore asserts that
 * even the least-covered month drew snow on every pixel of the footprint —
 * perennial complete cover, a far stronger claim about the ground than one
 * undrawn pixel in 784 supports, and one the same sentence then contradicts.
 *
 * Only an exact 1 prints "100%", matching vegetationAveragedSupport.ts and
 * gldasAveragedSupport.ts, which format the same share for the same sampler.
 */
function formatDrawnShare(fraction: number): string {
  const percent = Math.round(fraction * 100);
  if (percent === 0 && fraction > 0) return "<1%";
  if (percent === 100 && fraction < 1) return ">99%";
  return `${percent}%`;
}
