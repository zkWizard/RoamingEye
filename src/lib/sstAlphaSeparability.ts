import { NO_DATA_DISTANCE } from "./probe";
import { LAYERS, type DatasetRef } from "./timeline";

/**
 * Whether a sampled sea-surface-temperature pixel is a retrieval or a gap —
 * and how reliably that question can be answered under each image transport.
 *
 * GIBS draws SST only where the L3 product carries a retrieval. Everywhere
 * else — land, sea ice, cloud, and swath gaps — it draws nothing. On a
 * transport that carries an alpha channel this is unambiguous: undrawn pixels
 * arrive fully transparent. On a transport that does not, "nothing drawn"
 * arrives as **black**, and the only remaining test is whether a colour sits
 * far enough from black to be a real colour (`NO_DATA_DISTANCE`).
 *
 * That fallback is not equally accurate everywhere, and its failure is
 * SYSTEMATIC rather than random. GIBS renders MODIS SST on a spectral ramp
 * whose cold end is deep magenta — the coldest drawn colours measure ~50 units
 * from black, INSIDE the 60-unit no-data threshold. So the distance test is
 * blind precisely where the water is coldest, and untroubled where it is warm:
 * in the scenes measured below it rejects 52.5% of genuine retrievals in the
 * Sea of Okhotsk and 25.9% in the Weddell Sea, against 0.0% in the temperate
 * North Atlantic, the equatorial Pacific, and the Arabian Sea.
 *
 * A rejected sample is dropped, not flagged, so this is value-dependent
 * missingness: in sub-polar water the surviving samples are the warmer ones,
 * and any mean, anomaly, percentile, or trend built from them inherits that
 * warm lean. The bias is a property of the transport, not of the ocean.
 *
 * This module reports separability only. It does not correct a value, estimate
 * the size of the resulting bias, or make any marine-biological, habitat,
 * ecosystem, causal, hazard, or forecast claim. Provenance is retained.
 *
 * Pure, render-free logic (see sstAlphaSeparability.test.ts).
 */

const sstSource = LAYERS.sst.dataset;
if (!sstSource) {
  throw new Error("RoamingEye: the SST layer must retain a cited dataset");
}

export const SST_ALPHA_SEPARABILITY_SOURCE = {
  layerId: "sst",
  wmsLayer: LAYERS.sst.wmsLayer,
  source: sstSource,
} as const satisfies {
  layerId: "sst";
  wmsLayer: string;
  source: DatasetRef;
};

/**
 * How a sampled image carries "nothing was drawn here".
 *
 * `alpha-carrying` — the response has an alpha channel (GIBS publishes this
 * layer as `image/png`, colour type 6/RGBA). Undrawn pixels are transparent.
 *
 * `opaque-only` — the response has no alpha channel (for example
 * `image/jpeg`, which JFIF cannot represent). Undrawn pixels arrive black and
 * are indistinguishable from a genuinely near-black drawn colour.
 */
export type SstImageTransport = "alpha-carrying" | "opaque-only";

export type SstSampleStatus =
  /** A drawn SST retrieval. */
  | "observed"
  /** Nothing was drawn: land, sea ice, cloud, or a swath gap. */
  | "no-data"
  /** Resampling blended drawn and undrawn source pixels. */
  | "partially-covered"
  /**
   * Drawn or undrawn cannot be told apart: the colour is within
   * `NO_DATA_DISTANCE` of black and the transport carries no alpha.
   */
  | "indeterminate-near-black";

export type SstSampleBasis =
  /** Exact: the transport stated coverage directly. */
  | "alpha-channel"
  /** Heuristic: inferred from how far the colour sits from black. */
  | "distance-from-black";

export interface SstSamplePixel {
  r: number;
  g: number;
  b: number;
  /**
   * 0–255 coverage from an alpha-carrying transport. Omit (or pass null) when
   * the transport has no alpha channel; it is never assumed to be 255.
   */
  alpha?: number | null;
}

export interface SstSampleClassification {
  kind: "sst-sample-coverage-classification";
  /** Coverage of one rendered pixel, never a marine-biology observation. */
  marineBiologyObservation: false;
  isForecast: false;
  source: typeof SST_ALPHA_SEPARABILITY_SOURCE;
  status: SstSampleStatus;
  basis: SstSampleBasis;
  /** True only when coverage was stated rather than inferred from colour. */
  exact: boolean;
  /** Euclidean RGB distance from black; null when the pixel is malformed. */
  distanceFromBlack: number | null;
  /** Threshold the colour test was taken against; null when alpha decided it. */
  noDataDistance: number | null;
  reason:
    | "transparent"
    | "opaque"
    | "partial-alpha"
    | "far-from-black"
    | "within-no-data-distance"
    | "invalid-pixel";
}

/** An 8-bit channel as a canvas or decoded PNG delivers it. */
function isChannel(value: number): boolean {
  return Number.isInteger(value) && value >= 0 && value <= 255;
}

