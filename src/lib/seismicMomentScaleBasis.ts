import {
  SEISMICITY_SOURCE,
  SEISMICITY_UNITS,
  type Earthquake,
} from "./earthquakes";
import {
  magnitudeFromMoment,
  momentFromMagnitude,
  SEISMIC_MOMENT_REFERENCE,
  SEISMIC_MOMENT_UNITS,
} from "./seismicMoment";

/**
 * Measure how much of a moment total actually rests on moment magnitudes.
 *
 * Every helper in the seismic-moment cluster converts magnitude to moment with
 * the Hanks & Kanamori relation (see {@link ./seismicMoment}), which is defined
 * for the moment magnitude scale (Mw). Operational catalogs — including the
 * USGS M4.5+ summary feed this app renders — mix magnitude *methods*, so those
 * helpers each carry the same standing caveat:
 *
 *   "Every input magnitude is treated as a moment magnitude ...; operational
 *   feeds mix magnitude types, so each regime's moment total and equivalent
 *   magnitude are approximate."
 *
 * The caveat is declared but never measured, and the cluster's entry point
 * {@link ./seismicMoment.cumulativeSeismicMoment} takes bare `number[]`, so the
 * reported scale is discarded at the call boundary and no consumer can tell how
 * far the approximation reaches. This module closes that gap: it partitions the
 * same cumulative moment by the magnitude method the feed reported, so a caller
 * can state what fraction of a total came from values the relation is defined
 * for and what fraction is an approximation.
 *
 * The count-weighted and moment-weighted views of that question differ sharply
 * — a catalog can be numerically dominated by one method while its energy comes
 * almost entirely from another — which is exactly why the share is weighted by
 * moment here rather than by event count.
 *
 * Attribution only. Nothing is converted between scales: no exact conversion is
 * published, and computing one would fabricate a measurement the feed never
 * reported. Naming a non-Mw contribution does not repair it.
 *
 * Pure, render-free logic (see seismicMomentScaleBasis.test.ts). It is a
 * descriptive partition of the events supplied to it, not a hazard assessment,
 * a forecast, or a statement of feed completeness.
 *
 * References:
 *   Hanks, T. C. & Kanamori, H. (1979), "A moment magnitude scale",
 *   J. Geophys. Res. 84(B5), 2348–2350.
 *   USGS "Magnitude Types"
 *   (https://www.usgs.gov/programs/earthquake-hazards/magnitude-types).
 */

export const SEISMIC_MOMENT_SCALE_BASIS_UNITS = {
  magnitude: SEISMIC_MOMENT_UNITS.magnitude,
  moment: SEISMIC_MOMENT_UNITS.moment,
  reportedMagnitude: SEISMICITY_UNITS.magnitude,
} as const;

/**
 * The USGS magnitude-type codes that are themselves moment magnitudes, and so
 * are the values the Hanks & Kanamori relation is defined for: the generic
 * `Mw`, the W-phase (`Mww`), centroid (`Mwc`), body-wave (`Mwb`), and regional
 * (`Mwr`) moment-tensor solutions. Compared case-insensitively; the feed writes
 * them lower case while the USGS table writes them capitalized.
 *
 * Codes outside this list are reported as *not verified* to be moment
 * magnitudes — which is not the same as asserting they are not. Membership is
 * transcribed from the USGS "Magnitude Types" table, never inferred from a
 * code's spelling.
 */
export const MOMENT_MAGNITUDE_TYPE_CODES: readonly string[] = [
  "mw",
  "mwb",
  "mwc",
  "mwr",
  "mww",
] as const;

/**
 * How an event's reported magnitude method relates to the moment relation:
 *  - "moment-magnitude": the reported method is in MOMENT_MAGNITUDE_TYPE_CODES.
 *  - "other-reported-scale": a method was reported and is not in that list.
 *  - "unreported-scale": the feed supplied no non-empty magnitude type.
 */
export type MomentScaleBasis =
  "moment-magnitude" | "other-reported-scale" | "unreported-scale";

/** Bases in a fixed order, so iteration and tie-breaking are deterministic. */
export const MOMENT_SCALE_BASIS_ORDER: readonly MomentScaleBasis[] = [
  "moment-magnitude",
  "other-reported-scale",
  "unreported-scale",
] as const;

