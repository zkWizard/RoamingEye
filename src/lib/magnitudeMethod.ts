/**
 * The measurement method behind a reported earthquake magnitude.
 *
 * A USGS summary feed mixes magnitude scales in one `mag` column: in the live
 * M4.5+/30-day feed, ~80% of events are `mb` (body-wave) and the rest are
 * mostly `mww` (W-phase moment). Those are different physical measurements of
 * an earthquake, not interchangeable readings of one quantity — `mb` is a
 * P-wave amplitude measurement that USGS documents as saturating near M 6.5,
 * while moment magnitudes stay proportional to seismic moment above it. A
 * marker labelled only "M 5.6" therefore hides which quantity was measured.
 *
 * This module transcribes the applicability range USGS publishes for each
 * method and reports, categorically, where a reported value sits relative to
 * the range documented for the method that produced it. It never converts
 * between scales, never recomputes a magnitude, and never infers a method from
 * a code's spelling — an unlisted code stays unlabelled rather than being
 * promoted by prefix matching.
 *
 * Source: USGS "Magnitude Types"
 * (https://www.usgs.gov/programs/earthquake-hazards/magnitude-types).
 */

/** Provenance for the transcribed applicability ranges. */
export const MAGNITUDE_METHOD_SOURCE = {
  name: "USGS Earthquake Hazards Program — Magnitude Types",
  url: "https://www.usgs.gov/programs/earthquake-hazards/magnitude-types",
} as const;

/**
 * One row of the USGS magnitude-type table. Bounds are the published range of
 * applicability in magnitude units; null means USGS documents that side as
 * open-ended, not that any value is admissible.
 */
export interface MagnitudeMethodReference {
  /** The feed's `magType` code, lower case. */
  code: string;
  /** Short name of the measurement the code denotes. */
  name: string;
  /** Documented lower bound of applicability; null when open-ended. */
  minM: number | null;
  /** Documented upper bound of applicability; null when open-ended. */
  maxM: number | null;
  /**
   * Magnitude near which USGS explicitly documents the method as saturating,
   * i.e. ceasing to grow with true earthquake size. Null where USGS states no
   * saturation onset — absence here is silence in the source, not evidence
   * that the method does not saturate.
   */
  saturatesAboveM: number | null;
}

/**
 * The instrumental methods USGS documents with a magnitude range, keyed by the
 * lower-case feed code. Non-instrumental estimates (felt-area Mfa, intensity
 * Mint, the non-standard Mh, and finite-fault products) are omitted: they carry
 * no published magnitude range and do not appear in an instrumental summary
 * feed.
 */
export const MAGNITUDE_METHOD_REFERENCE: Readonly<
  Record<string, MagnitudeMethodReference>
> = {
  mww: {
    code: "mww",
    name: "W-phase moment",
    minM: 5.0,
    maxM: null,
    saturatesAboveM: null,
  },
  mwc: {
    code: "mwc",
    name: "centroid moment",
    minM: 5.5,
    maxM: null,
    saturatesAboveM: null,
  },
  mwb: {
    code: "mwb",
    name: "body-wave moment",
    minM: 5.5,
    maxM: 7.0,
    saturatesAboveM: null,
  },
  mwr: {
    code: "mwr",
    name: "regional moment",
    minM: 4.0,
    maxM: 6.5,
    saturatesAboveM: null,
  },
  mb: {
    code: "mb",
    name: "body-wave",
    minM: 4.0,
    maxM: 6.5,
    saturatesAboveM: 6.5,
  },
  mb_lg: {
    code: "mb_lg",
    name: "regional Lg body-wave",
    minM: 3.5,
    maxM: 7.0,
    saturatesAboveM: null,
  },
  ms_20: {
    code: "ms_20",
    name: "surface-wave",
    minM: 5.0,
    maxM: 8.5,
    saturatesAboveM: 8.3,
  },
  ml: {
    code: "ml",
    name: "local (Richter)",
    minM: 2.0,
    maxM: 6.5,
    saturatesAboveM: null,
  },
  md: {
    code: "md",
    name: "duration",
    minM: null,
    maxM: 4.0,
    saturatesAboveM: null,
  },
  mwp: {
    code: "mwp",
    name: "P-wave integral",
    minM: 5.0,
    maxM: 8.0,
    saturatesAboveM: null,
  },
  me: {
    code: "me",
    name: "energy",
    minM: 3.5,
    maxM: null,
    saturatesAboveM: null,
  },
} as const;

