/**
 * Solar position for the globe.
 *
 * The equations are the ones NOAA publishes in its solar calculator
 * (https://gml.noaa.gov/grad/solcalc/, public domain). Declination is the
 * subsolar latitude. Longitude follows from the equation of time so that
 * local solar time is noon at that meridian. `sunDirection` uses the same
 * axis mapping as `latLngToVector3` in geo.ts: +Y is north, and the prime
 * meridian matches a Three.js SphereGeometry.
 *
 * No network and no textures. Issue #1200 (Black Marble) can light the night
 * side later; this module only answers where the sun is.
 */

export interface SubsolarPoint {
  /** Degrees, north positive. Equal to the solar declination. */
  lat: number;
  /** Degrees, east positive, in [-180, 180]. */
  lon: number;
}

export interface SunVector {
  x: number;
  y: number;
  z: number;
}

export interface MonthRef {
  year: number;
  /** 1 through 12. */
  month: number;
}

/**
 * Which clock each surface should use.
 *
 * The satellite base map is "now". A monthly science layer keeps the 15th,
 * so the declination belongs to that month, and the hour of `now`, so the
 * terminator moves through the day instead of sitting at noon.
 */
export interface IlluminationQuery {
  now: Date;
  month?: MonthRef | null;
  /** True when a monthly (not annual, not static) layer is on screen. */
  monthlyLayerVisible: boolean;
}

export interface IlluminationInstants {
  /** Sun time for the satellite and terrain imagery. */
  satellite: Date;
  /** Sun time for a monthly science layer, or null when none is showing. */
  monthly: Date | null;
}

const DEG = Math.PI / 180;

function julianDay(date: Date): number {
  let year = date.getUTCFullYear();
  let month = date.getUTCMonth() + 1;
  const day = date.getUTCDate();
  if (month <= 2) {
    year -= 1;
    month += 12;
  }
  const a = Math.floor(year / 100);
  const b = 2 - a + Math.floor(a / 4);
  const midnight =
    Math.floor(365.25 * (year + 4716)) +
    Math.floor(30.6001 * (month + 1)) +
    day +
    b -
    1524.5;
  const fraction =
    (date.getUTCHours() * 3600 +
      date.getUTCMinutes() * 60 +
      date.getUTCSeconds() +
      date.getUTCMilliseconds() / 1000) /
    86400;
  return midnight + fraction;
}

function julianCentury(jd: number): number {
  return (jd - 2451545.0) / 36525.0;
}

function wrapDegrees(angle: number): number {
  let value = angle % 360;
  if (value > 360) value -= 360;
  if (value < 0) value += 360;
  return value;
}

function geomMeanLongSun(t: number): number {
  return wrapDegrees(280.46646 + t * (36000.76983 + t * 0.0003032));
}

function geomMeanAnomalySun(t: number): number {
  return 357.52911 + t * (35999.05029 - 0.0001537 * t);
}

function eccentricityEarthOrbit(t: number): number {
  return 0.016708634 - t * (0.000042037 + 0.0000001267 * t);
}

function sunEqOfCenter(t: number): number {
  const m = geomMeanAnomalySun(t) * DEG;
  return (
    Math.sin(m) * (1.914602 - t * (0.004817 + 0.000014 * t)) +
    Math.sin(m + m) * (0.019993 - 0.000101 * t) +
    Math.sin(m + m + m) * 0.000289
  );
}

function obliquityCorrection(t: number): number {
  const seconds = 21.448 - t * (46.815 + t * (0.00059 - t * 0.001813));
  const e0 = 23 + (26 + seconds / 60) / 60;
  const omega = 125.04 - 1934.136 * t;
  return e0 + 0.00256 * Math.cos(omega * DEG);
}

function sunApparentLong(t: number): number {
  const omega = 125.04 - 1934.136 * t;
  return (
    geomMeanLongSun(t) +
    sunEqOfCenter(t) -
    0.00569 -
    0.00478 * Math.sin(omega * DEG)
  );
}

/** Solar declination in degrees. NOAA `calcSunDeclination`. */
export function solarDeclination(date: Date): number {
  const t = julianCentury(julianDay(date));
  const obliquity = obliquityCorrection(t);
  const lambda = sunApparentLong(t);
  return Math.asin(Math.sin(obliquity * DEG) * Math.sin(lambda * DEG)) / DEG;
}

/** Equation of time in minutes. NOAA `calcEquationOfTime`. Positive: sun fast. */
export function equationOfTimeMinutes(date: Date): number {
  const t = julianCentury(julianDay(date));
  const epsilon = obliquityCorrection(t) * DEG;
  const l0 = geomMeanLongSun(t) * DEG;
  const e = eccentricityEarthOrbit(t);
  const m = geomMeanAnomalySun(t) * DEG;
  const y = Math.tan(epsilon / 2);
  const yy = y * y;
  const eTime =
    yy * Math.sin(2 * l0) -
    2 * e * Math.sin(m) +
    4 * e * yy * Math.sin(m) * Math.cos(2 * l0) -
    0.5 * yy * yy * Math.sin(4 * l0) -
    1.25 * e * e * Math.sin(2 * m);
  return (eTime / DEG) * 4;
}

function wrapLongitude(lon: number): number {
  const wrapped = ((((lon + 180) % 360) + 360) % 360) - 180;
  return Object.is(wrapped, -0) ? 0 : wrapped;
}

/** The point on Earth where the sun is overhead at `date`. */
export function subsolarPoint(date: Date): SubsolarPoint {
  const utcMinutes =
    date.getUTCHours() * 60 +
    date.getUTCMinutes() +
    date.getUTCSeconds() / 60 +
    date.getUTCMilliseconds() / 60000;
  // NOAA solar noon: 720 - 4*longitude - eot = clock minutes at that meridian.
  // Solving for the meridian where solar noon is this UTC instant.
  const lon = (720 - utcMinutes - equationOfTimeMinutes(date)) / 4;
  return { lat: solarDeclination(date), lon: wrapLongitude(lon) };
}

/**
 * Unit vector pointing from the globe's centre toward the sun, in the same
 * space as the unit sphere (see geo.ts). A DirectionalLight sits along it.
 */
export function sunDirection(date: Date): SunVector {
  const { lat, lon } = subsolarPoint(date);
  const phi = (90 - lat) * DEG;
  const theta = (lon + 180) * DEG;
  return {
    x: -Math.sin(phi) * Math.cos(theta),
    y: Math.cos(phi),
    z: Math.sin(phi) * Math.sin(theta),
  };
}

/**
 * 15th of the month. Noon when no clock is passed (the middle of the
 * composite). With a clock, the hour is that clock's UTC time, so a live
 * view keeps the month's season and still turns with the day.
 */
export function monthlyLayerInstant(month: MonthRef, clock?: Date): Date {
  return new Date(
    Date.UTC(
      month.year,
      month.month - 1,
      15,
      clock ? clock.getUTCHours() : 12,
      clock ? clock.getUTCMinutes() : 0,
      clock ? clock.getUTCSeconds() : 0,
      clock ? clock.getUTCMilliseconds() : 0
    )
  );
}

/**
 * Sun times for the two surfaces. Later features (night lights, the
 * atmosphere) should read this instead of inventing a clock.
 */
export function illuminationInstants(
  query: IlluminationQuery
): IlluminationInstants {
  const monthly =
    query.monthlyLayerVisible && query.month
      ? monthlyLayerInstant(query.month, query.now)
      : null;
  return { satellite: query.now, monthly };
}
