import type { SearchBoundingBox } from "./volcanoExtent";

/**
 * Size of the geocoder search bounding box a dataset was tested against.
 *
 * Kept in its own module, importing nothing at runtime, because both extent
 * contexts that render a count over this box need it: `volcanoExtent` owns the
 * {@link SearchBoundingBox} type and `plateBoundaryContext` tests linework
 * against the same box. Having either one import the other for this phrase
 * merges their lazily-loaded chunks into the entry bundle, so the shared helper
 * lives beside neither consumer.
 */

const EARTH_RADIUS_KM = 6_371;
const DEG_TO_RAD = Math.PI / 180;

/**
 * Both dimensions of the supplied search bounding box, or null when no usable
 * box was supplied.
 *
 * The box comes from the geocoder, not from this app, and it is sized by what
 * the matched OSM object is: a monument's box measures a couple of hundred
 * metres across while a country's measures thousands of kilometres. Every
 * extent readout in the place panel renders the same count sentence whatever
 * that size, so without a stated size the counts carry no scale and are not
 * comparable between places — "1 record" over a city and "35 records" over the
 * country containing it can describe the same volcanic province at two box
 * sizes rather than two different geologies. The sibling seismicity readout
 * already states its own radius in kilometres; this states the scope behind the
 * extent counts on the same axis.
 *
 * North–south is a meridian arc and so is latitude-independent. East–west is
 * the arc along the extent's mid-latitude parallel, which is what "how far east
 * to west does this box reach" means and which shrinks toward the poles — the
 * copy names the latitude rather than implying a single width. A great-circle
 * chord is deliberately not used for the width: between two points at equal
 * latitude it bows poleward, so it understates the box, and it collapses to
 * zero for a box spanning the full 360°. Both figures are on a mean-radius
 * sphere, matching the other distances this panel reports.
 */
export function searchExtentSpanPhrase(
  bounds: SearchBoundingBox | null,
  crossesAntimeridian: boolean
): string | null {
  if (!isValidBounds(bounds)) return null;
  const [south, north, west, rawEast] = bounds;
  // A west > east box spans the antimeridian; unwrap the eastern edge so the
  // width is measured across the seam rather than the long way around.
  const east = crossesAntimeridian ? rawEast + 360 : rawEast;
  const midLatitude = (south + north) / 2;
  const northSouthKm = (north - south) * DEG_TO_RAD * EARTH_RADIUS_KM;
  const eastWestKm =
    (east - west) *
    DEG_TO_RAD *
    EARTH_RADIUS_KM *
    Math.cos(midLatitude * DEG_TO_RAD);
  return `about ${formatSpanKm(northSouthKm)} km north–south and ${formatSpanKm(eastWestKm)} km east–west at its mid-latitude`;
}

/**
 * Whole kilometres once an extent is wide enough for a fraction to be noise,
 * one decimal below that so a monument-sized box does not collapse to "0 km".
 */
function formatSpanKm(km: number): string {
  return km >= 100 ? String(Math.round(km)) : km.toFixed(1);
}

function isValidBounds(
  bounds: SearchBoundingBox | null
): bounds is SearchBoundingBox {
  if (!bounds) return false;
  const [south, north, west, east] = bounds;
  return (
    [south, north, west, east].every(Number.isFinite) &&
    south >= -90 &&
    north <= 90 &&
    west >= -180 &&
    west <= 180 &&
    east >= -180 &&
    east <= 180 &&
    south <= north
  );
}
