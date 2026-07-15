import { Vector3 } from "three";
import { greatCircleDistance, latLngToVector3, vector3ToLatLng } from "./geo";
import {
  SEISMICITY_SOURCE,
  SEISMICITY_UNITS,
  type Earthquake,
} from "./earthquakes";

/**
 * Descriptive epicentral spatial dispersion for a supplied set of USGS events.
 *
 * seismicDepthProfile (see seismicDepthProfile.ts) summarizes how deep the
 * events are; magnitudeFrequency and seismicMoment summarize how big they are.
 * This module adds the complementary geography — how spatially *concentrated*
 * the epicentres are — so a place panel or export can distinguish a tight
 * aftershock cluster from a set of events scattered around the globe whose
 * depth and magnitude summaries alone would look identical.
 *
 * Epicentres are points on a sphere, so their location must never be summarized
 * by arithmetically averaging latitude and longitude: that mean is wrong across
 * the ±180° meridian (a set straddling the dateline averages to longitude ~0°,
 * the opposite side of the Earth) and near the poles, where longitude
 * converges. The correct centroid is the *mean direction* — the normalized sum
 * of the epicentres' unit position vectors — which this module computes by
 * reusing the app's own lat/lon ↔ unit-vector conversions (geo.ts). This is the
 * spatial analogue of never averaging magnitudes (seismicMoment.ts) or class
 * codes (earthquakes.ts): use the aggregation the quantity's geometry allows.
 *
 * The concentration measure is the mean resultant length R ∈ [0, 1] from
 * directional statistics: the length of the averaged unit vectors. R → 1 when
 * epicentres coincide, and R → 0 when they are dispersed over the sphere (or
 * cancel antipodally). When R is essentially zero the mean direction — and
 * therefore the centroid and the distances measured from it — is undefined, so
 * both are reported as null rather than as a misleading (0°, 0°) point.
 *
 * This is a descriptive summary of the epicentres reported by the feed. It is
 * NOT a hazard footprint, a source-zone delineation, a rupture area, or a
 * forecast, and the M4.5+ / rolling-30-day feed determines which events are
 * present, so the dispersion describes the supplied set, not tectonic reality.
 *
 * Pure, render-free logic (see seismicDispersion.test.ts).
 *
 * Reference: Mardia, K. V. & Jupp, P. E. (2000), "Directional Statistics",
 * Wiley — mean direction and mean resultant length of points on a sphere.
 */

export const SEISMIC_DISPERSION_UNITS = {
  ...SEISMICITY_UNITS,
  coordinates: "decimal degrees",
  distance: "km (epicentral great-circle distance)",
  meanResultantLength: "dimensionless (0–1)",
} as const;

/** Earth's mean radius in kilometres, matching the distance unit above. */
const EARTH_RADIUS_KM = 6371;

/**
 * A resultant-vector length (as a fraction of the event count) at or below this
 * threshold is treated as an undefined mean direction. It absorbs the
 * floating-point residue of a genuinely cancelling (antipodal / uniformly
 * spread) set so the centroid is reported as null rather than an artefact of
 * rounding.
 */
const MIN_RESULTANT_LENGTH = 1e-9;

/** The spherical centroid (mean direction) of a set of epicentres. */
export interface EpicentralCentroid {
  /** Mean-direction latitude in degrees, in [-90, 90]. */
  latitude: number;
  /** Mean-direction longitude in degrees, in [-180, 180]. */
  longitude: number;
}

/**
 * Spatial spread of the epicentres about their centroid. Distances are
 * great-circle surface distances (haversine on a spherical Earth); the mean
 * resultant length is a unit-free concentration index.
 */
export interface EpicentralDispersion {
  /**
   * Mean resultant length R ∈ [0, 1]: 1 when every epicentre coincides,
   * approaching 0 as they spread over the sphere or cancel antipodally.
   */
  meanResultantLength: number;
  /** Mean great-circle distance from each epicentre to the centroid (km). */
  meanDistanceKm: number;
  /** Median great-circle distance from each epicentre to the centroid (km). */
  medianDistanceKm: number;
  /** Largest great-circle distance from any epicentre to the centroid (km). */
  maxDistanceKm: number;
}