/**
 * Classify one reported magnitude method. Whitespace-only and absent values
 * read as unreported, matching how summarizeEarthquakes in earthquakes.ts
 * decides that a magnitude type is unavailable.
 */
export function momentScaleBasis(
  magnitudeType: string | null | undefined
): MomentScaleBasis {
  if (typeof magnitudeType !== "string") return "unreported-scale";
  const code = magnitudeType.trim().toLowerCase();
  if (code === "") return "unreported-scale";
  return MOMENT_MAGNITUDE_TYPE_CODES.includes(code)
    ? "moment-magnitude"
    : "other-reported-scale";
}

/** One basis group's contribution to the set's cumulative seismic moment. */
export interface MomentScaleBasisShare {
  basis: MomentScaleBasis;
  /** Contributing events (finite magnitude) classified into this basis. */
  eventCount: number;
  /** Summed scalar seismic moment of this group's events (N·m). */
  totalMomentNm: number;
  /**
   * This group's share of the set's total seismic moment, in [0, 1]. Zero when
   * the group contributed no events (and when the whole set is empty).
   */
  momentFraction: number;
  /**
   * This group's summed moment expressed as one equivalent moment magnitude.
   * Null when the group contributed no events, keeping the empty case explicit
   * rather than reporting a misleading zero-magnitude event.
   */
  equivalentMomentMagnitude: number | null;
}

/** One reported magnitude-type label's contribution, retained verbatim. */
export interface ReportedTypeMomentShare {
  /**
   * The magnitude type exactly as reported, or null for events the feed left
   * without one. Grouped by the verbatim string (as summarizeEarthquakes does),
   * so two spellings of one method stay two rows rather than being silently
   * merged.
   */
  magnitudeType: string | null;
  basis: MomentScaleBasis;
  eventCount: number;
  totalMomentNm: number;
  momentFraction: number;
}

/**
 * A descriptive aggregation of supplied events' moment by reported magnitude
 * method, not a risk score, diagnosis, causal statement, or prediction. Every
 * basis is always present in `shares` (absent groups read as a zeroed share) so
 * callers can index the record total-safely.
 */
export interface SeismicMomentScaleBasis {
  kind: "usgs-seismic-moment-scale-basis";
  isForecast: false;
  suppliedEventCount: number;
  contributingEventCount: number;
  skippedEventCount: number;
  totalMomentNm: number;
  shares: Record<MomentScaleBasis, MomentScaleBasisShare>;
  /** Per-label breakdown, ordered by descending moment then by label. */
  reportedTypes: readonly ReportedTypeMomentShare[];
  /**
   * The share of the total moment that did NOT come from a verified moment
   * magnitude, in [0, 1] — the extent to which this total rests on treating
   * other methods as Mw. Null when no event contributed, rather than an
   * invented zero.
   */
  approximatedMomentFraction: number | null;
  reference: typeof SEISMIC_MOMENT_REFERENCE;
  source: typeof SEISMICITY_SOURCE;
  units: typeof SEISMIC_MOMENT_SCALE_BASIS_UNITS;
  limitations: readonly string[];
}

const LIMITATIONS = [
  "Attributes the summed seismic moment of the valid events supplied to this helper to the magnitude method each event reported; it is a descriptive split, not a hazard assessment, a forecast, or a statement of feed completeness.",
  "Attribution is not correction: no magnitude is converted between scales, and reporting a non-moment-magnitude contribution does not repair the moment computed from it.",
  "A method outside MOMENT_MAGNITUDE_TYPE_CODES is reported as not verified to be a moment magnitude, which is not an assertion that it is a different physical quantity.",
  "Body-wave and local magnitudes are documented by USGS to saturate for large events, so a moment computed from such a value can understate the event's true moment; this helper measures the exposure and does not correct it.",
  "Magnitude-type labels are grouped verbatim, so a feed that spelled one method two ways yields two rows.",
  "Events lacking a finite magnitude have no defined moment, contribute nothing, and are counted only in skippedEventCount.",
] as const;

/** A zeroed share for every basis, so absent groups read as empty. */
function emptyShares(): Record<MomentScaleBasis, MomentScaleBasisShare> {
  return {
    "moment-magnitude": emptyShare("moment-magnitude"),
    "other-reported-scale": emptyShare("other-reported-scale"),
    "unreported-scale": emptyShare("unreported-scale"),
  };
}

