import {
  SEISMICITY_SOURCE,
  SEISMICITY_UNITS,
  depthClass,
  type DepthClass,
  type Earthquake,
} from "./earthquakes";

/**
 * Separate reported hypocentral depths that sit exactly on a conventional
 * operator-assigned default from depths the feed reports as free values.
 *
 * Depth is the least-constrained parameter of a routine earthquake location.
 * When the available phase data cannot resolve it — few stations, a large
 * azimuthal gap, no near-source arrivals — the analyst fixes depth at a
 * conventional value instead of letting the inversion wander. That is why so
 * much of a global catalog piles up on a handful of round numbers, and the USGS
 * says so directly in its "Why do so many earthquakes occur at a depth of
 * 10 km?" FAQ.
 *
 * The GeoJSON summary feed carries no flag for this. It also omits `depthError`
 * entirely from the M4.5+/30-day product, so a consumer cannot ask the feed how
 * well a depth was resolved. What a consumer can observe is the value itself: a
 * depth reported as exactly 10 km, sitting beside depths reported to three
 * decimals (2.283 km, 655.67 km), is quantized, and quantization onto a
 * documented default is a tell.
 *
 * It is only a tell, and this module never claims otherwise. A genuinely
 * resolved hypocentre can land on 10.0 km, and the feed does not say which
 * happened. The classification here is a statement about the reported number —
 * carried so a depth readout or a depth-class colour can be qualified rather
 * than presented as an independently resolved measurement. It infers no
 * location quality, hazard, cause, or forecast.
 *
 * Pure, render-free logic (see seismicFixedDepth.test.ts).
 *
 * Source: https://earthquake.usgs.gov/earthquakes/feed/v1.0/geojson.php
 * FAQ: https://www.usgs.gov/faqs/why-do-so-many-earthquakes-occur-depth-10km
 */

/**
 * Depth values (km) conventionally assigned when a location's depth is not
 * resolvable from the available phase data:
 *
 *   0, 5  — surface-fixed solutions from contributing regional networks
 *   10    — the USGS default for shallow events with unconstrained depth
 *   33    — the historic global default (Jeffreys–Bullen crustal thickness)
 *   35    — the current NEIC teleseismic default
 *
 * This is an analyst convention observed in the catalog, not a field the feed
 * supplies. Membership is tested by exact equality: a depth reported as 9.9 km
 * is a free value, and rounding it into this set would invent the very
 * determination this module refuses to make.
 */
export const CONVENTIONAL_DEFAULT_DEPTHS_KM: readonly number[] = [
  0, 5, 10, 33, 35,
];

/**
 * How a reported depth's value reads: exactly one of the conventional defaults,
 * a free value, or no usable depth at all.
 */
export type ReportedDepthBasis =
  "conventional-default-value" | "free-value" | "unavailable";

/** Classify one reported depth by value. Non-finite input is unavailable. */
export function reportedDepthBasis(depthKm: unknown): ReportedDepthBasis {
  if (typeof depthKm !== "number" || !Number.isFinite(depthKm)) {
    return "unavailable";
  }
  return CONVENTIONAL_DEFAULT_DEPTHS_KM.includes(depthKm)
    ? "conventional-default-value"
    : "free-value";
}

/**
 * A short clause qualifying a depth readout whose value is a conventional
 * default, or null when there is nothing to qualify. Says the feed is silent
 * rather than asserting the depth was fixed.
 */
export function reportedDepthBasisNote(depthKm: unknown): string | null {
  return reportedDepthBasis(depthKm) === "conventional-default-value"
    ? "conventional default depth value; resolution not reported"
    : null;
}

/** Observed count for one conventional default depth. */
export interface DefaultDepthTally {
  depthKm: number;
  eventCount: number;
}

/** Usable-depth counts for one conventional depth class. */
export interface DepthClassDefaultTally {
  usableEventCount: number;
  conventionalDefaultValueCount: number;
}

/**
 * A descriptive account of how much of a supplied event set reports a depth on
 * a conventional default value. Not a location-quality score, risk score,
 * causal statement, or prediction.
 */
