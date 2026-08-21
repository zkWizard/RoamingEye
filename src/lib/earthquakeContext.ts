import { greatCircleDistance } from "./geo";
import { formatReportedMagnitude, magnitudeScale } from "./magnitudeScale";
import { seismicFixedDepthCoverage } from "./seismicFixedDepth";
import {
  DOCUMENTED_MAX_AZIMUTHAL_GAP_DEG,
  seismicNetworkGeometry,
  summarizeNetworkGeometryCoverage,
} from "./seismicNetworkGeometry";
import {
  depthClass,
  SEISMICITY_SOURCE,
  SEISMICITY_UNITS,
  summarizeEarthquakes,
  USGS_FEED_URL,
  type DepthClass,
  type Earthquake,
  type EarthquakeRange,
  type EarthquakeSummary,
} from "./earthquakes";

/**
 * Source-aware place context for the live USGS M4.5+ earthquake overlay.
 *
 * The helper selects only supplied earthquake observations whose epicentres
 * fall within a requested great-circle radius. It is render-free so a place
 * panel, an export, or another UI can use the same evidence and coverage
 * contract without treating nearby events as a hazard assessment.
 */

export const USGS_M45_MONTH_SOURCE = {
  ...SEISMICITY_SOURCE,
  feedUrl: USGS_FEED_URL,
  feedWindow: "rolling past 30 days at source retrieval time",
  minimumMagnitude: 4.5,
} as const;

export const EARTHQUAKE_PLACE_CONTEXT_UNITS = {
  ...SEISMICITY_UNITS,
  coordinates: "decimal degrees",
  distance: "km (epicentral great-circle distance)",
  radius: "km (epicentral great-circle radius)",
} as const;

export interface EarthquakePlaceQuery {
  latitude: number;
  longitude: number;
  /** Inclusive radius around the query location, measured along Earth's surface. */
  radiusKm: number;
}

/**
 * Turn a `[south, north, west, east]` search extent into the smallest radial
 * query that still contains every corner of that extent.
 *
 * The nearby-seismicity helper is radial while place search is rectangular, so
 * some conversion is unavoidable. Circumscribing (rather than inscribing) the
 * extent keeps the query a superset of the searched area: no event inside the
 * boundary is silently dropped. The cost is that the circle also reaches
 * *outside* the boundary near its corners, so matched events are "near this
 * place", not "inside this place" — callers must say so, and every observation
 * carries its own `distanceKm` for exactly that reason.
 *
 * Bounds that are missing, non-finite, or outside valid coordinate ranges
 * produce a deliberately invalid query, which `nearbyEarthquakeContext`
 * reports as `invalid-query` rather than as an empty-but-valid result.
 */
export function searchExtentEarthquakeQuery(
  boundingBox: readonly [number, number, number, number] | null
): EarthquakePlaceQuery {
  if (!boundingBox || !isUsableExtent(boundingBox)) {
    return { latitude: NaN, longitude: NaN, radiusKm: NaN };
  }

  const [south, north, west, rawEast] = boundingBox;
  // A west > east extent crosses the antimeridian; unwrap the eastern edge so
  // the midpoint and corner distances are measured across the seam, not the
  // long way around the globe.
  const east = rawEast < west ? rawEast + 360 : rawEast;
  const latitude = (south + north) / 2;
  const longitude = normalizeLongitude((west + east) / 2);

  const radiusKm = Math.max(
    ...[south, north].flatMap((cornerLat) =>
      [west, east].map((cornerLon) =>
        greatCircleDistance(
          latitude,
          longitude,
          cornerLat,
          normalizeLongitude(cornerLon),
          EARTH_RADIUS_KM
        )
      )
    )
  );

  return { latitude, longitude, radiusKm };
}

