import type { LayerId } from "./timeline";
import type { RenderedVegetationIndexId } from "./vegetationIndexRenderedRange";

/**
 * What share of an averaged footprint a charted vegetation-index mean actually
 * covered — and which way the rest pulls it.
 *
 * GIBS marks every value below the ramp's start transparent in both
 * MODIS_L3_NDVI and MODIS_L3_EVI (the fill band plus both negative bands; see
 * vegetationIndexRenderedRange.ts). Those pixels arrive as JPEG black, sit 113
 * and 97 RGB units from the display ramps the probe inverts with, and are
 * therefore rejected rather than decoded — so they lower `validFraction` and
 * never enter the weighted mean at all.
 *
 * The consequence is directional and must be stated. The excluded pixels are
 * not a random sample of the footprint: open water, snow and ice, cloud, and
 * negative-index barren ground are exactly the surfaces whose index falls
 * below the drawn ramp, so the surviving mean is biased high relative to a mean
 * over the whole footprint, by an amount the rendered tile cannot recover.
 *
 * A time series makes this worse than a single card faces. The undrawn share
 * moves with the season — a mid-latitude box loses its snow-covered pixels in
 * winter and keeps them in summer — so the excluded fraction is largest exactly
 * when greenness is lowest. The charted seasonal swing is therefore damped
 * against the swing over the whole footprint, not merely offset from it. The
 * place panel already discloses this for a single month
 * (vegetationDrawnCoverage.ts) and the SST probe already discloses its own
 * analogous exclusion (marineAveragedSstSupport.ts); the vegetation series
 * surface reported a bare mean.
 *
 * Shares are read only from months that actually charted a value. A month whose
 * composite failed to load also records a zero share, and a month below
 * `weightedMeanValid`'s quarter-area floor charts nothing at all — pairing the
 * share with the plotted value keeps a transport failure from being reported as
 * an undrawn surface.
 *
 * Nothing here interprets the index. An undrawn pixel means the product drew no
 * vegetation index there — not that the surface is bare, not that it is water,
 * and not that greenness is low. The clause names which surfaces produce a
 * below-ramp index without identifying the surface at any particular pixel, and
 * claims no cover, biomass, condition, cause, or forecast. Pure, render-free
 * logic (see vegetationAveragedSupport.test.ts).
 */

/** Which averaged footprint the shares describe. A point probe has none. */
export type VegetationAveragedFootprint = "drawn-region" | "sampled-area";

export type VegetationAveragedSupportStatus =
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

export interface VegetationAveragedSupportSummary {
  index: RenderedVegetationIndexId;
  footprint: VegetationAveragedFootprint;
  status: VegetationAveragedSupportStatus;
  /** Months that plotted a mean. */
  chartedMonths: number;
  /** Charted months that also carried a share in [0, 1]. */
  classifiedMonths: number;
  /** Range of drawn share across the classified months. */
  minFraction: number | null;
  maxFraction: number | null;
}

/**
 * Classify the drawn shares behind a charted vegetation-index series.
 *
 * Only an exact 1 counts as fully drawn: a footprint at 0.999 still excluded
 * pixels and still needs the caveat. `formatDrawnShare` holds up its end by
 * printing that share as ">99%", so the clause never rounds the excluded
 * pixels away. A share outside [0, 1] is not a share and is skipped rather
 * than silently treated as complete.
 */
export function summarizeVegetationAveragedSupport(
  index: RenderedVegetationIndexId,
  footprint: VegetationAveragedFootprint,
  values: readonly (number | null | undefined)[] | null | undefined,
  validFractions: readonly (number | null | undefined)[] | null | undefined
): VegetationAveragedSupportSummary {
  const shared = {
    index,
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
    index,
    footprint,
    status: minFraction === 1 ? "fully-drawn" : "partly-drawn",
    chartedMonths,
    classifiedMonths,
    minFraction,
    maxFraction,
  };
}

