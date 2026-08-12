import {
  SEISMICITY_SOURCE,
  type Earthquake,
  type EarthquakeSourceRecord,
} from "./earthquakes";

/**
 * How well the recording network constrained a reported USGS hypocentre.
 *
 * The globe draws every M4.5+ event from the summary feed as an identical
 * marker, coloured only by depth class. Some of those epicentres are far better
 * determined than others, and the feed says so: `gap`, `nst`, `dmin` and `rms`
 * describe the station geometry the location was solved from. This module reads
 * those retained fields (see earthquakes.ts) and reports what USGS documents
 * about them — nothing more.
 *
 * Deliberately narrow. USGS documents exactly one threshold on this data:
 * "Earthquake locations in which the azimuthal gap exceeds 180 degrees typically
 * have large location and depth uncertainties." So the azimuthal classification
 * here is two-state around 180° rather than a graded good/fair/poor scale, which
 * would require cutoffs the source does not publish. `dmin`, `nst` and `rms` are
 * reported as measured, with their documented direction of improvement noted,
 * but they are NOT binned — no thresholds exist to bin them against.
 *
 * This describes how well a location was *determined*. It is not a measure of
 * the earthquake's size or energy, not ground-shaking intensity, not a hazard
 * assessment, and not a forecast. A well-constrained location says nothing about
 * whether an event was damaging, and a poorly-constrained one is not a less real
 * earthquake.
 *
 * Field definitions: ANSS ComCat event terms
 * (https://earthquake.usgs.gov/data/comcat/data-eventterms.php).
 *
 * Pure, render-free logic (see seismicNetworkGeometry.test.ts).
 */

/**
 * The only azimuthal-gap threshold USGS publishes for this data: above it,
 * location and depth uncertainties are documented as typically large.
 */
export const DOCUMENTED_MAX_AZIMUTHAL_GAP_DEG = 180;

/**
 * USGS states that 1 degree of `dmin` is approximately 111.2 km. Used only to
 * express the reported station distance in kilometres; the degree value stays
 * the authoritative retained measurement.
 */
export const DMIN_DEGREES_TO_KM = 111.2;

export const NETWORK_GEOMETRY_UNITS = {
  azimuthalGap: "degrees",
  nearestStationDistance: "degrees (≈111.2 km per degree)",
  travelTimeResidual: "seconds",
  stationCount: "stations",
} as const;

/**
 * Whether the station azimuths around an epicentre stayed inside the range USGS
 * documents as ordinarily reliable. "unavailable" means the feed supplied no
 * usable gap, which is a reporting state, not a quality verdict.
 */
export type EpicenterAzimuthalConstraint =
  "within-documented-gap" | "exceeds-documented-gap" | "unavailable";

/**
 * A source-faithful reading of one event's network geometry. Every measurement
 * is the feed's own value; `isForecast` is present so consumers can assert this
 * is descriptive, matching the other seismic descriptors.
 */
export interface SeismicNetworkGeometry {
  kind: "usgs-seismic-network-geometry";
  isForecast: false;
  /**
   * Two-state azimuthal classification against the documented 180° condition.
   */
  azimuthalConstraint: EpicenterAzimuthalConstraint;
  /** Reported largest azimuthal gap in degrees; null when unavailable. */
  azimuthalGapDeg: number | null;
  /** Reported station count used in the location; null when unavailable. */
  stationCount: number | null;
  /** Reported epicentre-to-nearest-station distance in degrees. */
  nearestStationDeg: number | null;
  /** The same distance in kilometres via the documented conversion. */
  nearestStationKm: number | null;
  /** Reported RMS travel-time residual of the location fit, in seconds. */
  travelTimeResidualS: number | null;
  source: typeof SEISMICITY_SOURCE;
  units: typeof NETWORK_GEOMETRY_UNITS;
  limitations: readonly string[];
}

const LIMITATIONS = [
  "Describes how well the reporting network constrained the location of the supplied event; it is not a measure of earthquake size, ground-shaking intensity, damage, hazard, or a forecast.",
  "USGS documents a single threshold on this data — an azimuthal gap above 180° typically implies large location and depth uncertainties — so the classification is two-state; no graded quality scale is published for these fields.",
  "Station count, nearest-station distance, and RMS residual are reported as supplied and deliberately not binned into classes, because USGS publishes no cutoffs for them.",
  "A within-range azimuthal gap does not certify an accurate location: RMS residual depends on the velocity model and station set, and depth remains the least-constrained location parameter regardless of azimuthal coverage.",
  "Absent fields read as unavailable rather than as good or poor coverage; the M4.5+ summary feed omits the horizontalError and depthError uncertainties entirely, which is why network geometry is the only location-quality information it carries.",
] as const;

