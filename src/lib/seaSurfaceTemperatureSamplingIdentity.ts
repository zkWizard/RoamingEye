import { LAYERS, type LayerConfig, type LayerId } from "./timeline";

/**
 * Name *which* sea-surface temperature the SST layer actually carries.
 *
 * "Sea surface temperature" is not one quantity. GIBS publishes the MODIS/Aqua
 * L3 monthly product as four separate layers — thermal-IR Day, thermal-IR
 * Night, mid-IR Day, mid-IR Night — and this app renders exactly one of them:
 * `MODIS_Aqua_L3_SST_Thermal_9km_Day_Monthly`, whose own WMTS `ows:Title` reads
 * "Sea Surface Temperature (L3, Day, Monthly, Thermal, 9 km, MODIS, Aqua)".
 *
 * Two properties of that choice change how a number should be read, and neither
 * is recoverable from the value itself:
 *
 * 1. **Daytime-only sampling.** The monthly composite is built from Aqua's
 *    ascending (daytime) overpass alone, so it omits the nighttime half of the
 *    diurnal cycle. A day-only monthly mean is therefore not the same statistic
 *    as a day-and-night monthly mean, and the difference between them is not a
 *    constant: near-surface diurnal warming is largest under low wind and high
 *    insolation, so it varies with season, latitude, and weather.
 * 2. **Radiometric skin, not bulk.** A thermal-infrared retrieval senses the
 *    ocean's radiative skin — the topmost micrometres — which is not the bulk
 *    temperature of the mixed layer that marine organisms occupy.
 *
 * This module states those facts and nothing more. It applies no bias
 * correction, estimates no bias magnitude, and makes no biological, ecological,
 * habitat, hazard, or forecast claim. It exists so the qualifiers travel with
 * the layer instead of living only in a dataset short name that ends in
 * `_DAYTIME_V2019.0` and is never read aloud.
 */

/** The GIBS layer this identity describes; kept literal for the drift guard. */
export const SST_SAMPLING_IDENTITY_LAYER_ID = "sst" as const;

export interface SeaSurfaceTemperatureSamplingIdentity {
  layerId: typeof SST_SAMPLING_IDENTITY_LAYER_ID;
  /** GIBS layer identifier the app renders and probes. */
  gibsLayer: string;
  /** `ows:Title` as GIBS publishes it for that identifier, verbatim. */
  gibsTitle: string;
  /** Which half of the diurnal cycle the composite is built from. */
  diurnalSampling: "daytime-only";
  /**
   * Nominal local solar time of Aqua's ascending-node overpass. Individual
   * pixels are acquired near, not exactly at, this time.
   */
  nominalOverpassLocalSolarTime: "13:30";
  /** What the thermal-infrared retrieval physically senses. */
  retrievalDepth: "radiometric-skin";
  /**
   * The same-product GIBS layer covering the other half of the diurnal cycle.
   * It is published, but this app does not sample it — so no day/night mean is
   * available here, and none is synthesized.
   */
  unsampledDiurnalCounterpartLayer: string;
  /** No diurnal or skin-to-bulk adjustment is applied anywhere in this app. */
  biasCorrectionApplied: false;
}

export const SEA_SURFACE_TEMPERATURE_SAMPLING_IDENTITY: SeaSurfaceTemperatureSamplingIdentity =
  {
    layerId: SST_SAMPLING_IDENTITY_LAYER_ID,
    gibsLayer: "MODIS_Aqua_L3_SST_Thermal_9km_Day_Monthly",
    gibsTitle:
      "Sea Surface Temperature (L3, Day, Monthly, Thermal, 9 km, MODIS, Aqua)",
    diurnalSampling: "daytime-only",
    nominalOverpassLocalSolarTime: "13:30",
    retrievalDepth: "radiometric-skin",
    unsampledDiurnalCounterpartLayer:
      "MODIS_Aqua_L3_SST_Thermal_9km_Night_Monthly",
    biasCorrectionApplied: false,
  };

export const SST_SAMPLING_IDENTITY_LIMITATIONS = [
  "The monthly composite is built from Aqua's daytime overpass only, so it is not a day-and-night monthly mean.",
  "Near-surface diurnal warming varies with wind and insolation, so the day-only sampling offset is not constant across months, latitudes, or basins.",
  "A thermal-infrared retrieval senses the radiative skin, not the bulk temperature of the mixed layer.",
  "No diurnal or skin-to-bulk correction is applied; values are reported as the source publishes them.",
  "Sea surface temperature is a physical observation and never a marine-biological measurement.",
] as const;

/**
 * Short qualifier for a value read from this layer, suitable for appending to
 * an existing sentence. Deliberately states the sampling, not a consequence.
 */
export function sstSamplingQualifier(): string {
  return "daytime-overpass skin temperature, not a day-and-night mean";
}