/**
 * The mechanism, stated once. It names which surfaces fall below the drawn ramp
 * without claiming any particular pixel is one of them.
 */
const UNDRAWN_MECHANISM =
  "GIBS draws no colour below the ramp start, so open water, snow, ice and " +
  "cloud are left undrawn rather than low";

/**
 * One status-line clause, or null when there is nothing worth saying.
 *
 * Silent on a fully drawn footprint, whose mean really does cover it and where
 * the clause would describe an exclusion that did not happen; silent when no
 * shares were supplied or none was usable, so an ordinary readout is unchanged.
 */
export function vegetationAveragedSupportClause(
  summary: VegetationAveragedSupportSummary
): string | null {
  if (
    summary.status === "unreported" ||
    summary.status === "unclassifiable" ||
    summary.status === "fully-drawn"
  ) {
    return null;
  }

  const label = summary.index.toUpperCase();
  const place = footprintLabel(summary.footprint);

  if (summary.status === "no-charted-month") {
    // A missing composite empties a record too, so name the mechanism without
    // claiming it caused this one.
    return `no month charted a drawn ${label} mean over the ${place} — ${UNDRAWN_MECHANISM}, and a missing monthly composite reads the same way`;
  }

  return (
    `${label} drawn over ${describeShareRange(summary)} of the ${place} — ` +
    `${UNDRAWN_MECHANISM}; each monthly mean covers only its drawn pixels and ` +
    `reads high against a mean over the whole ${place}`
  );
}

/**
 * The clause for an averaged probe, or null when it does not apply. Only the
 * two rendered vegetation-index layers are described here: this module reasons
 * about the MOD13A3 colormaps' transparent bands, and the same shares mean
 * something different for a layer drawn over its whole domain. A point probe
 * passes no shares and stays silent.
 */
export function vegetationAveragedSupportNote(
  layerId: LayerId | null | undefined,
  footprint: VegetationAveragedFootprint,
  values: readonly (number | null | undefined)[] | null | undefined,
  validFractions: readonly (number | null | undefined)[] | null | undefined
): string | null {
  const index = renderedVegetationIndexId(layerId);
  if (!index) return null;
  return vegetationAveragedSupportClause(
    summarizeVegetationAveragedSupport(index, footprint, values, validFractions)
  );
}

function renderedVegetationIndexId(
  layerId: LayerId | null | undefined
): RenderedVegetationIndexId | null {
  return layerId === "ndvi" || layerId === "evi" ? layerId : null;
}

function footprintLabel(footprint: VegetationAveragedFootprint): string {
  return footprint === "drawn-region" ? "drawn region" : "sampled area";
}

/**
 * The span of drawn shares, collapsed to a single share when both ends print
 * the same text. Rounding makes that ordinary: a footprint whose months ran
 * 0.990 to 0.994 is not usefully described as "99%–99%", and comparing the
 * rendered ends rather than the raw fractions keeps the clause from announcing
 * a range it cannot show.
 */
function describeShareRange(summary: VegetationAveragedSupportSummary): string {
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
 * the mean covers only its drawn pixels and reads high against the whole
 * footprint. `summarizeVegetationAveragedSupport` already refuses to call
 * anything but an exact 1 fully drawn for this reason; rounding the same share
 * up to "100%" here gave that refusal nothing to show. A large footprint makes
 * it ordinary rather than rare — the sampling grid runs up to 28x28, so one
 * undrawn pixel among ~780 rounds to 100%. Only an exact 1 prints "100%",
 * matching landCoverCompositionReading.ts, landCoverHumanUse.ts and
 * vegetationIndexLandCoverSupport.ts, which format shares in the same status
 * line.
 */
function formatDrawnShare(fraction: number): string {
  const percent = Math.round(fraction * 100);
  if (percent === 0 && fraction > 0) return "<1%";
  if (percent === 100 && fraction < 1) return ">99%";
  return `${percent}%`;
}