function isUsableExtent(
  boundingBox: readonly [number, number, number, number]
): boolean {
  const [south, north, west, east] = boundingBox;
  return (
    boundingBox.every((value) => Number.isFinite(value)) &&
    Math.abs(south) <= 90 &&
    Math.abs(north) <= 90 &&
    south <= north &&
    Math.abs(west) <= 180 &&
    Math.abs(east) <= 180
  );
}

/** Wrap a longitude into [-180, 180]; +180 is preserved rather than flipped. */
function normalizeLongitude(longitude: number): number {
  if (longitude > 180) return ((longitude + 180) % 360) - 180;
  if (longitude < -180) return ((longitude - 180) % 360) + 180;
  return longitude;
}

export interface NearbyEarthquakeObservation extends Earthquake {
  /** Surface distance from the query point to the event epicentre. */
  distanceKm: number;
  depthClass: DepthClass;
}

export type EarthquakePlaceContextStatus =
  "available" | "no-events-in-radius" | "no-usable-events" | "invalid-query";

export type EarthquakePlaceQueryField = "latitude" | "longitude" | "radiusKm";

/**
 * Coverage is scoped to the event array supplied to this helper. The source
 * time range is an observed range, not a statement of feed completeness.
 */
export interface EarthquakePlaceCoverage {
  status: EarthquakePlaceContextStatus;
  suppliedEventCount: number;
  validEventCount: number;
  matchedEventCount: number;
  /** Observed epicentral-distance range for matched events, in kilometres. */
  matchedDistanceKm: EarthquakeRange;
  sourceEventTime: EarthquakeRange;
  invalidQueryFields: EarthquakePlaceQueryField[];
}

export interface EarthquakePlaceContext {
  kind: "usgs-nearby-earthquake-context";
  isForecast: false;
  query: EarthquakePlaceQuery;
  observations: NearbyEarthquakeObservation[];
  summary: EarthquakeSummary;
  coverage: EarthquakePlaceCoverage;
  provenance: typeof USGS_M45_MONTH_SOURCE;
  units: typeof EARTHQUAKE_PLACE_CONTEXT_UNITS;
  limitations: readonly string[];
}

const LIMITATIONS = [
  "Describes only valid events supplied to this helper; no matching event does not establish that a location is seismically quiet.",
  "The overlay feed is a global M4.5+ rolling 30-day summary, not a complete earthquake catalog.",
  "Distances are epicentral great-circle distances on a mean-radius Earth; hypocentre depth is reported separately and is not part of the distance.",
] as const;

const EARTH_RADIUS_KM = 6_371;

/**
 * Build source-aware nearby seismicity context for a place. Matches at the
 * radius boundary are included and results are ordered nearest first, then by
 * most recent event when distances tie.
 */
export function nearbyEarthquakeContext(
  earthquakes: readonly Earthquake[],
  query: EarthquakePlaceQuery
): EarthquakePlaceContext {
  const valid = earthquakes.filter(isValidEarthquake);
  const invalidQueryFields = queryValidationErrors(query);
  const observations =
    invalidQueryFields.length === 0 ? matchingObservations(valid, query) : [];
  const status: EarthquakePlaceContextStatus =
    invalidQueryFields.length > 0
      ? "invalid-query"
      : observations.length > 0
        ? "available"
        : valid.length === 0
          ? "no-usable-events"
          : "no-events-in-radius";

  return {
    kind: "usgs-nearby-earthquake-context",
    isForecast: false,
    query,
    observations,
    summary: summarizeEarthquakes(observations),
    coverage: {
      status,
      suppliedEventCount: earthquakes.length,
      validEventCount: valid.length,
      matchedEventCount: observations.length,
      matchedDistanceKm: rangeForObservations(observations),
      sourceEventTime: summarizeEarthquakes(valid).time,
      invalidQueryFields,
    },
    provenance: USGS_M45_MONTH_SOURCE,
    units: EARTHQUAKE_PLACE_CONTEXT_UNITS,
    limitations: LIMITATIONS,
  };
}

