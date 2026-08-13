import { summarizeLandCoverContext } from "../lib/landCover";
import { decodeRenderedLandCoverPixel } from "../lib/landCoverPalette";
import { describeLandCoverPointReading } from "../lib/landCoverPointReading";
import { vegetationIndexSupportClassNote } from "../lib/vegetationIndexLandCoverSupport";
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
  const context = summarizeLandCoverContext(observations, dataYear);
  const reading = describeLandCoverPointReading(context);
  // A class label alone does not say whether the vegetation-index layers can
  // be read as plant greenness at this point: MOD13A3 retrieves NDVI and EVI
  // over snow, water, and barren ground just as it does over canopy. The
  // drawn-region read states that share; state the point's tier here so the
  // two land-cover surfaces disclose the same thing.
  const support = vegetationIndexSupportClassNote(
    context.mostFrequentClasses.map((entry) => entry.classCode)
  );
  return `${reading.text}${support === null ? "" : ` ${support}`}`;
}