function emptyShare(basis: MomentScaleBasis): MomentScaleBasisShare {
  return {
    basis,
    eventCount: 0,
    totalMomentNm: 0,
    momentFraction: 0,
    equivalentMomentMagnitude: null,
  };
}

/** Accumulator for one verbatim magnitude-type label. */
interface TypeAccumulator {
  magnitudeType: string | null;
  basis: MomentScaleBasis;
  eventCount: number;
  totalMomentNm: number;
}

/**
 * Partition the supplied events' cumulative seismic moment across the reported
 * magnitude methods, retaining source, reference, and native unit labels. An
 * event contributes only when it carries a finite magnitude; anything else is
 * skipped and counted in skippedEventCount so the basis of the partition stays
 * auditable.
 */
export function seismicMomentScaleBasis(
  earthquakes: readonly Earthquake[]
): SeismicMomentScaleBasis {
  const shares = emptyShares();
  // Keyed by verbatim label; the null key holds events with no reported type,
  // which no non-empty string can collide with.
  const byType = new Map<string | null, TypeAccumulator>();
  let totalMomentNm = 0;
  let contributingEventCount = 0;
  let skippedEventCount = 0;

  for (const earthquake of earthquakes) {
    const moment = momentFromMagnitude(earthquake.magnitude);
    if (moment === null) {
      skippedEventCount += 1;
      continue;
    }
    const basis = momentScaleBasis(earthquake.magnitudeType);
    const share = shares[basis];
    share.eventCount += 1;
    share.totalMomentNm += moment;
    totalMomentNm += moment;
    contributingEventCount += 1;

    const label =
      basis === "unreported-scale" ? null : earthquake.magnitudeType;
    const key = label ?? null;
    const accumulator = byType.get(key) ?? {
      magnitudeType: key,
      basis,
      eventCount: 0,
      totalMomentNm: 0,
    };
    accumulator.eventCount += 1;
    accumulator.totalMomentNm += moment;
    byType.set(key, accumulator);
  }

  for (const basis of MOMENT_SCALE_BASIS_ORDER) {
    const share = shares[basis];
    // totalMomentNm > 0 whenever any event contributed (finite magnitudes map
    // to strictly positive moments), so this divide is guarded by eventCount.
    share.momentFraction =
      share.eventCount > 0 ? share.totalMomentNm / totalMomentNm : 0;
    share.equivalentMomentMagnitude =
      share.eventCount > 0 ? magnitudeFromMoment(share.totalMomentNm) : null;
  }

  return {
    kind: "usgs-seismic-moment-scale-basis",
    isForecast: false,
    suppliedEventCount: earthquakes.length,
    contributingEventCount,
    skippedEventCount,
    totalMomentNm,
    shares,
    reportedTypes: reportedTypeShares(byType, totalMomentNm),
    approximatedMomentFraction:
      contributingEventCount > 0
        ? 1 - shares["moment-magnitude"].momentFraction
        : null,
    reference: SEISMIC_MOMENT_REFERENCE,
    source: SEISMICITY_SOURCE,
    units: SEISMIC_MOMENT_SCALE_BASIS_UNITS,
    limitations: LIMITATIONS,
  };
}

/**
 * Order the per-label rows by descending moment so the methods carrying the
 * total come first, breaking exact ties on the label (unreported last) so the
 * result never depends on input order.
 */
function reportedTypeShares(
  byType: ReadonlyMap<string | null, TypeAccumulator>,
  totalMomentNm: number
): ReportedTypeMomentShare[] {
  return [...byType.values()]
    .map((accumulator) => ({
      magnitudeType: accumulator.magnitudeType,
      basis: accumulator.basis,
      eventCount: accumulator.eventCount,
      totalMomentNm: accumulator.totalMomentNm,
      momentFraction:
        totalMomentNm > 0 ? accumulator.totalMomentNm / totalMomentNm : 0,
    }))
    .sort((a, b) => {
      if (b.totalMomentNm !== a.totalMomentNm) {
        return b.totalMomentNm - a.totalMomentNm;
      }
      if (a.magnitudeType === null) return b.magnitudeType === null ? 0 : 1;
      if (b.magnitudeType === null) return -1;
      return a.magnitudeType.localeCompare(b.magnitudeType, "en-US");
    });
}