function rangeForObservations(
  observations: readonly NearbyEarthquakeObservation[]
): EarthquakeRange {
  if (observations.length === 0) return { min: null, max: null };
  // matchingObservations orders nearest first, but derive both bounds directly
  // so this coverage contract remains correct if presentation ordering changes.
  const distances = observations.map(({ distanceKm }) => distanceKm);
  return { min: Math.min(...distances), max: Math.max(...distances) };
}

function matchingObservations(
  earthquakes: readonly Earthquake[],
  query: EarthquakePlaceQuery
): NearbyEarthquakeObservation[] {
  return earthquakes
    .map((earthquake) => ({
      ...earthquake,
      distanceKm: greatCircleDistance(
        query.latitude,
        query.longitude,
        earthquake.lat,
        earthquake.lon,
        EARTH_RADIUS_KM
      ),
      depthClass: depthClass(earthquake.depthKm),
    }))
    .filter((earthquake) => earthquake.distanceKm <= query.radiusKm)
    .sort(compareObservations);
}

/**
 * The matched observation carrying the largest reported magnitude value.
 *
 * "Largest reported value", not "largest earthquake": the feed mixes magnitude
 * methods and no exact conversion between them is published (see
 * lib/magnitudeScale.ts), so this is a maximum over reported numbers rather
 * than a ranking of event size.
 *
 * Reported magnitudes are quantised to a tenth of a magnitude unit, so exact
 * ties between two matched events are ordinary rather than rare. The comparator
 * is therefore total and independent of input order — nearest epicentre first,
 * then most recent, then source-reported place — so this picker cannot change
 * its answer if the presentation ordering of `observations` changes.
 *
 * Returns null for an empty set: there is no observation to report, and naming
 * a placeholder would read as a finding.
 */
export function largestReportedMagnitudeObservation(
  observations: readonly NearbyEarthquakeObservation[]
): NearbyEarthquakeObservation | null {
  let largest: NearbyEarthquakeObservation | null = null;
  for (const observation of observations) {
    if (
      largest === null ||
      compareByReportedMagnitude(observation, largest) < 0
    ) {
      largest = observation;
    }
  }
  return largest;
}

function compareByReportedMagnitude(
  first: NearbyEarthquakeObservation,
  second: NearbyEarthquakeObservation
): number {
  return (
    second.magnitude - first.magnitude ||
    first.distanceKm - second.distanceKm ||
    second.time - first.time ||
    compareNullablePlace(first.place, second.place)
  );
}

/**
 * One-sentence magnitude composition for the whole matched set, phrased so the
 * mixing of magnitude methods is visible rather than implied.
 *
 * It characterises every matched event, which matters where a UI can only list
 * part of the set: the nearby-seismicity list is ordered nearest first and
 * truncated, so the largest value the feed reported near a place is routinely
 * absent from it, and nothing else in the section names the methods behind the
 * values shown.
 *
 * Returns null for an empty matched set — there is no composition to report,
 * and an absence of matched events is already stated by the section itself.
 */