/**
 * Classify one sampled pixel's coverage, stating whether the answer is exact.
 *
 * On an alpha-carrying transport the alpha channel decides and no colour test
 * is run — a genuine near-black retrieval stays `observed`. On an opaque-only
 * transport a colour within `NO_DATA_DISTANCE` of black is reported as
 * `indeterminate-near-black` rather than silently resolved either way, so a
 * caller can drop it knowingly instead of mistaking a censored cold retrieval
 * for absent data.
 */
export function classifySstSample(
  pixel: SstSamplePixel,
  transport: SstImageTransport
): SstSampleClassification {
  const base = {
    kind: "sst-sample-coverage-classification",
    marineBiologyObservation: false,
    isForecast: false,
    source: SST_ALPHA_SEPARABILITY_SOURCE,
  } as const;

  const alpha = pixel.alpha ?? null;
  const channelsValid =
    isChannel(pixel.r) && isChannel(pixel.g) && isChannel(pixel.b);
  const alphaValid = alpha === null || isChannel(alpha);
  if (!channelsValid || !alphaValid) {
    return {
      ...base,
      status: "no-data",
      basis:
        transport === "alpha-carrying"
          ? "alpha-channel"
          : "distance-from-black",
      exact: false,
      distanceFromBlack: null,
      noDataDistance: null,
      reason: "invalid-pixel",
    };
  }

  const distanceFromBlack = Math.hypot(pixel.r, pixel.g, pixel.b);

  // Alpha is authoritative when the transport supplies it. A transport that
  // declares alpha but omits it for this pixel cannot be resolved exactly, so
  // it falls through to the colour test rather than defaulting to covered.
  if (transport === "alpha-carrying" && alpha !== null) {
    if (alpha === 0) {
      return {
        ...base,
        status: "no-data",
        basis: "alpha-channel",
        exact: true,
        distanceFromBlack,
        noDataDistance: null,
        reason: "transparent",
      };
    }
    if (alpha === 255) {
      return {
        ...base,
        status: "observed",
        basis: "alpha-channel",
        exact: true,
        distanceFromBlack,
        noDataDistance: null,
        reason: "opaque",
      };
    }
    // GIBS resamples nearest-neighbour, so partial alpha does not come from
    // the service (verified 0 partial-alpha pixels at four request sizes).
    // It appears when a client scales the image while drawing it, which blends
    // drawn and undrawn source pixels into a colour that is neither.
    return {
      ...base,
      status: "partially-covered",
      basis: "alpha-channel",
      exact: true,
      distanceFromBlack,
      noDataDistance: null,
      reason: "partial-alpha",
    };
  }

  if (distanceFromBlack > NO_DATA_DISTANCE) {
    return {
      ...base,
      status: "observed",
      basis: "distance-from-black",
      exact: false,
      distanceFromBlack,
      noDataDistance: NO_DATA_DISTANCE,
      reason: "far-from-black",
    };
  }
  return {
    ...base,
    status: "indeterminate-near-black",
    basis: "distance-from-black",
    exact: false,
    distanceFromBlack,
    noDataDistance: NO_DATA_DISTANCE,
    reason: "within-no-data-distance",
  };
}

export interface SstSeparabilityScene {
  /** Human label for the sampled water body; not a source identifier. */
  label: string;
  /** WMS BBOX as south, west, north, east (EPSG:4326, degrees). */
  bounds: { south: number; west: number; north: number; east: number };
  /** Month requested via the WMS TIME parameter. */
  time: string;
  /** Fully opaque pixels — drawn SST retrievals. */
  drawnPixels: number;
  /** Fully transparent pixels — land, ice, cloud, or swath gap. */
  undrawnPixels: number;
  /**
   * Drawn pixels whose colour sits within `NO_DATA_DISTANCE` of black, i.e.
   * genuine retrievals an opaque-only transport cannot distinguish from a gap.
   */
  drawnWithinNoDataDistance: number;
  /** Smallest distance from black among the drawn pixels. */
  minDrawnDistanceFromBlack: number;
}

/**
 * Measured separability of drawn SST from undrawn background, per scene.
 *
 * Method: request the cited layer from GIBS WMS as `image/png` (colour type 6,
 * RGBA) at 256x256, decode losslessly, and count pixels by alpha. Alpha split
 * every scene cleanly — no partial-alpha pixel occurred, and every transparent
 * pixel carried exactly rgb(0,0,0) — so the alpha channel answers coverage
 * exactly. `drawnWithinNoDataDistance` then applies the app's existing colour
 * test to those same pixels to measure what an opaque-only transport loses.
 *
 * These are individual monthly renders chosen to span the temperature range,
 * not a global or climatological census; the shares below characterize the
 * failure mode, they do not estimate a basin-wide or annual rejection rate.
 * The colour test is applied to lossless PNG RGB, so it isolates the ambiguity
 * inherent in the ramp; JPEG's own compression noise would additionally move
 * individual pixels across the threshold in either direction.
 */