/**
 * Classify the azimuthal station coverage behind a reported location. The
 * comparison is strictly greater-than, so a gap of exactly 180° reads as within
 * the documented range — USGS's condition is "exceeds 180 degrees".
 */
export function epicenterAzimuthalConstraint(
  record: EarthquakeSourceRecord | null | undefined
): EpicenterAzimuthalConstraint {
  const gap = record?.azimuthalGapDeg;
  if (typeof gap !== "number" || !Number.isFinite(gap)) return "unavailable";
  return gap > DOCUMENTED_MAX_AZIMUTHAL_GAP_DEG
    ? "exceeds-documented-gap"
    : "within-documented-gap";
}

/**
 * Convert a reported `dmin` in degrees to kilometres using the conversion USGS
 * publishes alongside the field. Null in, null out, so an unavailable distance
 * never becomes a concrete 0 km.
 */
export function nearestStationDistanceKm(
  nearestStationDeg: number | null | undefined
): number | null {
  if (
    typeof nearestStationDeg !== "number" ||
    !Number.isFinite(nearestStationDeg) ||
    nearestStationDeg < 0
  ) {
    return null;
  }
  return nearestStationDeg * DMIN_DEGREES_TO_KM;
}

/** Read one event's retained network-geometry fields, with provenance. */
export function seismicNetworkGeometry(
  earthquake: Earthquake
): SeismicNetworkGeometry {
  const record = earthquake.sourceRecord ?? null;
  const nearestStationDeg = record?.nearestStationDeg ?? null;
  return {
    kind: "usgs-seismic-network-geometry",
    isForecast: false,
    azimuthalConstraint: epicenterAzimuthalConstraint(record),
    azimuthalGapDeg: record?.azimuthalGapDeg ?? null,
    stationCount: record?.stationCount ?? null,
    nearestStationDeg,
    nearestStationKm: nearestStationDistanceKm(nearestStationDeg),
    travelTimeResidualS: record?.travelTimeResidualS ?? null,
    source: SEISMICITY_SOURCE,
    units: NETWORK_GEOMETRY_UNITS,
    limitations: LIMITATIONS,
  };
}

/**
 * A short readout note for an event whose epicentre is documented as weakly
 * constrained, or null when there is nothing exceptional to say. Returning null
 * for the ordinary case keeps a marker readout quiet unless the source itself
 * flags the location — the note reports the network geometry, and states the
 * consequence in USGS's own terms rather than rating the event.
 */
export function networkGeometryNote(earthquake: Earthquake): string | null {
  const geometry = seismicNetworkGeometry(earthquake);
  if (geometry.azimuthalConstraint !== "exceeds-documented-gap") return null;
  const gap = geometry.azimuthalGapDeg;
  return `azimuthal station gap ${gap}° (>180°): USGS documents large location and depth uncertainty`;
}

/**
 * Feed-level tally of azimuthal constraint across supplied events. Counts only —
 * the constraint is a category and is never averaged into a score. Use this to
 * state how much of a rendered event set carries a weakly constrained location.
 */
export interface NetworkGeometryCoverage {
  kind: "usgs-seismic-network-geometry-coverage";
  isForecast: false;
  suppliedEventCount: number;
  /** One count per constraint state; the three sum to suppliedEventCount. */
  byConstraint: Record<EpicenterAzimuthalConstraint, number>;
  source: typeof SEISMICITY_SOURCE;
  limitations: readonly string[];
}

export function summarizeNetworkGeometryCoverage(
  earthquakes: readonly Earthquake[]
): NetworkGeometryCoverage {
  const byConstraint: Record<EpicenterAzimuthalConstraint, number> = {
    "within-documented-gap": 0,
    "exceeds-documented-gap": 0,
    unavailable: 0,
  };
  for (const earthquake of earthquakes) {
    byConstraint[epicenterAzimuthalConstraint(earthquake.sourceRecord)] += 1;
  }
  return {
    kind: "usgs-seismic-network-geometry-coverage",
    isForecast: false,
    suppliedEventCount: earthquakes.length,
    byConstraint,
    source: SEISMICITY_SOURCE,
    limitations: LIMITATIONS,
  };
}