export function reportedMagnitudeText(
  context: EarthquakePlaceContext
): string | null {
  const largest = largestReportedMagnitudeObservation(context.observations);
  if (largest === null) return null;

  const eventCount = context.coverage.matchedEventCount;
  const { reportedCounts, unavailableCount } = context.summary.magnitudeTypes;
  const reportedTypes = Object.entries(reportedCounts);
  const methodParts = reportedTypes.map(([type, count]) => `${type} ×${count}`);
  if (unavailableCount > 0) {
    methodParts.push(`type not reported ×${unavailableCount}`);
  }
  // A single method is stated plainly; only a genuinely mixed set carries the
  // comparability caveat, so a uniform set gains no noise. Either way the code
  // the feed reported is expanded to the method USGS names for it — the tally
  // keeps the feed's own spelling, and the expansion says what it measures.
  const soleScale =
    reportedTypes.length === 1 ? magnitudeScale(reportedTypes[0][0]) : null;
  const methods =
    methodParts.length > 1
      ? ` Matched events mix magnitude methods (${methodParts.join(", ")}), which are not directly comparable.` +
        methodGlossaryClause(reportedTypes.map(([type]) => type))
      : reportedTypes.length === 1
        ? ` Every matched event was reported as ${reportedTypes[0][0]}${
            soleScale === null ? "" : `, ${soleScale.method}`
          }.`
        : " No matched event carried a reported magnitude method.";

  return (
    `Largest reported value across all ${eventCount} matched ${eventCount === 1 ? "event" : "events"}: ` +
    `${formatReportedMagnitude(largest.magnitude, largest.magnitudeType)}, ` +
    `${epicentralDistanceText(largest.distanceKm)}.${methods}` +
    " This is a maximum over reported values, not a ranking of earthquake size and not a hazard statement."
  );
}

/**
 * Expand the magnitude codes behind a mixed set to the methods USGS names for
 * them, as a trailing clause (empty when nothing can be named).
 *
 * The tally the clause follows prints the feed's own spelling — "mb ×104,
 * mww ×14" — which states that the set mixes methods without saying what
 * either method measures. The published vocabulary is already in the bundle
 * (lib/magnitudeScale.ts), so the expansion costs no new data.
 *
 * Codes outside the published vocabulary are skipped rather than guessed: they
 * remain in the tally verbatim, and attributing one to a method USGS never
 * named would fabricate provenance. When no code resolves there is nothing to
 * expand and the clause is empty.
 *
 * Entries are keyed by canonical label because distinct feed spellings can
 * decode to one scale — USGS lists "ms", "ms20" and "ms_20" as the same
 * 20-second surface-wave method — and naming one method twice would read as
 * two methods.
 *
 * This names what a value measures; it never converts between scales and makes
 * no claim that the values are comparable.
 */
function methodGlossaryClause(codes: readonly string[]): string {
  const named = new Map<string, string>();
  for (const code of codes) {
    const scale = magnitudeScale(code);
    if (scale === null) continue;
    named.set(scale.label, scale.method);
  }
  if (named.size === 0) return "";

  // Entries keep the tally's own order — `summarizeEarthquakes` sorts the codes
  // alphabetically — so the two lists correspond term for term and a reader can
  // scan from "mww ×14" to the method that produced it. That correspondence is
  // worth more than naming the most frequent methods first, because the cap
  // below needs five distinct methods before it can hide anything and no
  // matched extent has yet reached four.
  const entries = [...named.entries()];
  // Name up to three, but name all four when there are exactly four, so the
  // unnamed remainder is either zero or at least two. "1 further method" is
  // therefore unreachable and needs no singular branch.
  const shown = entries.slice(0, entries.length === 4 ? 4 : 3);
  const clause = shown
    .map(([label, method]) => `${label} is ${method}`)
    .join("; ");
  const unnamed = entries.length - shown.length;
  return unnamed === 0
    ? ` Reported methods: ${clause}.`
    : ` Reported methods: ${clause}; ${unnamed} further methods not named.`;
}

/**
 * How a truncated nearby-seismicity record list chose the events it shows.
 *
 * `matchingObservations` orders matched events nearest epicentre first (ties
 * broken by most recent), so a list cut to its first few rows shows the closest
 * events, not the largest. That distinction is not self-evident: a reader
 * meeting a short list of earthquakes reasonably assumes it is ranked by size,
 * and this section states the largest reported value for the whole matched set
 * (see `reportedMagnitudeText`), which is routinely absent from the rows. Left
 * unsaid, the truncation reads as "these are the biggest earthquakes near here".
 *
 * The ordering contract lives in this module, so the sentence describing it
 * does too — a UI that hard-codes a claim about an ordering it does not own is
 * how the claim silently goes stale.
 *
 * Returns null when nothing is hidden: with every matched event on screen there
 * is no selection to disclose.
 */
