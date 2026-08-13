import { summarizeLandCoverContext } from "../lib/landCover";
import { decodeRenderedLandCoverPixel } from "../lib/landCoverPalette";
import { describeLandCoverComposition } from "../lib/landCoverCompositionReading";
import type { RenderedPixel } from "./ProbeSampler";

/**
 * Turn the rendered pixels of a drawn-region land-cover sample into panel copy.
 *
 * Loaded on demand alongside the point-probe reader: only the class-coded layer
 * needs the class tables. Pixels that do not match a published palette colour
 * exactly stay unclassified — picking the nearest colour would invent a source
 * class that MCD12Q1 never assigned, and over a region that error would
 * accumulate into a share rather than affecting a single reading.
 *
 * The sampled grid is appended verbatim so the reported composition can be
 * reproduced: the same grid the numeric region mean uses.
 */
export function readLandCoverRegionText(
  pixels: readonly RenderedPixel[],
  dataYear: number,
  sampling: {
    latitudeGridSize: number;
    longitudeGridSize: number;
    sourcePixelCount: number;
  }
): string {
  const observations = pixels.map((pixel) => {
    const decoded = decodeRenderedLandCoverPixel(pixel);
    return {
      classCode: decoded.status === "classified" ? decoded.classCode : null,
    };
  });
  const reading = describeLandCoverComposition(
    summarizeLandCoverContext(observations, dataYear)
  );
  return `${reading.text} Sampled on a ${sampling.latitudeGridSize}×${sampling.longitudeGridSize} grid over the drawn box, resolving to ${sampling.sourcePixelCount} distinct source pixels.`;
}
