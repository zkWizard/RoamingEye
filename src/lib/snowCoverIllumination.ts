import { MONTH_NAMES, type DatasetRef } from "./timeline";
import { SNOW_COVER_DATASET, SNOW_COVER_LIMITATIONS } from "./snowCover";

/**
 * When a latitude is too dark for MOD10CM to see snow at all (cryosphere).
 *
 * Every other snow helper here describes values the product returned. This one
 * answers the question that comes *before* them: at this latitude, in this
 * calendar month, could MODIS have observed anything? MOD10CM is an optical
 * product — it maps snow from reflected sunlight — so where the sun does not
 * rise, or barely clears the horizon, there is no observation to average, and
 * `SNOW_COVER_LIMITATIONS` already warns that "polar-darkness gaps can depress
 * the covered-area value". This module makes that standing caveat specific:
 * it says *which* months, at *which* latitude, cannot carry a measurement.
 *
 * The geometry is exact and needs no network. The sun's elevation peaks at
 * local solar noon at `90° - |latitude - declination|`, so a day has no sunrise
 * when that peak is at or below zero, and a month is unobservable when its
 * best day never clears the retrieval floor below.
 *
 * Two things this is deliberately *not*:
 *
 *  - Not a per-year ephemeris. It is a climatological property of latitude —
 *    "which calendar months can be seen here" — computed on a fixed 365-day
 *    reference year, so it takes no year argument. Day-level dates shift by
 *    about a day across the leap cycle; the monthly answer does not.
 *  - Not a claim about what the pixel contains. Measured 2026-08-11 against
 *    GIBS: at six Arctic land sites the product returned *nothing* in dark
 *    months, but over the Antarctic plateau it returned a filled 100% value
 *    year-round, through full polar night. So darkness does not have one
 *    rendered signature, and a filled dark-month pixel is not evidence that an
 *    observation was made. Callers should withhold or caveat such months
 *    rather than read them as measurements; this module names them, and never
 *    infers depth, snow-water-equivalent, melt, runoff, cause, or any future
 *    value.
 *
 * Pure, render-free logic (see snowCoverIllumination.test.ts). Provenance is
 * inherited from ./snowCover so a publication cites MOD10CM, not the picture.
 */

/**
 * Solar-noon elevation, in degrees, at or above which a month is treated as
 * carrying a usable MOD10CM retrieval.
 *
 * A reporting convention of this app, not a published product threshold — but
 * an empirically anchored one. Measured 2026-08-11 over six Arctic land sites
 * across all twelve months of 2024 (72 site-months, GIBS WMS): all 17 months
 * whose peak noon elevation was at or below 4.0° returned no snow pixels
 * whatever, and the lowest-peaking month that returned any returned almost
 * none — 4% of its cells, at a 4.9° peak. Five degrees sits in that gap.
 *
 * The converse does not hold and is not claimed: brightly lit months came back
 * blank too, because snow-free ground renders transparent. Absence is
 * therefore not a signature of darkness, which is the whole reason this is
 * computed from geometry rather than read off the imagery. A different floor
 * would classify a different set of months; the elevation itself is reported
 * alongside the class so a reader can re-judge.
 */
export const SNOW_RETRIEVAL_MIN_NOON_ELEVATION_DEG = 5;

/** Day counts of the fixed 365-day reference year, January first. */
const REFERENCE_MONTH_DAYS = [
  31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31,
] as const;

export type SnowIlluminationClass = "polar-night" | "low-sun" | "sunlit";

export interface SnowIlluminationMonth {
  /** Calendar month, 1-12. */
  month: number;
  label: string;
  class: SnowIlluminationClass;
  /** Days of the month on which the sun never rises. */
  polarNightDays: number;
  daysInMonth: number;
  /** The month's best solar-noon elevation, in degrees (negative when dark). */
  maxNoonElevationDeg: number;
}

/** Extra caveats specific to reducing solar geometry to an observability call. */
export const SNOW_ILLUMINATION_LIMITATIONS = [
  ...SNOW_COVER_LIMITATIONS,
  "Observability is solar geometry only; a sunlit month can still be cloud-obscured, and this makes no claim about cloud.",
  "The retrieval floor is a reporting convention anchored to measured GIBS behaviour, not a published product threshold; a different floor would classify a different set of months.",
  "Elevations are geometric, for the centre of the sun's disc; refraction and the solar radius lift the apparent sun by roughly 0.8°, shifting a boundary by about a day.",
  "A dark month is not reliably blank — over the Antarctic plateau the product returned a filled value through full polar night — so a value present in an unobservable month must not be read as a measurement of it.",
] as const;

export interface SnowIlluminationProfile {
  kind: "snow-cover-illumination-window";
  /** Explicitly prevents consumers from treating this as a forecast. */
  isForecast: false;
  dataset: DatasetRef;
  latitude: number;
  /** All twelve calendar months, January first. */
  months: readonly SnowIlluminationMonth[];
  /** Months in which the sun never rises on any day. */
  polarNightMonths: readonly SnowIlluminationMonth[];
  /** Months with a sunrise whose noon sun still stays under the floor. */
  lowSunMonths: readonly SnowIlluminationMonth[];
  /** True when every calendar month clears the retrieval floor. */
  observableYearRound: boolean;
  limitations: readonly string[];
}

/**
 * Solar declination in degrees for a day of the 365-day reference year.
 *
 * Spencer's (1971) Fourier series, as tabulated by Iqbal (1983) — accurate to
 * better than 0.04°, which is far finer than the ~0.8° refraction offset the
 * geometric convention already accepts. Returns null outside 1-365.
 */