export function listedSeismicityOrderNote(
  context: EarthquakePlaceContext,
  listedCount: number
): string | null {
  const hidden = context.coverage.matchedEventCount - listedCount;
  if (!Number.isFinite(listedCount) || listedCount < 0 || hidden <= 0) {
    return null;
  }
  return (
    `${hidden} additional ${hidden === 1 ? "event" : "events"} not listed; ` +
    "the list is ordered nearest first, not by magnitude"
  );
}

/**
 * One-sentence qualifier for the matched set's reported hypocentral depths,
 * emitted only when at least one matched event reports a depth sitting exactly
 * on a conventional operator-assigned default value.
 *
 * The globe's earthquake hover already qualifies such a depth marker by marker
 * (see overlays/EarthquakesOverlay). A place panel that reprints the same
 * numbers without that qualifier presents a 10 km default as an independently
 * resolved hypocentre — so the disclosure is restored here at set level, which
 * also covers the matched events a truncated record list never shows.
 *
 * Counts are stated over events carrying a usable depth, and the observed
 * default values are named so a reader can recognise them in the listed rows.
 *
 * Returns null when no matched depth lands on a default value: there is nothing
 * to qualify, and announcing the absence would read as a location-quality
 * finding, which this cannot support.
 */
export function reportedDepthBasisText(
  context: EarthquakePlaceContext
): string | null {
  const coverage = seismicFixedDepthCoverage(context.observations);
  if (coverage.conventionalDefaultValueCount === 0) return null;

  const tally = coverage.byDefaultDepth
    .map(({ depthKm, eventCount }) => `${depthKm} km ×${eventCount}`)
    .join(", ");
  const events = coverage.usableEventCount === 1 ? "event" : "events";
  return (
    "Reported depth sits exactly on a conventional default value for " +
    `${coverage.conventionalDefaultValueCount} of ${coverage.usableEventCount} matched ${events} (${tally}). ` +
    "Analysts fix depth at such values when the phase data cannot resolve it, but the feed publishes no fixed-depth flag " +
    "and a resolved hypocentre can land on the same number — this qualifies the depths shown, it does not rate the locations."
  );
}

/**
 * At most this many gap values are named before the rest are counted. A place
 * on a one-sided margin can put twenty exceeding events in one extent, and the
 * sentence has to stay readable.
 */
const LISTED_AZIMUTHAL_GAP_LIMIT = 3;

/**
 * Say how many matched events USGS documents as weakly located, and by how far.
 *
 * The panel prints an epicentral distance and a hypocentre depth for each listed
 * event, orders the list by that distance, and colours each row by depth class.
 * All four rest on the location solution — and the feed reports how well the
 * recording network constrained it. USGS documents exactly one threshold on
 * these fields: above a 180° azimuthal station gap, locations "typically have
 * large location and depth uncertainties". Events offshore of a coast routinely
 * exceed it, because the stations sit on one side only.
 *
 * The M4.5+ summary feed publishes no horizontalError or depthError at all, so
 * station geometry is the only location-quality information a reader can get
 * here; without this line the distances and depths shown carry no qualifier of
 * any kind. Gap values are named largest first so the worst case is visible, and
 * the count is stated over events that reported a gap rather than over all
 * matched events, so an unreported gap never reads as good coverage.
 *
 * Deliberately says nothing about the events within the threshold: a gap inside
 * the documented range is not a certificate of accuracy, and this qualifies the
 * numbers shown rather than rating the locations behind them.
 *
 * Because it qualifies the numbers shown, it has to know which of them are on
 * screen — hence `listedCount`, the number of rows the caller renders, the same
 * parameter `listedSeismicityOrderNote` takes and for the same reason. The list
 * is ordered nearest first while these events are singled out by azimuthal gap,
 * so a flagged event is not especially likely to be among the rows: measured
 * against the live feed over twenty region-sized extents, the line fired for
 * fourteen, and for five of those every flagged event fell beyond the rows.
 * Those five are exactly the case the wording used to get wrong, by attributing
 * "large location and depth uncertainties" to distances and depths printed for
 * events that were within the documented range.
 *
 * Returns null when no matched event exceeds the documented gap — there is
 * nothing to qualify, and announcing the absence would read as a location-
 * quality finding, which this cannot support.
 */
