import { LAYERS, type DatasetRef, type LayerId } from "./timeline";
import type { SpatialDomain } from "./signalDomain";

/**
 * Why an atmospheric probe came back empty: the cited product's spatial
 * *domain of definition*.
 *
 * When the point/area probe finds no usable value in any sampled month, the
 * panel's only explanation is "No data at this point for this layer." For the
 * atmosphere layers that sentence can be actively misleading, because the three
 * products do not cover the same part of the Earth's surface:
 *
 *  - Precipitation (`GLDAS_NOAH025_M`, rendered as "Total Precipitation Rate
 *    (Monthly, Surface, Noah LSM, GLDAS)") is a field of the GLDAS Noah
 *    land-surface model. That model is solved on land cells only; there are no
 *    ocean cells, so over open water the field is undefined rather than low.
 *  - 2 m air temperature (`M2TMNXSLV`) and aerosol optical thickness
 *    (`M2TMNXAER`) are MERRA-2 global reanalysis fields, defined over land and
 *    ocean alike.
 *
 * So an all-empty precipitation record is the *expected* result of probing open
 * water, while an all-empty MERRA-2 record is not explained by the domain at
 * all. Reporting both as "no data" attributes a domain boundary to a retrieval
 * failure, and invites the opposite error too — reading an out-of-domain
 * absence as a dry month.
 *
 * How the emptiness itself arises is worth recording, because it is *correct*
 * behaviour being described wrongly. Measured against the live GIBS colormap
 * documents on 2026-08-11: all three declare their no-data fill as
 * `rgb(255,0,255)` with `transparent="true"`. The app fetches composites as
 * JPEG, which has no alpha channel, so an undrawn cell arrives as black. Black
 * sits 235.5 (precipitation), 227.8 (air temperature) and 161.6 (aerosol) RGB
 * units from the nearest published ramp colour — far outside the 60-unit
 * `NO_DATA_DISTANCE` — so every out-of-domain pixel is rejected exactly as it
 * should be. The sampler is right; only the sentence explaining it is wrong.
 *
 * Scope and honesty limits:
 *  - Domain of definition is a fixed, documented property of the cited product,
 *    asserted per layer below. It is never inferred from a value.
 *  - This helper does NOT know where the user clicked. It never states that a
 *    point is over water; it states what the product covers and leaves the
 *    reader to place their own point. The land-only wording is deliberately
 *    conditional ("consistent with"), and the land-and-ocean wording refuses to
 *    diagnose a cause it cannot see.
 *  - Only the three atmosphere layers are classified here. Other layers return
 *    null so this module never speaks for a discipline that does not own them —
 *    including GLDAS soil moisture, which shares precipitation's product and
 *    land-only domain but belongs to another specialist's modules.
 *  - It composes with, and does not replace, `signalDomain.ts`, which makes the
 *    same distinction across the environment brief's four signals. That module
 *    is keyed by brief signal; this one is keyed by rendered `LayerId`, and the
 *    shared `SpatialDomain` vocabulary is imported so the two cannot drift.
 */

/** The atmosphere layers whose domain of definition this module asserts. */
export type AtmosphereProbeLayerId = "precip" | "airtemp" | "aerosol";

/**
 * A discriminated union rather than one shape with an optional field: only a
 * land-only product can be absent for a reason the domain explains, so only it
 * carries the `quantity` used to name the zero-reading a reader must not infer.
 */
type AtmosphereDomainClaim =
  | {
      domain: "land-only";
      /** The rendered quantity, for a sentence that names what is absent. */
      quantity: string;
      /** Why the domain is what it is — a product property, not a value. */
      basis: string;
    }
  | { domain: "land-and-ocean"; basis: string };

/**
 * Domain of definition per atmosphere layer. A layer absent from this table is
 * not classified and yields no note, so a domain is never invented for one.
 */
const ATMOSPHERE_DOMAINS: Record<
  AtmosphereProbeLayerId,
  AtmosphereDomainClaim
> = {
  precip: {
    domain: "land-only",
    quantity: "precipitation",
    basis:
      "the GLDAS Noah land-surface model is solved on land cells only, so open water carries no value by construction",
  },
  airtemp: {
    domain: "land-and-ocean",
    basis: "MERRA-2 is a global reanalysis on a grid spanning land and ocean",
  },
  aerosol: {
    domain: "land-and-ocean",
    basis: "MERRA-2 is a global reanalysis on a grid spanning land and ocean",
  },
};

/**
 * The surface domain over which a layer's cited product is defined, or
 * "unclassified" for any layer outside this module's scope. Never guessed from
 * a value.
 */
export function atmosphereLayerDomain(layerId: LayerId): SpatialDomain {
  return (
    ATMOSPHERE_DOMAINS[layerId as AtmosphereProbeLayerId]?.domain ??
    "unclassified"
  );
}

/** True when no sampled month yielded a usable value. */
function isEmptySeries(values: readonly (number | null)[]): boolean {
  return !values.some((value) => value !== null && Number.isFinite(value));
}

/**
 * Explain an empty atmospheric probe record in terms of the cited product's
 * domain of definition, or null when this module classifies neither the layer
 * nor the situation.
 *
 * Returns null unless the layer is one of the three atmosphere layers AND the
 * series really holds no usable value — so the note can never be attached to a
 * record that did return data, whatever a caller passes.
 */
export function emptyAtmosphereProbeNote(
  layerId: LayerId,
  values: readonly (number | null)[]
): string | null {
  const claim = ATMOSPHERE_DOMAINS[layerId as AtmosphereProbeLayerId];
  if (!claim || !isEmptySeries(values)) return null;

  const layer = LAYERS[layerId];
  const consequence =
    claim.domain === "land-only"
      ? `An empty record here is consistent with a point outside that domain — not a reading of zero ${claim.quantity}, and not evidence of a failed retrieval.`
      : "The product's domain therefore does not explain an empty record here; this note does not diagnose the cause.";

  // Same statement shape as signalDomain.ts, so the two read as one voice.
  return (
    `${layer.label}: defined over ${domainPhrase(claim.domain)} — ${claim.basis}. ` +
    `${consequence} Source ${sourceLabel(layer.dataset)}.`
  );
}

function domainPhrase(domain: Exclude<SpatialDomain, "unclassified">): string {
  return domain === "land-only" ? "land surfaces only" : "both land and ocean";
}

function sourceLabel(dataset: DatasetRef | undefined): string {
  return dataset
    ? `${dataset.shortName} v${dataset.version}`
    : "no cited dataset";
}