/** Provenance-tagged sentence naming the sampled quantity and its limits. */
export function describeSstSamplingIdentity(): string {
  const identity = SEA_SURFACE_TEMPERATURE_SAMPLING_IDENTITY;
  return (
    `${identity.gibsLayer} carries a ${identity.diurnalSampling} composite ` +
    `from Aqua's ~${identity.nominalOverpassLocalSolarTime} local-solar-time ` +
    `overpass, retrieved as a ${identity.retrievalDepth} temperature. ` +
    `GIBS publishes ${identity.unsampledDiurnalCounterpartLayer} for the other ` +
    `half of the diurnal cycle; this app does not sample it, so no ` +
    `day-and-night mean is available and none is synthesized. ` +
    `No diurnal or skin-to-bulk correction is applied.`
  );
}

/**
 * Provenance headers naming the sampled quantity for the exported CSV, or an
 * empty list for every layer but SST.
 *
 * The on-screen probe carries a short sampling-gate clause, but the exported
 * file outlives the session and is the surface that most needs this: it states
 * the product only through `# data_product`, whose short name ends in
 * `_DAYTIME_V2019.0` — the dataset short name this module exists because nobody
 * reads aloud. A reader who opens the download six months later sees a column
 * headed `value` in degrees Celsius and no indication that it omits the
 * nighttime half of the diurnal cycle, or that it is a skin rather than a bulk
 * temperature. Both change what the column may be compared against, and neither
 * is recoverable from the numbers.
 *
 * Fuller than the status-line clause on purpose: an archived file has no display
 * budget (the same reasoning `probeRecordGapsCsvHeaders` applies to naming every
 * gap month rather than truncating). The unsampled nighttime counterpart is
 * named so a reader can find the other half themselves, and the absence of any
 * bias correction is stated so the values are known to be as-published.
 *
 * Silent when the configured layer has drifted from the declared identity: a
 * stale daytime-only claim attached to a different product would be worse than
 * no claim at all, and the exported file cannot be corrected after the fact.
 * Magnitudes are never asserted — the day-only offset varies with wind and
 * insolation this app does not observe — and nothing biological is claimed.
 */
export function sstSamplingIdentityCsvHeaders(
  layerId: LayerId | undefined
): string[] {
  if (layerId !== SST_SAMPLING_IDENTITY_LAYER_ID) return [];
  if (sstSamplingIdentityDrift().length > 0) return [];
  const identity = SEA_SURFACE_TEMPERATURE_SAMPLING_IDENTITY;
  // No commas anywhere below: a `#` line must never contain a CSV delimiter
  // (see the header discipline documented on `csvHeaderText` in probe.ts).
  return [
    `# sst_sampling: ${identity.diurnalSampling} monthly composite from Aqua's ~${identity.nominalOverpassLocalSolarTime} local-solar-time overpass — it omits the nighttime half of the diurnal cycle and is not a day-and-night monthly mean`,
    `# sst_retrieval_depth: ${identity.retrievalDepth} — a thermal-infrared retrieval senses the ocean's radiative skin (the topmost micrometres) and not the bulk temperature of the mixed layer`,
    `# sst_unsampled_counterpart: ${identity.unsampledDiurnalCounterpartLayer} covers the other diurnal half; this app does not sample it so no day-and-night mean is available here and none is synthesized`,
    `# sst_bias_correction: none applied — no diurnal or skin-to-bulk adjustment; values are reported as the source publishes them`,
  ];
}

export type SstSamplingIdentityDrift =
  | "layer-identifier-changed"
  | "layer-is-not-daytime"
  | "counterpart-is-not-nighttime"
  | "description-omits-daytime";

/**
 * Report every way the configured layer has drifted away from the declared
 * sampling identity. An empty array means the claim still holds.
 *
 * This is a pure check over repo configuration so a layer swap fails CI instead
 * of silently leaving a daytime-only qualifier attached to a different product.
 * It cannot detect an upstream change to GIBS's own layer definition; the
 * `gibsTitle` recorded above is the verbatim value to re-verify against the
 * published WMTS capabilities.
 */
export function sstSamplingIdentityDrift(
  layer: LayerConfig = LAYERS[SST_SAMPLING_IDENTITY_LAYER_ID]
): SstSamplingIdentityDrift[] {
  const identity = SEA_SURFACE_TEMPERATURE_SAMPLING_IDENTITY;
  const drift: SstSamplingIdentityDrift[] = [];

  if (layer.wmsLayer !== identity.gibsLayer) {
    drift.push("layer-identifier-changed");
  }
  // GIBS spells the diurnal half into the identifier itself; a layer that does
  // not say "Day" must not inherit a daytime-only qualifier.
  if (!/_Day_/.test(layer.wmsLayer)) {
    drift.push("layer-is-not-daytime");
  }
  if (!/_Night_/.test(identity.unsampledDiurnalCounterpartLayer)) {
    drift.push("counterpart-is-not-nighttime");
  }
  // The description is the only place a reader sees this qualifier, so an
  // edit that drops it is drift, not cosmetics.
  if (!/daytime/i.test(layer.description)) {
    drift.push("description-omits-daytime");
  }

  return drift;
}