export function epicenterConstraintText(
  context: EarthquakePlaceContext,
  listedCount: number
): string | null {
  const coverage = summarizeNetworkGeometryCoverage(context.observations);
  const exceedingCount = coverage.byConstraint["exceeds-documented-gap"];
  if (exceedingCount === 0) return null;

  const reportedCount =
    coverage.suppliedEventCount - coverage.byConstraint.unavailable;
  const exceeding = context.observations
    .map((observation, index) => ({
      geometry: seismicNetworkGeometry(observation),
      index,
    }))
    .filter(
      ({ geometry }) =>
        geometry.azimuthalConstraint === "exceeds-documented-gap"
    );
  // How many of the flagged events the reader can actually see. A row count
  // that is missing or nonsensical is treated as "nothing is on screen", which
  // is the reading that claims least.
  const listed =
    Number.isFinite(listedCount) && listedCount > 0 ? listedCount : 0;
  const listedExceedingCount = exceeding.filter(
    ({ index }) => index < listed
  ).length;
  const gaps = exceeding
    .map(({ geometry }) => geometry.azimuthalGapDeg)
    .filter((gap): gap is number => gap !== null)
    .sort((first, second) => second - first);
  const named = gaps.slice(0, LISTED_AZIMUTHAL_GAP_LIMIT);
  const unnamedCount = gaps.length - named.length;
  const values = named.map((gap) => `${gap}°`).join(", ");
  // Only name the ordering when there is an ordering to name: "largest 256°"
  // for a lone value reads as a comparison the sentence never makes.
  const tally =
    gaps.length === 1
      ? values
      : `largest ${values}` +
        (unnamedCount > 0 ? ` and ${unnamedCount} more` : "");
  const events = reportedCount === 1 ? "event" : "events";
  const documented =
    "USGS documents that such locations typically carry large location and depth uncertainties";
  // Which rows the uncertainty actually applies to. The list is ordered by
  // distance and the flagged events are picked by gap, so the two sets come
  // apart routinely: a flagged event can sit anywhere in the matched order, or
  // beyond the rows entirely. Saying "listed for them" regardless pointed the
  // reader at digits that, in the truncated case, belong to other events.
  const consequence =
    listedExceedingCount === 0
      ? `${documented}; none of them is among the events listed below.`
      : listedExceedingCount === exceedingCount
        ? `${documented}, so the distance and depth listed for them are less resolved than their digits suggest.`
        : `${documented}, so the distance and depth listed for the ${listedExceedingCount} of them shown below are less resolved than their digits suggest.`;
  return (
    `Azimuthal station gap exceeds ${DOCUMENTED_MAX_AZIMUTHAL_GAP_DEG}° for ` +
    `${exceedingCount} of ${reportedCount} matched ${events} that reported a gap (${tally}). ` +
    `${consequence} ` +
    "This feed publishes no location-uncertainty values, leaving station geometry as its only " +
    "location-quality signal; a gap within that range is not a certificate of accuracy."
  );
}

/**
 * An epicentral distance with the point it was measured from named.
 *
 * The anchor has to be stated because the feed's own `place` string carries a
 * distance to a *different* anchor: USGS writes "67 km E of
 * Petropavlovsk-Kamchatsky, Russia", measured from that settlement, while this
 * distance is measured from the query point — which `searchExtentEarthquakeQuery`
 * places at the centre of the circle circumscribing the search extent. Rendered
 * side by side as a bare "111 km away", the two figures read as one quantity
 * disagreeing with itself; an event can sit 3 km from a town and 370 km from the
 * centre of the searched extent, and both numbers are correct.
 *
 * The wording matches the scope sentence the panel prints above the list
 * ("Epicentres within N km of the search-extent centre"), so a reader can see
 * that a listed distance and the stated radius are on the same axis.
 */
