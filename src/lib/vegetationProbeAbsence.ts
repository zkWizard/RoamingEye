import { LAYERS, type DatasetRef, type LayerId } from "./timeline";
import {
  RENDERED_VEGETATION_INDEX_RANGE,
  type RenderedVegetationIndexId,
} from "./vegetationIndexRenderedRange";

/**
 * Why a vegetation-index probe came back empty — for the one mode that still
 * reports it as a failure.
 *
 * When no sampled month yields a usable value the panel falls back to "No data
 * at this point for this layer." For NDVI and EVI that sentence is wrong in
 * both directions at once, because of how the layers are *rendered* rather than
 * how they are retrieved. GIBS marks every value below the ramp's start
 * transparent in both MODIS_L3_NDVI and MODIS_L3_EVI — the product fill band
 * plus the two bands covering the negative range (see
 * vegetationIndexRenderedRange.ts) — so the drawn ramp begins just above zero
 * and nothing below it carries colour. The app fetches these composites as
 * JPEG, a format with no alpha channel, so an undrawn pixel arrives as black;
 * black sits 113 and 97 RGB units from the display ramps the probe inverts
 * with, well outside the 60-unit no-data distance, and is therefore rejected
 * rather than decoded (see vegetationIndexNoData.ts for the separate
 * authoritative-colormap path, where NDVI needs a tighter threshold and EVI has
 * none).
 *
 * So an all-empty vegetation record has two ordinary readings that the rendered
 * tile cannot separate: a point whose index fell below the drawn ramp in every
 * sampled month, and a point whose monthly composites never arrived. Open
 * water, snow and ice, cloud, and negative-index barren ground are exactly the
 * surfaces that produce a below-ramp index, and over those the first reading is
 * the common one — which is why "no data" reads as a bug report for an entirely
 * normal result. The opposite error must be refused just as firmly: an empty
 * record is not a measured zero, because MOD13A3 reports negative values the
 * rendering never draws, and an unobserved month holds no value at all.
 *
 * Why this module exists rather than another clause in
 * vegetationAveragedSupport.ts: that module reasons about the *drawn share* of
 * an averaged footprint, so it needs `validFractions`. Area and drawn-region
 * probes supply them and already get its `no-charted-month` clause. A point
 * probe charts a median of one pixel block, supplies no shares at all, and
 * therefore fell through to the generic sentence. This module covers precisely
 * that hole, and defers whenever the share-based clause already spoke — the
 * same composition `marineProbeDomain.ts` uses against
 * `marineAveragedSstSupport.ts` and `snowProbeAbsence.ts` against
 * `snowAveragedSupport.ts`.
 *
 * Scope and honesty limits:
 *  - The transparent bands are a fixed, documented property of the cited
 *    colormaps, not something inferred from a sampled value. The ramp start is
 *    read from the measured range rather than written out, so the sentence
 *    cannot drift from the colormap.
 *  - Naming water, snow, ice, cloud and negative-index barren ground states
 *    which surfaces produce a below-ramp index. It does not identify the
 *    surface at this or any particular pixel.
 *  - The note never states which reading applies, never reports a corrected or
 *    substituted value, and never says the point is bare, frozen, flooded, or
 *    low in greenness. It says the record cannot tell the readings apart.
 *  - Only the two rendered vegetation-index layers are classified; every other
 *    layer returns null, so this module never speaks for a discipline that does
 *    not own it — the three atmosphere layers are `atmosphereProbeDomain.ts`,
 *    SST is `marineProbeDomain.ts`, and snow is `snowProbeAbsence.ts`.
 *  - Nothing here infers vegetation cover, biomass, condition, habitat,
 *    productivity, cause, or forecast. NDVI and EVI are unitless indices.
 *
 * Pure, render-free logic (see vegetationProbeAbsence.test.ts).
 */

/** The layers whose rendering this module reasons about. */
const VEGETATION_PROBE_LAYER_IDS = [
  "ndvi",
  "evi",
] as const satisfies readonly LayerId[];

/**
 * True when the layer is one of the two rendered with transparent below-ramp
 * bands. Asserted per layer, never guessed from a value; false for every
 * unclassified layer rather than throwing, so a caller may ask about any layer.
 */
export function isUndrawnBelowRampLayer(
  layerId: LayerId | undefined
): layerId is RenderedVegetationIndexId {
  return (
    VEGETATION_PROBE_LAYER_IDS as readonly (LayerId | undefined)[]
  ).includes(layerId);
}

/** True when no sampled month yielded a usable value. */
function isEmptySeries(values: readonly (number | null)[]): boolean {
  return !values.some((value) => value !== null && Number.isFinite(value));
}

/**
 * Why the rendered tile carries nothing below the ramp — a property of the
 * colormap, never of a sampled pixel. Built from the measured range so a GIBS
 * re-render that moves the ramp start cannot leave this sentence stale.
 */
function undrawnRampBasis(index: RenderedVegetationIndexId): string {
  const range = RENDERED_VEGETATION_INDEX_RANGE[index];
  return (
    `GIBS draws no colour below ${range.renderedMinimum} in ${range.colormapDoc}, ` +
    "so open water, snow, ice, cloud and negative-index barren ground are left " +
    "undrawn rather than low"
  );
}

/**
 * The transport step that turns "undrawn" into a rejected sample, stated so the
 * absence is never read as a decoded value.
 */
const UNDRAWN_TRANSPORT_CAUSE =
  "those pixels arrive as JPEG black and are rejected rather than decoded";

/**
 * Explain an empty vegetation-index probe record in terms of the cited
 * colormaps' transparent below-ramp bands, or null when this module classifies
 * neither the layer nor the situation.
 *
 * Returns null unless the layer is NDVI or EVI AND the series really holds no
 * usable value — so the note can never be attached to a record that did return
 * data, whatever a caller passes.
 *
 * `existingAbsenceNote` is whatever sentence another module has already
 * produced for this same empty record; when one exists this module stays silent
 * rather than explaining the absence twice. In practice that is the
 * averaged-footprint clause from `lib/vegetationAveragedSupport.ts`, which
 * reports the drawn share of a drawn region or area box and already names this
 * mechanism in its no-charted-month wording. The point probe supplies no share,
 * produces no such clause, and is the case this module exists to cover.
 */
export function emptyVegetationProbeNote(
  layerId: LayerId | undefined,
  values: readonly (number | null)[],
  existingAbsenceNote?: string | null
): string | null {
  if (!isUndrawnBelowRampLayer(layerId)) return null;
  if (!isEmptySeries(values)) return null;
  if (existingAbsenceNote) return null;

  const layer = LAYERS[layerId];
  const label = layerId.toUpperCase();
  // Same statement shape as atmosphereProbeDomain.ts, marineProbeDomain.ts and
  // snowProbeAbsence.ts, so the four read as one voice: what the rendering
  // does, what this record does and does not imply, then the citation.
  return (
    `${layer.label}: no sampled month drew ${label} at this point — ` +
    `${undrawnRampBasis(layerId)}, and ${UNDRAWN_TRANSPORT_CAUSE}. A point whose ` +
    `index fell below the drawn ramp and a point whose composites never arrived ` +
    `are therefore indistinguishable here, so this record is neither a measured ` +
    `zero — the product reports negative values the rendering never draws — nor ` +
    `evidence of a failed retrieval. Source ${sourceLabel(layer.dataset)}.`
  );
}

function sourceLabel(dataset: DatasetRef | undefined): string {
  return dataset
    ? `${dataset.shortName} v${dataset.version}`
    : "no cited dataset";
}