/**
 * Where a reported magnitude sits relative to the range USGS documents for the
 * method that produced it. These describe the reported pair only; none of them
 * asserts that a value is wrong.
 */
export type MagnitudeMethodStanding =
  /** The feed stated no method, so no range applies. */
  | "method-unreported"
  /** The feed stated a method with no transcribed USGS range. */
  | "method-undocumented"
  | "within-documented-range"
  /** Below the documented lower bound — often a denser-network edge case. */
  | "below-documented-range"
  /** Above the documented upper bound; see {@link magnitudeMethodNote}. */
  | "above-documented-range";

/**
 * Look up a feed `magType`. Matching is exact on the trimmed, lower-cased code
 * so that a code merely resembling a listed one (say "mwx") stays undocumented
 * rather than inheriting another method's range.
 */
export function magnitudeMethodReference(
  magnitudeType: string | null | undefined
): MagnitudeMethodReference | null {
  if (typeof magnitudeType !== "string") return null;
  const code = magnitudeType.trim().toLowerCase();
  if (code === "") return null;
  return MAGNITUDE_METHOD_REFERENCE[code] ?? null;
}

/**
 * Classify a reported (magnitude, method) pair against the documented range.
 * A non-finite magnitude cannot be placed, so it reports the method's coverage
 * state rather than a range verdict.
 */
export function reportedMagnitudeStanding(
  magnitude: number,
  magnitudeType: string | null | undefined
): MagnitudeMethodStanding {
  const reference = magnitudeMethodReference(magnitudeType);
  if (reference === null) {
    const stated =
      typeof magnitudeType === "string" && magnitudeType.trim() !== "";
    return stated ? "method-undocumented" : "method-unreported";
  }
  if (!Number.isFinite(magnitude)) return "method-undocumented";
  if (reference.maxM !== null && magnitude > reference.maxM) {
    return "above-documented-range";
  }
  if (reference.minM !== null && magnitude < reference.minM) {
    return "below-documented-range";
  }
  return "within-documented-range";
}

/**
 * A caveat for a reported value that stands above its method's documented
 * range, or null when there is nothing to qualify.
 *
 * Only the above-range case is surfaced. A value below the documented lower
 * bound is routine — USGS notes Mww is robust to about M4.5 within regional
 * networks, and roughly a fifth of the live feed's Mww events sit below the
 * table's ~5.0 bound — so flagging it would read as an error where none is
 * claimed. Above the range the reading is materially weaker: where USGS
 * documents a saturation onset, the reported value is a lower bound on the
 * earthquake's size rather than a measurement of it.
 */
export function magnitudeMethodNote(
  magnitude: number,
  magnitudeType: string | null | undefined
): string | null {
  if (
    reportedMagnitudeStanding(magnitude, magnitudeType) !==
    "above-documented-range"
  ) {
    return null;
  }
  const reference = magnitudeMethodReference(magnitudeType);
  if (reference === null) return null;
  if (
    reference.saturatesAboveM !== null &&
    magnitude > reference.saturatesAboveM
  ) {
    return `${reference.code} saturates above M ${reference.saturatesAboveM} — reported value is a lower bound on size`;
  }
  return `above the M ${reference.maxM} upper bound USGS documents for ${reference.code}`;
}

/**
 * The reported magnitude with the method that measured it, for one-line
 * readouts. "(reported)" is retained throughout: this app never recomputes a
 * magnitude. A stated but undocumented code is still shown verbatim, because
 * naming the method the feed supplied is more faithful than omitting it.
 */
export function formatReportedMagnitude(
  magnitude: number,
  magnitudeType: string | null | undefined
): string {
  const stated =
    typeof magnitudeType === "string" && magnitudeType.trim() !== ""
      ? magnitudeType.trim()
      : null;
  if (stated === null) return `M ${magnitude} (reported)`;
  const reference = magnitudeMethodReference(stated);
  return reference === null
    ? `M ${magnitude} ${stated} (reported)`
    : `M ${magnitude} ${stated} (${reference.name}, reported)`;
}