export function epicentralDistanceText(distanceKm: number): string {
  return `${formatDistanceKm(distanceKm)} km from the search-extent centre`;
}

/** Radii span metropolitan boundaries to whole countries; keep both legible. */
function formatRadiusKm(radiusKm: number): string {
  return radiusKm >= 100 ? String(Math.round(radiusKm)) : radiusKm.toFixed(1);
}

/**
 * What geographic area a nearby-seismicity result was taken over.
 *
 * Two facts, because the searched area is two steps removed from the place the
 * reader typed. `searchExtentEarthquakeQuery` circumscribes the search extent,
 * so the circle reaches outside it — that is the first clause, and its doc
 * comment requires callers to say so. The extent itself is the geocoder's
 * result bounding box rather than the selected place's own outline, which is
 * the second: a rectangle around Iceland or Chile admits a great deal that is
 * not Iceland or Chile.
 *
 * The sibling volcano and plate sections both close their scope sentence with
 * "the exact selected boundary is not tested" (`volcanoExtent`,
 * `plateBoundaryContext`), and the three sections render one after another in
 * the same panel. Marking two of the three implies the unmarked one is
 * boundary-exact, which is backwards here: a circumscribing circle is the
 * loosest of the three fits. The wording is copied verbatim so a reader
 * comparing the sections sees one caveat, not three phrasings of it.
 *
 * The first sentence stays byte-identical to what the panel printed before;
 * the boundary clause is appended rather than woven in, so existing assertions
 * on it continue to hold.
 */
export function searchExtentScopeText(radiusKm: number): string {
  return (
    `Epicentres within ${formatRadiusKm(radiusKm)} km of the search-extent centre — ` +
    "a circle circumscribing the extent, so it reaches past the boundary corners. " +
    "The extent is the search result bounding box; the exact selected boundary is not tested."
  );
}

/**
 * How large a set an empty nearby-seismicity result was compared against.
 *
 * The empty branch tells a reader that no matched event "does not establish the
 * area is seismically quiet" — a statement whose whole force is the size of the
 * set that was searched. That size is already on the coverage, and the same
 * section prints it whenever events do match ("Counted from N valid events in
 * the global feed"), so the one branch that omits it is the branch where a
 * reader most needs it: an empty result measured against a full feed copy and
 * one measured against a copy that parsed down to a handful of events read
 * identically on screen. The plate-boundary section already states its own
 * comparison population under both outcomes ("Compared against N usable
 * supplied polylines"), and this is the same disclosure for the live feed.
 *
 * The verb follows that sibling rather than the matched branch's "Counted
 * from": nothing was counted here, so the figure describes what was searched.
 *
 * This is the feed copy in hand, not a completeness claim — it says how many
 * valid events this search was compared against, and nothing about how many
 * earthquakes occurred. Returns null unless a radial search actually ran and
 * found nothing, so a caller never reports a comparison that did not happen:
 * an invalid query and a copy with no valid events are separate states the
 * section reports in their own words.
 */
export function comparedEventPopulationText(
  context: EarthquakePlaceContext
): string | null {
  const { status, validEventCount } = context.coverage;
  if (status !== "no-events-in-radius") return null;
  // Guards the phrasing rather than the status alone: "no-events-in-radius"
  // already implies at least one valid event, so a zero here would mean the
  // coverage disagreed with itself, and naming it would be worse than silence.
  if (validEventCount <= 0) return null;
  return `Compared against ${validEventCount} valid ${
    validEventCount === 1 ? "event" : "events"
  } in the global feed.`;
}

