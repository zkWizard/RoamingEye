import { summarizeLandCoverContext } from "../lib/landCover";
import { decodeRenderedLandCoverPixel } from "../lib/landCoverPalette";
import { describeLandCoverPointReading } from "../lib/landCoverPointReading";
import type { RenderedPixel } from "./ProbeSampler";

/**
 * Turn the rendered pixels of a land-cover point probe into panel copy.
 *
 * Loaded on demand: only a probe on the class-coded layer needs it. Pixels that
 * do not match a published palette colour exactly stay unclassified — picking
 * the nearest colour would invent a source class that MCD12Q1 never assigned.
 */
export function readLandCoverClassText(
  pixels: readonly RenderedPixel[],
  dataYear: number
): string {
  const observations = pixels.map((pixel) => {
    const decoded = decodeRenderedLandCoverPixel(pixel);
    return {
      classCode: decoded.status === "classified" ? decoded.classCode : null,
    };
  });
  return describeLandCoverPointReading(
    summarizeLandCoverContext(observations, dataYear)
  ).text;
}
