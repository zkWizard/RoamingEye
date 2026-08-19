import { LAYERS, type DatasetRef, type LayerId } from "./timeline";
import {
  LST_OBSERVING_CONSTRAINTS,
  type LstObservingConstraint,
  type LstObservingConstraintId,
} from "./lstObservingConstraints";

/**
 * Why a land-surface-temperature probe came back empty: the cited product's
 * spatial *domain of definition*, and the in-domain gap that empties a record
 * over land anyway.
 *
 * When the point probe finds no usable value in any sampled month the panel
 * falls back to "No data at this point for this layer." Five sibling modules
 * exist because that sentence is wrong for a product whose domain excludes the
 * probed point — `marineProbeDomain` (ocean-only), `atmosphereProbeDomain`,
 * `soilProbeDomain`, `snowProbeAbsence`, `vegetationProbeAbsence`. LST is the
 * sixth probeable family and was the last one still reporting a documented
 * domain boundary as a retrieval failure: `probeAbsenceStatus.ts` names the
 * other five and this layer reaches none of them, so probing open water with
 * the LST layer selected dead-ends in a sentence that reads like the app broke.
 *
 * Why the wording cannot simply mirror the land-only atmosphere products:
 *
 *  - A GLDAS field is defined on every land cell it covers, so its note may
 *    treat the domain as the whole story and spend its second reading on the
 *    ramp's dropped top bin.
 *  - MOD11C3 is *not* defined on every land cell of a given month. It is a
 *    thermal-infrared retrieval composited from cloud-screened days only, so a
 *    month that never cleared leaves a land pixel empty. That makes this note
 *    two-sided in the same way `marineProbeDomain`'s is, and for the mirror
 *    reason: SST has gaps inside the ocean, LST has gaps inside the land.
 *
 * The ramp caps are deliberately NOT offered as a third reading. The MERRA-2
 * air-temperature note may cite its caps because those sit far enough off-ramp
 * to be rejected, which empties a record; LST's two catch-all swatches sit 3–4
 * RGB units from their adjacent finite bins, so a capped pixel decodes into the
 * terminal bin and prints as a number instead (see `probeLstExtremeCensoring`,
 * which is the module that speaks for that case). Citing them here would name a
 * cause this ramp cannot produce.
 *
 * Scope and honesty limits:
 *  - Domain of definition is a fixed, documented property of the cited product,
 *    asserted for one layer below. It is never inferred from a value, and every
 *    other layer returns null rather than a plausible note.
 *  - The note never claims the user clicked on water. An absence does not
 *    locate the point, exactly as the marine sibling refuses to say the point
 *    was land.
 *  - The refusal it does carry is an *interval-scale* one: LST is a
 *    temperature, so the misreading to head off is "cold", not "zero". The
 *    land-only GLDAS notes refuse a zero reading because a rate is a ratio
 *    quantity; that wording is not transferable here and is not used.
 *  - Nothing here describes weather, heat hazard, health, comfort, urban
 *    heat-island attribution, causation, or any future value.
 */

/** The layer whose domain of definition this module asserts. */
const LST_PROBE_LAYER_ID = "lst" satisfies LayerId;

/**
 * Why the product carries no value outside its domain — a property of the
 * retrieval, not of any sampled pixel.
 */
const LAND_DOMAIN_BASIS =
  "the MODIS/Terra LST retrieval is produced for land pixels, so open water carries no value by construction";

/**
 * The one in-domain gap this note must state. Held as an id and looked up in
 * the constraint table rather than restated, so the sentence a reader sees and
 * the committed observing-system fact cannot drift apart.
 */
const IN_DOMAIN_GAP_ID: LstObservingConstraintId = "clear-sky-retrieval-only";

/**
 * The clear-sky gate from the constraint table, or undefined if it is ever
 * removed from there.
 *
 * Exported for the unit test, which asserts it is present: without it the note
 * would have to drop its second reading and become a one-sided claim that an
 * absence locates the point off land. Degrading to no note at all is the honest
 * failure — the bare line is merely uninformative, whereas a one-sided note
 * would be wrong.
 */
export function lstInDomainGapConstraint(): LstObservingConstraint | undefined {
  return LST_OBSERVING_CONSTRAINTS.find(
    (entry) => entry.id === IN_DOMAIN_GAP_ID
  );
}

/**
 * True when the layer's product is defined over the land surface only.
 * Asserted per layer, never guessed from a value; false for every other layer
 * rather than throwing, so a caller may ask about any layer.
 *
 * Scoped to this module's one layer on purpose. The other land-only products
 * are classified by their own discipline's module, and a shared predicate here
 * would quietly become a second source of truth for theirs.
 */
export function isLandSurfaceTemperatureLayer(
  layerId: LayerId | undefined
): boolean {
  return layerId === LST_PROBE_LAYER_ID;
}

/** True when no sampled month yielded a usable value. */
function isEmptySeries(values: readonly (number | null)[]): boolean {
  return !values.some((value) => value !== null && Number.isFinite(value));
}

/**
 * Explain an empty land-surface-temperature probe record in terms of the cited
 * product's land domain, or null when this module classifies neither the layer
 * nor the situation.
 *
 * Returns null unless the layer is LST AND the series really holds no usable
 * value — so the note can never be attached to a record that did return data,
 * whatever a caller passes.
 */
export function emptyLstProbeNote(
  layerId: LayerId | undefined,
  values: readonly (number | null)[]
): string | null {
  if (!isLandSurfaceTemperatureLayer(layerId)) return null;
  if (!isEmptySeries(values)) return null;

  const gate = lstInDomainGapConstraint();
  if (!gate) return null;

  const layer = LAYERS[LST_PROBE_LAYER_ID];
  // Same statement shape as marineProbeDomain.ts and atmosphereProbeDomain.ts,
  // so the six read as one voice: what the product covers, what this record
  // does and does not imply, then the citation.
  return (
    `${layer.label}: defined over land surfaces only — ${LAND_DOMAIN_BASIS}. ` +
    `An empty record here is consistent with a point outside that domain. But the product is ` +
    `${gate.constraint}: a month with no cloud-free day empties a land record too, and an ` +
    `absence does not by itself say which. It is not a cold reading, and not evidence of a ` +
    `failed retrieval. Source ${sourceLabel(layer.dataset)}.`
  );
}

function sourceLabel(dataset: DatasetRef | undefined): string {
  return dataset
    ? `${dataset.shortName} v${dataset.version}`
    : "no cited dataset";
}
