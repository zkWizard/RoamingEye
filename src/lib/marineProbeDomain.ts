import { LAYERS, type DatasetRef, type LayerId } from "./timeline";

/**
 * Why a sea-surface-temperature probe came back empty: the cited product's
 * spatial *domain of definition*.
 *
 * When the point probe finds no usable value in any sampled month, the panel's
 * only explanation is "No data at this point for this layer." For SST that
 * sentence reports a domain boundary as a retrieval failure. The rendered
 * product (`MODIS_Aqua_L3_SST_Thermal_9km_Day_Monthly`) is an ocean L3 field:
 * land is masked out of the retrieval, so an inland point carries no value by
 * construction, exactly as GLDAS carries none over open water. Probing a city
 * with the SST layer selected is an ordinary thing for a user to do, and today
 * it dead-ends in a sentence that reads like the app failed.
 *
 * Where this differs from the land-only products — and why the wording cannot
 * simply mirror `atmosphereProbeDomain.ts`:
 *
 *  - A GLDAS field is defined on every land cell it covers, so an empty land
 *    record is genuinely surprising and an empty ocean record is fully
 *    explained by the domain.
 *  - SST is *not* defined on every ocean cell of a given month. A monthly
 *    thermal-IR composite is built from cloud-free daytime retrievals, so sea
 *    ice, persistent cloud, and missing swaths leave gaps over water too. An
 *    empty record over the ocean is unremarkable at high latitudes.
 *
 * So the domain statement here is deliberately two-sided: it says what the
 * product covers, and then says that an absence does NOT locate the point. The
 * note never claims the user clicked on land — that would be inferring a
 * surface class from a missing value, which is precisely what
 * `lib/sstNoData.ts` warns against ("a rejected pixel means this product
 * reports no SST for that pixel — not that this location is land, and not that
 * the water is cold").
 *
 * How the emptiness itself arises is already measured in `lib/sstNoData.ts`:
 * GIBS serves SST as JPEG, so masked pixels arrive as black, and black sits
 * 53.0 RGB units from the ramp's coldest retained colour. That is inside the
 * app-wide `NO_DATA_DISTANCE` of 60, which is why the SST layer carries its own
 * tightened rejection threshold. The sampler is behaving correctly; only the
 * sentence explaining the result is wrong.
 *
 * Scope and honesty limits:
 *  - Domain of definition is a fixed, documented property of the cited product,
 *    asserted for one layer below. It is never inferred from a value.
 *  - Only the SST layer is classified here. Every other layer returns null, so
 *    this module never speaks for a discipline that does not own it — the three
 *    atmosphere layers are `atmosphereProbeDomain.ts`, and the environment
 *    brief's four signals are `signalDomain.ts`.
 *  - The shared `SpatialDomain` vocabulary is deliberately NOT extended with an
 *    "ocean-only" member. That union is consumed by two other specialists'
 *    modules whose exhaustive branches would each need a case for a domain
 *    neither of them can encounter; a local constant is the smaller change.
 *  - Nothing here describes marine organisms, habitat, abundance, ecosystem
 *    condition, marine heatwaves, causes, or future ocean conditions.
 */

/** The layer whose domain of definition this module asserts. */
const MARINE_PROBE_LAYER_ID = "sst" satisfies LayerId;

/**
 * Why the product carries no value outside its domain — a property of the
 * retrieval, not of any sampled pixel.
 */
const OCEAN_DOMAIN_BASIS =
  "the MODIS/Aqua L3 SST retrieval masks land, so an inland pixel carries no value by construction";

/**
 * The reasons an *in-domain* point still comes back empty. Stated so an absence
 * is never read as proof that the point was over land.
 */
const IN_DOMAIN_GAP_CAUSES =
  "sea ice, persistent cloud, and missing swaths also empty a record over open water";

/** True when no sampled month yielded a usable value. */
function isEmptySeries(values: readonly (number | null)[]): boolean {
  return !values.some((value) => value !== null && Number.isFinite(value));
}

/**
 * True when the layer's product is defined over the ocean surface only. Asserted
 * per layer, never guessed from a value; false for every unclassified layer
 * rather than throwing, so a caller may ask about any layer.
 */
export function isOceanOnlyLayer(layerId: LayerId | undefined): boolean {
  return layerId === MARINE_PROBE_LAYER_ID;
}

/**
 * Explain an empty sea-surface-temperature probe record in terms of the cited
 * product's ocean domain, or null when this module classifies neither the layer
 * nor the situation.
 *
 * Returns null unless the layer is SST AND the series really holds no usable
 * value — so the note can never be attached to a record that did return data,
 * whatever a caller passes.
 *
 * `existingAbsenceNote` is whatever sentence another module has already produced
 * for this same empty record; when one exists this module stays silent rather
 * than explaining the absence twice. In practice that is the averaged-footprint
 * clause from `lib/marineAveragedSstSupport.ts`, which reports the sampled share
 * of a drawn region or area box and already names the ocean domain in its
 * no-usable-sample wording. The point probe supplies no share, produces no such
 * clause, and is the case this module exists to cover.
 */
export function emptyMarineProbeNote(
  layerId: LayerId | undefined,
  values: readonly (number | null)[],
  existingAbsenceNote?: string | null
): string | null {
  if (!isOceanOnlyLayer(layerId)) return null;
  if (!isEmptySeries(values)) return null;
  if (existingAbsenceNote) return null;

  const layer = LAYERS[MARINE_PROBE_LAYER_ID];
  // Same statement shape as atmosphereProbeDomain.ts, so the two read as one
  // voice: what the product covers, what this record does and does not imply,
  // then the citation.
  return (
    `${layer.label}: defined over the ocean surface only — ${OCEAN_DOMAIN_BASIS}. ` +
    `An empty record here is consistent with a point outside that domain, but ` +
    `${IN_DOMAIN_GAP_CAUSES} — an absence does not by itself say which. ` +
    `Source ${sourceLabel(layer.dataset)}.`
  );
}

function sourceLabel(dataset: DatasetRef | undefined): string {
  return dataset
    ? `${dataset.shortName} v${dataset.version}`
    : "no cited dataset";
}
