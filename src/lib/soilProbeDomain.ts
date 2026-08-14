import { LAYERS, type DatasetRef, type LayerId } from "./timeline";
import { GLDAS_RAMP_SATURATION } from "./gldasRampSaturation";

/**
 * Why a soil-moisture probe came back empty — the last GLDAS layer still
 * reporting an ordinary result as a failure.
 *
 * When no sampled month yields a usable value the panel falls back to "No data
 * at this point for this layer." Soil moisture is rendered from
 * `GLDAS_NOAH025_M` v2.1, the same product as precipitation, yet
 * `atmosphereProbeDomain.ts` classifies precipitation and deliberately declines
 * soil moisture — its scope note records the layer as one that "shares
 * precipitation's product and land-only domain but belongs to another
 * specialist's modules". That left the two sibling fields of one model
 * explaining an empty record differently: precipitation names its domain, soil
 * moisture says the app failed.
 *
 * The two ordinary readings an empty soil record cannot separate, and why they
 * matter more here than for precipitation:
 *
 *  - **Outside the land domain.** The GLDAS Noah land-surface model is solved on
 *    land cells only, so open water carries no value by construction. GIBS
 *    serves the composite with nothing drawn there; measured against the legend
 *    ramp the point probe actually inverts against, an undrawn (black) pixel
 *    sits 235.5 RGB units from the nearest ramp colour, far outside the 60-unit
 *    `NO_DATA_DISTANCE`, so it is rejected exactly as it should be.
 *  - **At or above the ramp ceiling.** GIBS publishes the soil ramp with an
 *    open-ended `≥ 50.0` kg/m² top bin. `parseColormapEntries` retains only the
 *    finite "lo – hi" swatches and drops that cap by documented design (see
 *    gldasRampSaturation.ts), and the cap colour rgb(94,79,162) sits 76.9 units
 *    from the nearest legend colour — also outside 60. So a cell that stayed at
 *    or above 50 kg/m² in every sampled month inverts to `null` too. Over the
 *    0-10 cm layer GIBS's `ows:Title` names, 50 kg/m² is ≈ 0.50 m³/m³
 *    volumetric, at or above the porosity of most mineral soils, so this is the
 *    near-saturated, organic, or ponded end of the scale.
 *
 * Those two readings point in *opposite* directions — no land at all, or the
 * wettest ground the ramp can represent — which is why the sentence must refuse
 * the dry reading explicitly. "No data" invites exactly the wrong inference: a
 * reader who sees an empty water-cycle record and a legend running "dry" to
 * "saturated" will read absence as dryness, and for one of the two readings the
 * truth is the opposite extreme.
 *
 * Both distances are re-derived from `LEGENDS.soil` and `GLDAS_RAMP_SATURATION`
 * in soilProbeDomain.test.ts rather than trusted as prose, so the note cannot
 * outlive the ramp or the threshold it describes.
 *
 * Scope and honesty limits:
 *  - Domain of definition and the published ceiling are fixed, documented
 *    properties of the cited product and its colormap. Neither is inferred from
 *    a sampled value.
 *  - The note never states which reading applies. It never says the point is
 *    over water, saturated, ponded, or dry, and it never reports a corrected or
 *    substituted value — an empty record cannot locate the point.
 *  - Only the soil layer is classified; every other layer returns null, so this
 *    module never speaks for a discipline that does not own it — precipitation,
 *    air temperature and aerosol are `atmosphereProbeDomain.ts`, SST is
 *    `marineProbeDomain.ts`, snow is `snowProbeAbsence.ts`.
 *  - The quantity is the 0-10 cm surface layer, not the root zone
 *    (see LAYERS.soil.description).
 *  - Nothing here claims drought or flood state, recharge, runoff,
 *    water-balance closure, cause, or any future value.
 *
 * Pure, render-free logic (see soilProbeDomain.test.ts).
 */

/** The layer whose domain and ramp ceiling this module reasons about. */
const SOIL_PROBE_LAYER_ID = "soil" satisfies LayerId;

/**
 * Why the product carries no value off land — a property of the model, not of
 * any sampled pixel.
 */
const LAND_DOMAIN_BASIS =
  "the GLDAS Noah land-surface model is solved on land cells only, so open water carries no value by construction";

/** True when no sampled month yielded a usable value. */
function isEmptySeries(values: readonly (number | null)[]): boolean {
  return !values.some((value) => value !== null && Number.isFinite(value));
}

/**
 * True when the layer is the GLDAS soil-moisture field this module classifies.
 * Asserted per layer, never guessed from a value; false for every unclassified
 * layer rather than throwing, so a caller may ask about any layer.
 */
export function isSoilProbeLayer(layerId: LayerId | undefined): boolean {
  return layerId === SOIL_PROBE_LAYER_ID;
}

/**
 * Explain an empty soil-moisture probe record in terms of the cited product's
 * land domain and its published ramp ceiling, or null when this module
 * classifies neither the layer nor the situation.
 *
 * Returns null unless the layer is soil AND the series really holds no usable
 * value — so the note can never be attached to a record that did return data,
 * whatever a caller passes.
 *
 * Takes no `existingAbsenceNote` deferral, unlike `marineProbeDomain.ts` and
 * `snowProbeAbsence.ts`: those defer to an averaged-footprint clause that
 * already names their mechanism, and no such clause exists for a GLDAS layer in
 * any probe mode. `emptyAtmosphereProbeNote` — this module's sibling on the same
 * product — takes the same two arguments for the same reason.
 */
export function emptySoilProbeNote(
  layerId: LayerId | undefined,
  values: readonly (number | null)[]
): string | null {
  if (!isSoilProbeLayer(layerId)) return null;
  if (!isEmptySeries(values)) return null;

  const layer = LAYERS[SOIL_PROBE_LAYER_ID];
  const { ceiling, reportedUnit } = GLDAS_RAMP_SATURATION[SOIL_PROBE_LAYER_ID];
  // Same statement shape as the three sibling modules, so the four read as one
  // voice: what the product and its ramp do, what this record does and does not
  // imply, then the citation.
  return (
    `${layer.label}: no sampled month decoded at this point — ${LAND_DOMAIN_BASIS}, ` +
    `and the ramp's open-ended "${ceiling.publishedLabel}" ${reportedUnit} top bin is ` +
    `discarded by the same inversion, so near-saturated ground empties a record too. ` +
    `An absence here is consistent with a point outside the land domain or with ground ` +
    `at or above that bound — it is not a reading of dry soil, and not evidence of a ` +
    `failed retrieval. Source ${sourceLabel(layer.dataset)}.`
  );
}

function sourceLabel(dataset: DatasetRef | undefined): string {
  return dataset
    ? `${dataset.shortName} v${dataset.version}`
    : "no cited dataset";
}
