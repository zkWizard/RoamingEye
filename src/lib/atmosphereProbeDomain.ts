import { LAYERS, type DatasetRef, type LayerId } from "./timeline";
import type { SpatialDomain } from "./signalDomain";
import {
  GLDAS_RAMP_SATURATION,
  type GldasRampLayerId,
} from "./gldasRampSaturation";

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
 * The domain is not the only ordinary reading behind an empty *precipitation*
 * record, and this is why the land-only sentence carries a second clause. GIBS
 * publishes the GLDAS precipitation ramp with an open-ended `≥ 5.0e-04` kg/m²/s
 * top bin — 43.2 mm/day of monthly-mean rate — and `parseColormapEntries` drops
 * that cap by documented design (see gldasRampSaturation.ts). Its colour
 * rgb(94,79,162) sits 76.7 RGB units from the nearest colour on the legend ramp
 * the point probe actually inverts against, again far outside the 60-unit
 * threshold, so a cell that saturated in every sampled month empties a record
 * too. That reading is the *opposite* extreme of the one a bare domain sentence
 * invites: the wettest monsoon and tropical-orographic cells the ramp can
 * represent, not an absence of rain. Naming only the domain would leave a
 * reader free to settle on dryness, so both readings are stated and neither is
 * chosen. The two MERRA-2 layers carry no such clause — they are not GLDAS,
 * their ramps are not this one, and their wording is untouched by it.
 *
 * Scope and honesty limits:
 *  - Domain of definition is a fixed, documented property of the cited product,
 *    asserted per layer below. It is never inferred from a value.
 *  - The ramp ceiling is likewise a documented property of the published
 *    colormap, read from `GLDAS_RAMP_SATURATION` rather than restated. The note
 *    never says which of the two readings applies, never reports a corrected or
 *    substituted rate, and never claims rainfall, flood state, runoff, or any
 *    future value — a cell at the cap is only known to be at or above it.
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
 * carries the `quantity` used to name the zero-reading a reader must not infer,
 * and only it keys into the GLDAS ramp whose dropped top cap is the second
 * ordinary reading behind the same empty record.
 */
type AtmosphereDomainClaim =
  | {
      domain: "land-only";
      /** The rendered quantity, for a sentence that names what is absent. */
      quantity: string;
      /** Why the domain is what it is — a product property, not a value. */
      basis: string;
      /**
       * The GLDAS ramp this layer is rendered with. The bound is read from
       * `GLDAS_RAMP_SATURATION` rather than restated here, so the sentence
       * cannot outlive the measured colormap facts.
       */
      rampLayerId: GldasRampLayerId;
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
    rampLayerId: "precip",
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
      ? `${ceilingClause(claim.rampLayerId)} An empty record here is consistent with a point outside that domain or with a rate at or above that bound — not a reading of zero ${claim.quantity}, and not evidence of a failed retrieval.`
      : "The product's domain therefore does not explain an empty record here; this note does not diagnose the cause.";

  // Same statement shape as signalDomain.ts, so the two read as one voice.
  return (
    `${layer.label}: defined over ${domainPhrase(claim.domain)} — ${claim.basis}. ` +
    `${consequence} Source ${sourceLabel(layer.dataset)}.`
  );
}

/**
 * The second ordinary reading behind an empty record on a GLDAS layer: the
 * ramp's open-ended top bin, dropped by the same inversion that drops an
 * undrawn pixel.
 *
 * The published label is in the document's native unit, which for
 * precipitation is not the unit the probe reports — so the bound is given
 * twice rather than mislabelled once. Both come from the measured facts; no
 * number is written out here.
 */
function ceilingClause(rampLayerId: GldasRampLayerId): string {
  const { ceiling, nativeUnit, reportedUnit } =
    GLDAS_RAMP_SATURATION[rampLayerId];
  return (
    `The ramp's open-ended "${ceiling.publishedLabel}" ${nativeUnit} top bin ` +
    `(${ceiling.boundReported} ${reportedUnit}) is discarded by the same inversion, ` +
    `so the wettest cells the ramp can represent empty a record too.`
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