export const MEASURED_SST_ALPHA_SEPARABILITY = {
  /** UTC date the scenes below were fetched and counted. */
  measuredIso: "2026-08-11",
  requestedFormat: "image/png",
  /** PNG colour type GIBS returned: 6 = 8-bit RGBA. */
  pngColorType: 6,
  imageWidth: 256,
  imageHeight: 256,
  noDataDistance: NO_DATA_DISTANCE,
  scenes: [
    {
      label: "Sea of Okhotsk",
      bounds: { south: 45, west: 140, north: 60, east: 160 },
      time: "2026-03-01",
      drawnPixels: 38958,
      undrawnPixels: 26578,
      drawnWithinNoDataDistance: 20454,
      minDrawnDistanceFromBlack: 50.2,
    },
    {
      label: "Southern Ocean (Weddell)",
      bounds: { south: -70, west: -60, north: -50, east: -20 },
      time: "2025-08-01",
      drawnPixels: 19223,
      undrawnPixels: 46313,
      drawnWithinNoDataDistance: 4985,
      minDrawnDistanceFromBlack: 50.2,
    },
    {
      label: "Bering Sea",
      bounds: { south: 50, west: -180, north: 70, east: -150 },
      time: "2026-01-01",
      drawnPixels: 32697,
      undrawnPixels: 32839,
      drawnWithinNoDataDistance: 3250,
      minDrawnDistanceFromBlack: 50.2,
    },
    {
      label: "Labrador Sea",
      bounds: { south: 50, west: -60, north: 65, east: -40 },
      time: "2026-02-01",
      drawnPixels: 42340,
      undrawnPixels: 23196,
      drawnWithinNoDataDistance: 2966,
      minDrawnDistanceFromBlack: 50.2,
    },
    {
      label: "North Atlantic (temperate)",
      bounds: { south: 40, west: -40, north: 55, east: -10 },
      time: "2025-07-01",
      drawnPixels: 64161,
      undrawnPixels: 1375,
      drawnWithinNoDataDistance: 0,
      minDrawnDistanceFromBlack: 84.2,
    },
    {
      label: "Arabian Sea",
      bounds: { south: 5, west: 55, north: 25, east: 75 },
      time: "2025-07-01",
      drawnPixels: 43217,
      undrawnPixels: 22319,
      drawnWithinNoDataDistance: 0,
      minDrawnDistanceFromBlack: 107,
    },
    {
      label: "Equatorial Pacific",
      bounds: { south: -10, west: -150, north: 10, east: -120 },
      time: "2025-07-01",
      drawnPixels: 65495,
      undrawnPixels: 41,
      drawnWithinNoDataDistance: 0,
      minDrawnDistanceFromBlack: 162.4,
    },
  ] as const satisfies readonly SstSeparabilityScene[],
} as const;

/**
 * Share of a scene's drawn retrievals an opaque-only transport cannot
 * distinguish from no-data. Null when the scene drew nothing, because a share
 * of zero retrievals is undefined rather than zero.
 */
export function censoredDrawnShare(scene: SstSeparabilityScene): number | null {
  if (!Number.isInteger(scene.drawnPixels) || scene.drawnPixels <= 0) {
    return null;
  }
  return scene.drawnWithinNoDataDistance / scene.drawnPixels;
}

export const SST_ALPHA_SEPARABILITY_LIMITATIONS = [
  "Coverage is a property of the rendered image, not of the ocean: a pixel is 'no-data' because GIBS drew nothing there — land, sea ice, cloud, or a swath gap — and this module never distinguishes which of those it was.",
  "On an alpha-carrying transport coverage is stated by the service and exact; on an opaque-only transport it is inferred from distance to black and is a heuristic, which is why an ambiguous pixel is reported as indeterminate rather than resolved.",
  "The heuristic fails asymmetrically: GIBS's SST ramp is deep magenta at the cold end, whose colours measure about 50 units from black — inside the app's 60-unit no-data distance — so genuine retrievals are rejected in cold water and not in warm.",
  "Because a rejected sample is dropped rather than flagged, the surviving samples in sub-polar water lean warm; the measured scene shares describe that censoring, they do not estimate the magnitude of the resulting bias in any mean, anomaly, percentile, or trend.",
  "Measured shares come from individual monthly 256x256 renders chosen to span the temperature range — not a global, basin-wide, or climatological census — and the colour test was applied to lossless PNG values, so a lossy transport would additionally shift individual pixels across the threshold in either direction.",
  "This describes image coverage and colour separability only; it never infers a temperature, corrects a value, or supports any marine-biological, habitat, ecosystem, causal, hazard, or forecast claim.",
] as const;