export function solarDeclinationDeg(dayOfYear: number): number | null {
  if (!Number.isInteger(dayOfYear) || dayOfYear < 1 || dayOfYear > 365) {
    return null;
  }
  const angle = (2 * Math.PI * (dayOfYear - 1)) / 365;
  const radians =
    0.006918 -
    0.399912 * Math.cos(angle) +
    0.070257 * Math.sin(angle) -
    0.006758 * Math.cos(2 * angle) +
    0.000907 * Math.sin(2 * angle) -
    0.002697 * Math.cos(3 * angle) +
    0.00148 * Math.sin(3 * angle);
  return (radians * 180) / Math.PI;
}

/**
 * The sun's elevation at local solar noon, in degrees, for a latitude and day
 * of the reference year. Negative when the sun stays below the horizon all
 * day. Null when either argument is out of range.
 */
export function noonSolarElevationDeg(
  latitude: number,
  dayOfYear: number
): number | null {
  if (!Number.isFinite(latitude) || Math.abs(latitude) > 90) return null;
  const declination = solarDeclinationDeg(dayOfYear);
  if (declination === null) return null;
  return 90 - Math.abs(latitude - declination);
}

/**
 * Classify one calendar month at one latitude. Null for a non-finite or
 * out-of-range latitude, or a month outside 1-12.
 */
export function describeMonthIllumination(
  latitude: number,
  month: number
): SnowIlluminationMonth | null {
  if (!Number.isFinite(latitude) || Math.abs(latitude) > 90) return null;
  if (!Number.isInteger(month) || month < 1 || month > 12) return null;

  const daysInMonth = REFERENCE_MONTH_DAYS[month - 1];
  let firstDay = 1;
  for (let m = 0; m < month - 1; m++) firstDay += REFERENCE_MONTH_DAYS[m];

  let polarNightDays = 0;
  let maxNoonElevationDeg = -Infinity;
  for (let day = 0; day < daysInMonth; day++) {
    const elevation = noonSolarElevationDeg(latitude, firstDay + day);
    if (elevation === null) continue;
    if (elevation <= 0) polarNightDays++;
    if (elevation > maxNoonElevationDeg) maxNoonElevationDeg = elevation;
  }

  // Classified on the month's *best* day: one usable day is enough for the
  // monthly average to carry an observation, so the peak — not the mean —
  // decides. The polar-night tally rides along so a caller can see how much
  // of a "sunlit" month was nonetheless dark.
  const illuminationClass: SnowIlluminationClass =
    polarNightDays === daysInMonth
      ? "polar-night"
      : maxNoonElevationDeg < SNOW_RETRIEVAL_MIN_NOON_ELEVATION_DEG
        ? "low-sun"
        : "sunlit";

  return {
    month,
    label: MONTH_NAMES[month - 1],
    class: illuminationClass,
    polarNightDays,
    daysInMonth,
    maxNoonElevationDeg,
  };
}

/**
 * The full twelve-month observability profile for a latitude, or null when the
 * latitude is not a usable coordinate.
 */
export function describeSnowIllumination(
  latitude: number
): SnowIlluminationProfile | null {
  const months: SnowIlluminationMonth[] = [];
  for (let month = 1; month <= 12; month++) {
    const described = describeMonthIllumination(latitude, month);
    if (!described) return null;
    months.push(described);
  }
  const polarNightMonths = months.filter((m) => m.class === "polar-night");
  const lowSunMonths = months.filter((m) => m.class === "low-sun");
  return {
    kind: "snow-cover-illumination-window",
    isForecast: false,
    dataset: SNOW_COVER_DATASET,
    latitude,
    months,
    polarNightMonths,
    lowSunMonths,
    observableYearRound:
      polarNightMonths.length === 0 && lowSunMonths.length === 0,
    limitations: SNOW_ILLUMINATION_LIMITATIONS,
  };
}

/**
 * One sentence naming the months a snow record at this latitude cannot have
 * observed, or null where the whole year is observable — which is everywhere
 * equatorward of 63.3°, i.e. for most of the globe this says nothing and costs
 * the reader nothing.
 */
export function snowIlluminationNote(latitude: number): string | null {
  // Deliberately walks the months itself rather than reading the full profile:
  // this is the one entry point the app bundles, and going through
  // describeSnowIllumination would drag the cited-profile machinery — and the
  // whole ./snowCover limitation catalogue — into the shipped chunk with it.
  const polarNight: string[] = [];
  const lowSun: string[] = [];
  for (let month = 1; month <= 12; month++) {
    const described = describeMonthIllumination(latitude, month);
    if (!described) return null;
    if (described.class === "polar-night") polarNight.push(described.label);
    else if (described.class === "low-sun") lowSun.push(described.label);
  }
  if (polarNight.length === 0 && lowSun.length === 0) return null;

  const clauses: string[] = [];
  if (polarNight.length > 0) {
    clauses.push(`${polarNight.join(", ")} (sun never rises)`);
  }
  if (lowSun.length > 0) {
    clauses.push(
      `${lowSun.join(", ")} (noon sun under ` +
        `${SNOW_RETRIEVAL_MIN_NOON_ELEVATION_DEG}°)`
    );
  }
  return (
    `At ${formatLatitude(latitude)} MOD10CM is too dark to observe snow in ` +
    `${clauses.join(" or ")} — readings there are not measurements of those months.`
  );
}

function formatLatitude(latitude: number): string {
  return `${Math.abs(latitude).toFixed(1)}°${latitude < 0 ? "S" : "N"}`;
}
