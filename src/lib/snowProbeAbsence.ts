import { LAYERS, type DatasetRef, type LayerId } from "./timeline";

/**
 * Why a snow-cover probe came back empty — for the one mode that still reports
 * it as a failure.
 *
 * When no sampled month yields a usable value the panel falls back to "No data
 * at this point for this layer." For snow that sentence is wrong in both
 * directions at once, because of how the layer is *rendered* rather than how it
 * is retrieved. GIBS draws `MODIS_Terra_L3_Snow_Cover_Monthly_Average_Pct` with
 * the discrete `MODIS_NDSI_Snow_Cover` colormap, and that document marks
 * percent 0 transparent (see snowCoverRamp.ts): snow-free ground is simply not
 * drawn. The second, `classification` legend holds eight non-measurement
 * classes — Missing Data, No Decision, Night, Inland Water, Ocean, Cloud,
 * Detector Saturated, Fill — which are opaque but are not snow percentages, and
 * the production inversion rejects every one of them (measured: the nearest,
 * "No Decision" grey, sits 67.1 RGB units from the legend gradient, outside the
 * 60-unit `NO_DATA_DISTANCE`; `MEASURED_SNOW_COVER_INVERSION.decodedFlags` is
 * asserted empty in CI).
 *
 * So an all-empty snow record has two ordinary readings that the rendered tile
 * cannot separate: a point that carried no snow in any sampled month, and a
 * point whose observations were all flagged. Over most of the globe the first
 * is the common one, which is exactly why "no data" reads as a bug report for
 * an entirely normal result — and why the opposite error must be refused too:
 * an empty record is not a measured 0 %, because an unobserved pixel could have
 * held any cover at all.
 *
 * Why this module exists rather than another clause in snowAveragedSupport.ts:
 * that module reasons about the *drawn share* of an averaged footprint, so it
 * needs `validFractions`. Area and drawn-region probes supply them and already
 * get its `no-charted-month` clause. A point probe charts a median of one pixel
 * block, supplies no shares at all, and therefore fell through to the generic
 * sentence. This module covers precisely that hole, and defers whenever the
 * share-based clause already spoke — the same composition
 * `marineProbeDomain.ts` uses against `marineAveragedSstSupport.ts`.
 *
 * Scope and honesty limits:
 *  - The transparent percent-0 band is a fixed, documented property of the
 *    cited colormap, not something inferred from a sampled value.
 *  - The note never states which reading applies, never reports a corrected or
 *    substituted value, and never says the point is snow-free, cloudy, dark, or
 *    over water. It says the record cannot tell them apart.
 *  - Only the snow layer is classified; every other layer returns null, so this
 *    module never speaks for a discipline that does not own it — the three
 *    atmosphere layers are `atmosphereProbeDomain.ts` and SST is
 *    `marineProbeDomain.ts`.
 *  - Nothing here claims snow depth, snow-water equivalent, melt or
 *    accumulation rate, runoff, cause, or forecast.
 *
 * Pure, render-free logic (see snowProbeAbsence.test.ts).
 */

/** The layer whose rendering this module reasons about. */
const SNOW_PROBE_LAYER_ID = "snow" satisfies LayerId;

/**
 * Why the rendered tile carries nothing for snow-free ground — a property of
 * the colormap, never of a sampled pixel.
 */
const UNDRAWN_ZERO_BASIS =
  "GIBS renders percent 0 transparent in MODIS_NDSI_Snow_Cover, so snow-free ground is never drawn";

/**
 * The other way an in-domain point empties, stated so the absence is never read
 * as a measured zero.
 */
const FLAGGED_OBSERVATION_CAUSE =
  "cloud, polar night, inland water and ocean are drawn as observation flags the probe rejects rather than decodes";

/** True when no sampled month yielded a usable value. */
function isEmptySeries(values: readonly (number | null)[]): boolean {
  return !values.some((value) => value !== null && Number.isFinite(value));
}

/**
 * True when the layer is the one rendered with a transparent zero band.
 * Asserted per layer, never guessed from a value; false for every unclassified
 * layer rather than throwing, so a caller may ask about any layer.
 */
export function isUndrawnZeroLayer(layerId: LayerId | undefined): boolean {
  return layerId === SNOW_PROBE_LAYER_ID;
}

/**
 * Explain an empty snow-cover probe record in terms of the cited colormap's
 * transparent zero band, or null when this module classifies neither the layer
 * nor the situation.
 *
 * Returns null unless the layer is snow AND the series really holds no usable
 * value — so the note can never be attached to a record that did return data,
 * whatever a caller passes.
 *
 * `existingAbsenceNote` is whatever sentence another module has already
 * produced for this same empty record; when one exists this module stays silent
 * rather than explaining the absence twice. In practice that is the
 * averaged-footprint clause from `lib/snowAveragedSupport.ts`, which reports the
 * drawn share of a drawn region or area box and already names this mechanism in
 * its no-charted-month wording. The point probe supplies no share, produces no
 * such clause, and is the case this module exists to cover.
 */
export function emptySnowProbeNote(
  layerId: LayerId | undefined,
  values: readonly (number | null)[],
  existingAbsenceNote?: string | null
): string | null {
  if (!isUndrawnZeroLayer(layerId)) return null;
  if (!isEmptySeries(values)) return null;
  if (existingAbsenceNote) return null;

  const layer = LAYERS[SNOW_PROBE_LAYER_ID];
  // Same statement shape as atmosphereProbeDomain.ts and marineProbeDomain.ts,
  // so the three read as one voice: what the rendering does, what this record
  // does and does not imply, then the citation.
  return (
    `${layer.label}: no sampled month drew snow at this point — ${UNDRAWN_ZERO_BASIS}, and ` +
    `${FLAGGED_OBSERVATION_CAUSE}. Ground that was snow-free and ground that was never ` +
    `observed are therefore indistinguishable here, so this record is neither a reading of ` +
    `0 % nor evidence of a failed retrieval. Source ${sourceLabel(layer.dataset)}.`
  );
}

function sourceLabel(dataset: DatasetRef | undefined): string {
  return dataset
    ? `${dataset.shortName} v${dataset.version}`
    : "no cited dataset";
}
