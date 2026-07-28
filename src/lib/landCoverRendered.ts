import {
  summarizeLandCoverContext,
  type LandCoverContextSummary,
} from "./landCover";
import {
  decodeRenderedLandCoverPixel,
  type RenderedLandCoverPixel,
} from "./landCoverPalette";

/**
 * One rendered MCD12Q1 pixel plus the number of selected samples it represents.
 *
 * Counts must remain positive integers. This contract deliberately does not
 * accept area weights: rendered-image samples are counts, not land-area
 * measurements.
 */
export interface RenderedLandCoverSample {
  pixel: RenderedLandCoverPixel;
  sampleCount?: number;
}

export type LandCoverSamplingGeography =
  | {
      kind: "point";
      latitude: number;
      longitude: number;
    }
  | {
      kind: "selected-boundary";
      label: string;
    };

export interface RenderedLandCoverCoverage {
  /** Positive-integer sample counts accepted from the rendered imagery. */
  countedSampleCount: number;
  /** Counted pixels matching an exact opaque IGBP palette entry. */
  decodedSampleCount: number;
  /** Counted transparent pixels; these remain unavailable. */
  transparentSampleCount: number;
  /** Counted opaque pixels not matching the source palette exactly. */
  unmappedColorSampleCount: number;
  /** Input records rejected because sampleCount was not a positive integer. */
  invalidRecordCount: number;
  decodedFraction: number | null;
}

export interface RenderedLandCoverSummary {
  kind: "rendered-igbp-land-cover-samples";
  isForecast: false;
  dataYear: number;
  geography: LandCoverSamplingGeography;
  renderedCoverage: RenderedLandCoverCoverage;
  landCover: LandCoverContextSummary;
  limitations: readonly [
    "Rendered-image samples are counts, not land-area measurements.",
    "Only exact opaque NASA GIBS palette colors are decoded; transparent and blended or unknown colors remain unavailable.",
    "The result describes source class codes and does not infer biodiversity, biomass, habitat quality, ecosystem condition, cause, or future change.",
  ];
}

const LIMITATIONS = [
  "Rendered-image samples are counts, not land-area measurements.",
  "Only exact opaque NASA GIBS palette colors are decoded; transparent and blended or unknown colors remain unavailable.",
  "The result describes source class codes and does not infer biodiversity, biomass, habitat quality, ecosystem condition, cause, or future change.",
] as const;

/**
 * Decode selected pixels from RoamingEye's rendered MCD12Q1 data path into the
 * native IGBP class-code summary while preserving every unavailable outcome.
 */
export function summarizeRenderedLandCover(
  samples: readonly RenderedLandCoverSample[],
  dataYear: number,
  geography: LandCoverSamplingGeography
): RenderedLandCoverSummary {
  const observations: { classCode: number | null; sampleCount: number }[] = [];
  let countedSampleCount = 0;
  let decodedSampleCount = 0;
  let transparentSampleCount = 0;
  let unmappedColorSampleCount = 0;
  let invalidRecordCount = 0;

  for (const sample of samples) {
    const sampleCount = sample.sampleCount ?? 1;
    if (!Number.isInteger(sampleCount) || sampleCount <= 0) {
      invalidRecordCount += 1;
      continue;
    }

    countedSampleCount += sampleCount;
    const decoded = decodeRenderedLandCoverPixel(sample.pixel);
    if (decoded.status === "classified") {
      decodedSampleCount += sampleCount;
      observations.push({ classCode: decoded.classCode, sampleCount });
      continue;
    }

    if (decoded.reason === "transparent") {
      transparentSampleCount += sampleCount;
    } else {
      unmappedColorSampleCount += sampleCount;
    }
    observations.push({ classCode: null, sampleCount });
  }

  return {
    kind: "rendered-igbp-land-cover-samples",
    isForecast: false,
    dataYear,
    geography,
    renderedCoverage: {
      countedSampleCount,
      decodedSampleCount,
      transparentSampleCount,
      unmappedColorSampleCount,
      invalidRecordCount,
      decodedFraction:
        countedSampleCount === 0
          ? null
          : decodedSampleCount / countedSampleCount,
    },
    landCover: summarizeLandCoverContext(observations, dataYear),
    limitations: LIMITATIONS,
  };
}