/**
 * When USGS generated the feed copy a listed selection was drawn from.
 *
 * {@link USGS_M45_MONTH_SOURCE}'s `feedWindow` already tells a reader the
 * selection is a "rolling past 30 days at source retrieval time" — a phrase
 * that names an instant and then leaves it unstated. The feed publishes that
 * instant as `metadata.generated`, and the window really is measured back from
 * it: in a sampled copy the oldest event sat 29.97 days before the stamp.
 *
 * It matters because nothing refreshes. The page fetches this feed once, so the
 * 30 days on screen are the 30 before that fetch, not the 30 before now, and a
 * copy served from HTTP cache can be older still. Unstamped, "No recorded
 * events" reads as a statement about the present rather than about a window
 * that stopped advancing when the page loaded.
 *
 * The sibling volcano section already dates its own snapshot ("Bundled GVP
 * snapshot retrieved <month> (UTC)", read from the bundled file's provenance
 * rather than pasted here, so this comment cannot drift); this is the same
 * disclosure for the one geology source that is live rather than bundled. A missing stamp is reported
 * rather than skipped, for the same reason that section reports a missing
 * retrieval month.
 *
 * Minute precision: USGS regenerates these summary feeds every few minutes, so
 * seconds would imply a currency the copy does not keep, while a bare date
 * would not separate a copy fetched this morning from one fetched tonight.
 */
export function feedGenerationText(generatedTime: number | null): string {
  const unstated =
    "This feed copy published no generation time, so the end of its 30-day window is unstated.";
  if (generatedTime === null || !Number.isFinite(generatedTime))
    return unstated;
  const generated = new Date(generatedTime);
  // A finite epoch value can still be outside the range Date can represent, and
  // toISOString throws on those rather than returning a marker. Treat an
  // unrepresentable stamp as no stamp instead of failing the whole panel.
  if (Number.isNaN(generated.getTime())) return unstated;
  const stamp = generated.toISOString().slice(0, 16).replace("T", " ");
  return `USGS generated this feed copy ${stamp} UTC; its 30-day window ends there and does not advance while this page stays open.`;
}

/** Distances span city blocks to whole countries; keep both legible. */
function formatDistanceKm(distanceKm: number): string {
  return distanceKm >= 10
    ? String(Math.round(distanceKm))
    : distanceKm.toFixed(1);
}

function compareObservations(
  first: NearbyEarthquakeObservation,
  second: NearbyEarthquakeObservation
): number {
  return (
    first.distanceKm - second.distanceKm ||
    second.time - first.time ||
    second.magnitude - first.magnitude ||
    compareNullablePlace(first.place, second.place)
  );
}

function compareNullablePlace(
  first: string | null,
  second: string | null
): number {
  if (first === null) return second === null ? 0 : 1;
  if (second === null) return -1;
  return first.localeCompare(second);
}

function isValidEarthquake(earthquake: Earthquake): boolean {
  return (
    Number.isFinite(earthquake.lat) &&
    Math.abs(earthquake.lat) <= 90 &&
    Number.isFinite(earthquake.lon) &&
    Math.abs(earthquake.lon) <= 180 &&
    Number.isFinite(earthquake.depthKm) &&
    Number.isFinite(earthquake.magnitude) &&
    Number.isFinite(earthquake.time)
  );
}

function queryValidationErrors(
  query: EarthquakePlaceQuery
): EarthquakePlaceQueryField[] {
  const invalid: EarthquakePlaceQueryField[] = [];
  if (!Number.isFinite(query.latitude) || Math.abs(query.latitude) > 90) {
    invalid.push("latitude");
  }
  if (!Number.isFinite(query.longitude) || Math.abs(query.longitude) > 180) {
    invalid.push("longitude");
  }
  if (!Number.isFinite(query.radiusKm) || query.radiusKm < 0) {
    invalid.push("radiusKm");
  }
  return invalid;
}