export interface SeismicFixedDepthCoverage {
  kind: "usgs-reported-depth-basis-coverage";
  isForecast: false;
  suppliedEventCount: number;
  /** Events carrying a finite reported depth. */
  usableEventCount: number;
  conventionalDefaultValueCount: number;
  freeValueCount: number;
  /** Null when no supplied event carried a usable depth, rather than a 0. */
  conventionalDefaultValueFraction: number | null;
  /** Ascending by depth; only values actually observed appear. */
  byDefaultDepth: readonly DefaultDepthTally[];
  /** The same split, per conventional shallow/intermediate/deep class. */
  byDepthClass: Record<DepthClass, DepthClassDefaultTally>;
  /** The convention set this run tested against, retained for auditability. */
  defaultDepthsKm: readonly number[];
  source: typeof SEISMICITY_SOURCE;
  units: typeof SEISMICITY_UNITS;
  limitations: readonly string[];
}

const LIMITATIONS = [
  "Classifies the reported depth value only. An exact match to a conventional default is evidence that depth may have been fixed, not a determination that it was: the summary feed carries no fixed-depth flag and a resolved hypocentre can land on the same value.",
  "The converse also holds. A depth that is not one of these values may still rest on very little data; this detects a quantization tell, not location quality.",
  "The M4.5+ summary feed does not supply depthError, so no uncertainty interval is available to test and only exact value equality is used.",
  "The default-depth set is a documented and observed analyst convention, not a field published with the feed; a contributing network may fix depth at some other value.",
  "Describes only the events supplied to this helper. It is not a hazard assessment, a forecast, or a statement of catalog completeness.",
] as const;

/**
 * Tally how many supplied events report a depth on a conventional default
 * value, overall and per depth class. Events without a finite depth are
 * excluded from the tallies but still counted in suppliedEventCount so the
 * basis of the summary stays auditable.
 */
export function seismicFixedDepthCoverage(
  earthquakes: readonly Earthquake[]
): SeismicFixedDepthCoverage {
  const byDepthClass: Record<DepthClass, DepthClassDefaultTally> = {
    shallow: { usableEventCount: 0, conventionalDefaultValueCount: 0 },
    intermediate: { usableEventCount: 0, conventionalDefaultValueCount: 0 },
    deep: { usableEventCount: 0, conventionalDefaultValueCount: 0 },
  };
  const defaultCounts = new Map<number, number>();
  let usableEventCount = 0;
  let conventionalDefaultValueCount = 0;

  for (const earthquake of earthquakes) {
    const basis = reportedDepthBasis(earthquake.depthKm);
    if (basis === "unavailable") continue;
    usableEventCount += 1;
    const classTally = byDepthClass[depthClass(earthquake.depthKm)];
    classTally.usableEventCount += 1;
    if (basis !== "conventional-default-value") continue;
    conventionalDefaultValueCount += 1;
    classTally.conventionalDefaultValueCount += 1;
    // Normalize -0 so a surface-fixed depth tallies under the 0 km convention.
    const depthKm = earthquake.depthKm === 0 ? 0 : earthquake.depthKm;
    defaultCounts.set(depthKm, (defaultCounts.get(depthKm) ?? 0) + 1);
  }

  return {
    kind: "usgs-reported-depth-basis-coverage",
    isForecast: false,
    suppliedEventCount: earthquakes.length,
    usableEventCount,
    conventionalDefaultValueCount,
    freeValueCount: usableEventCount - conventionalDefaultValueCount,
    conventionalDefaultValueFraction:
      usableEventCount === 0
        ? null
        : conventionalDefaultValueCount / usableEventCount,
    byDefaultDepth: [...defaultCounts.entries()]
      .map(([depthKm, eventCount]) => ({ depthKm, eventCount }))
      .sort((first, second) => first.depthKm - second.depthKm),
    byDepthClass,
    defaultDepthsKm: CONVENTIONAL_DEFAULT_DEPTHS_KM,
    source: SEISMICITY_SOURCE,
    units: SEISMICITY_UNITS,
    limitations: LIMITATIONS,
  };
}