/**
 * A descriptive aggregation of supplied events' epicentres, not a hazard
 * footprint, source zone, or forecast. `centroid` and `dispersion` are null
 * together when no supplied event carried a finite coordinate pair, or when the
 * epicentres cancel so the mean direction is undefined — both cases making an
 * unusable basis explicit rather than emitting a spurious point.
 */
export interface SeismicDispersionProfile {
  kind: "usgs-seismic-spatial-dispersion";
  isForecast: false;
  suppliedEventCount: number;
  usableEventCount: number;
  centroid: EpicentralCentroid | null;
  dispersion: EpicentralDispersion | null;
  source: typeof SEISMICITY_SOURCE;
  units: typeof SEISMIC_DISPERSION_UNITS;
  limitations: readonly string[];
}

const LIMITATIONS = [
  "Describes only the reported epicentres of the valid events supplied to this helper; it is not a hazard footprint, a source-zone delineation, a rupture area, or a forecast.",
  "The centroid is the spherical mean direction, not the arithmetic mean of latitude and longitude, which would be wrong across the ±180° meridian and near the poles; when the epicentres cancel (antipodal or uniform spread) the mean direction is undefined and centroid and dispersion are null.",
  "Distances are great-circle surface distances on a spherical Earth (radius 6371 km); the ellipsoidal figure of the Earth is neglected (sub-0.5% error).",
  "The rendered feed is filtered to M4.5+ over a rolling 30-day window, so which epicentres are present — and therefore how concentrated they appear — reflects that sampling, not the full distribution of seismicity.",
] as const;

/** Ascending-sorted median of a non-empty array (mean of the two central values when even). */
function medianSorted(sorted: readonly number[]): number {
  const lastIndex = sorted.length - 1;
  const mid = lastIndex / 2;
  const lower = Math.floor(mid);
  const upper = Math.ceil(mid);
  return (sorted[lower] + sorted[upper]) / 2;
}

/**
 * Summarize the spatial dispersion of the supplied events' epicentres,
 * retaining source and native unit labels. Events without a finite coordinate
 * pair are excluded from the centroid and distances but still counted in
 * suppliedEventCount so the basis of the summary stays auditable.
 */
export function seismicDispersion(
  earthquakes: readonly Earthquake[]
): SeismicDispersionProfile {
  const epicentres = earthquakes.filter(
    ({ lat, lon }) =>
      Number.isFinite(lat) &&
      Number.isFinite(lon) &&
      Math.abs(lat) <= 90 &&
      Math.abs(lon) <= 180
  );

  let centroid: EpicentralCentroid | null = null;
  let dispersion: EpicentralDispersion | null = null;

  if (epicentres.length > 0) {
    // Sum the epicentres' unit position vectors, then normalize: the direction
    // is the spherical mean (centroid) and the length/N is the mean resultant
    // length R. Reusing latLngToVector3/vector3ToLatLng keeps this consistent
    // with how the app already maps coordinates to the globe; the fixed
    // longitude offset in that mapping is a rotation shared by every point and
    // is inverted by vector3ToLatLng, so it does not bias the mean direction,
    // and R is rotation-invariant.
    const resultant = new Vector3();
    for (const { lat, lon } of epicentres) {
      resultant.add(latLngToVector3(lat, lon, 1));
    }
    const meanResultantLength = resultant.length() / epicentres.length;

    if (resultant.length() > MIN_RESULTANT_LENGTH) {
      const { lat, lon } = vector3ToLatLng(resultant);
      centroid = { latitude: lat, longitude: lon };

      const distances = epicentres
        .map(({ lat: eqLat, lon: eqLon }) =>
          greatCircleDistance(lat, lon, eqLat, eqLon, EARTH_RADIUS_KM)
        )
        .sort((first, second) => first - second);

      dispersion = {
        meanResultantLength,
        meanDistanceKm:
          distances.reduce((sum, value) => sum + value, 0) / distances.length,
        medianDistanceKm: medianSorted(distances),
        maxDistanceKm: distances[distances.length - 1],
      };
    }
  }

  return {
    kind: "usgs-seismic-spatial-dispersion",
    isForecast: false,
    suppliedEventCount: earthquakes.length,
    usableEventCount: epicentres.length,
    centroid,
    dispersion,
    source: SEISMICITY_SOURCE,
    units: SEISMIC_DISPERSION_UNITS,
    limitations: LIMITATIONS,
  };
}
