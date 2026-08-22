import { summarizeLandCoverContext } from "../lib/landCover";
import { summarizeLandCoverPersistence } from "../lib/landCoverPersistence";
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
 *
 * A transparent pixel is counted apart from that failure. The class contract
 * admits one value per pixel, so both arrive as null and the reading would
 * otherwise report a point clicked where nothing rendered as pixels this app
 * could not decode — evidence against the palette that transparency never
 * supplies. This is the only place the two are still distinguishable.
 */
export function readLandCoverClassText(
  pixels: readonly RenderedPixel[],
  dataYear: number
): string {
  let transparentSampleCount = 0;
  const observations = pixels.map((pixel) => {
    const decoded = decodeRenderedLandCoverPixel(pixel);
    if (decoded.status === "unavailable" && decoded.reason === "transparent") {
      transparentSampleCount += 1;
    }
    return {
      classCode: decoded.status === "classified" ? decoded.classCode : null,
    };
  });
  const context = summarizeLandCoverContext(observations, dataYear);
  const reading = describeLandCoverPointReading(context, {
    transparentSampleCount,
  });
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

/** One annual MCD12Q1 map, as the rendered pixels a point probe read from it. */
export interface LandCoverYearPixels {
  year: number;
  pixels: readonly RenderedPixel[];
}

/**
 * The dominant IGBP class of one annual map at the probed point, or null.
 *
 * A tie for most frequent leaves {@link summarizeLandCoverContext.dominantClass}
 * null, and that stays null here: picking a winner would credit a year of
 * tenure to a class the sampled pixels did not single out.
 */
function dominantClassCode(
  pixels: readonly RenderedPixel[],
  year: number
): number | null {
  const observations = pixels.map((pixel) => {
    const decoded = decodeRenderedLandCoverPixel(pixel);
    return {
      classCode: decoded.status === "classified" ? decoded.classCode : null,
    };
  });
  return (
    summarizeLandCoverContext(observations, year).dominantClass?.classCode ??
    null
  );
}

/**
 * Say how the probed point's class held across the annual maps that were read.
 *
 * One map answers "what class is here"; several answer "was this the class
 * here every year the maps cover", which a single-year read cannot. Whole
 * years are counted per class — codes are labels and are never averaged — and
 * the wording stops at the maps: a label that differs between two maps may be
 * a real transition, a revised classification, or map error, so this claims no
 * land-use change, degradation, succession, cause, or forecast. Returns null
 * below two classified years, where there is no tenure to describe.
 */
export function landCoverTenureClause(
  years: readonly LandCoverYearPixels[]
): string | null {
  const summary = summarizeLandCoverPersistence(
    years.map(({ year, pixels }) => ({
      year,
      classCode: dominantClassCode(pixels, year),
    }))
  );
  const { coverage, persistence, classTenure } = summary;
  if (persistence === null || coverage.yearSpan === null) return null;

  const readCount = coverage.observedYearCount + coverage.noDataYearCount;
  const known = coverage.knownLandCoverYearCount;
  const span = `${coverage.yearSpan.firstYear}–${coverage.yearSpan.lastYear}`;
  // "read" is the maps this probe actually fetched, not the whole MCD12Q1
  // record: a year that failed to load never reaches here, and saying "all"
  // of a smaller set than was classified would overstate the coverage.
  const scope =
    known === readCount
      ? `all ${readCount} annual maps read`
      : `${known} of the ${readCount} annual maps read`;

  if (persistence.isSingleClass) {
    return `${persistence.label} on ${scope}, ${span}.`;
  }
  const mix = classTenure
    .map((tenure) => `${tenure.label} on ${tenure.yearCount}`)
    .join(", ");
  return `Across ${scope}, ${span}: ${mix} — labels differing between maps can be reclassification, not change on the ground.`;
}
