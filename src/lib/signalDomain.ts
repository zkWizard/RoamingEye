import type {
  EnvironmentSignalBrief,
  EnvironmentSignalId,
} from "./environmentBrief";
import type { DatasetRef } from "./timeline";

/**
 * Provenance-first spatial *domain-of-definition* descriptor for a multi-signal
 * environment brief.
 *
 * The brief composes vegetation, rainfall, soil-moisture, and air-temperature as
 * monthly observations for one place. Reading them side by side invites a reader
 * to treat all four as defined wherever the place is. But the cited products are
 * not defined over the same part of the Earth's surface:
 *
 *  - NDVI (MOD13A3) is a land vegetation index; open water is masked, so it
 *    carries no value over ocean.
 *  - Rainfall and soil moisture (GLDAS_NOAH025_M) are fields of the GLDAS Noah
 *    land-surface model, which is solved on land cells only — there are no ocean
 *    cells, so the fields are simply undefined over open water.
 *  - Air temperature (M2TMNXSLV, MERRA-2) is a global reanalysis field, defined
 *    over both land and ocean.
 *
 * So for a coastal or marine place, a land-only signal returning no value is
 * *out of the product's domain*, not a low reading — an ocean point has no NDVI
 * and no GLDAS rainfall by construction, not "no vegetation" or "no rain". This
 * helper classifies each signal by the surface domain over which its product is
 * defined so an out-of-domain absence is never misread as a small or zero value.
 *
 * It is deliberately distinct from — and composes with — the brief's other rigor
 * descriptors:
 *   - coverage adequacy (`coverageAdequacy.ts`) reports what SHARE of a sampled
 *     area returned data; domain of definition is prior to that — it says where
 *     the product has any defined value at all, regardless of a given sample.
 *   - Earth-system compartment (`signalCompartment.ts`) places a signal in a
 *     vertical medium (air / surface / soil); domain of definition is the
 *     HORIZONTAL surface (land / ocean) the product spans.
 *   - native spatial support (`spatialSupport.ts`) is the SIZE of a grid cell;
 *     domain of definition is the EXTENT the grid covers.
 *
 * Domain of definition is a fixed, documented property of the cited product and
 * variable, asserted per signal below; it is never inferred from a value, and a
 * signal absent from the table is reported as `unclassified`, never guessed. It
 * reports where each product is defined and nothing about the values themselves:
 * no condition, comparison, coverage, risk, causation, or forecast. In
 * particular it does NOT know where the brief's place actually falls (land or
 * ocean) — it only makes the differing domains explicit so a reader placing the
 * signals at one point can tell an out-of-domain absence from a real low value.
 */

export type SpatialDomain =
  /** Defined over land surfaces only; no value over open ocean (e.g. NDVI, GLDAS). */
  | "land-only"
  /** Defined over both land and ocean (e.g. MERRA-2 global reanalysis). */
  | "land-and-ocean"
  /** Signal absent from the domain table; never guessed. */
  | "unclassified";

interface DomainInfo {
  /** Short human phrase for a statement, e.g. "land surfaces only". */
  description: string;
  /**
   * True when the product is defined over open ocean as well as land. False for
   * a land-only product and for `unclassified` (whose domain is not asserted).
   */
  coversOcean: boolean;
}

const DOMAIN_INFO: Record<SpatialDomain, DomainInfo> = {
  "land-only": { description: "land surfaces only", coversOcean: false },
  "land-and-ocean": {
    description: "both land and ocean",
    coversOcean: true,
  },
  unclassified: { description: "unclassified domain", coversOcean: false },
};

/**
 * Domain of definition keyed by the brief signal id. Where a product carries a
 * defined value is a fixed property of that product and variable, so it is
 * asserted per signal here: this is the single place each brief signal's domain
 * is declared. The two GLDAS fields (rainfall and soil moisture) share a product
 * and are both land-only; NDVI is a separate land product; only the MERRA-2
 * air-temperature reanalysis spans the ocean. A signal id absent from this table
 * resolves to `unclassified`; a domain is never inferred from a value.
 */
const SIGNAL_DOMAIN: Record<EnvironmentSignalId, SpatialDomain> = {
  // MOD13A3 NDVI: a land vegetation index; open water is masked out.
  vegetation: "land-only",
  // GLDAS Noah land-surface model: solved on land cells only, no ocean.
  rainfall: "land-only",
  // GLDAS Noah land-surface model: solved on land cells only, no ocean.
  "soil-moisture": "land-only",
  // MERRA-2 global reanalysis: 2 m air temperature is defined over land and ocean.
  "air-temperature": "land-and-ocean",
};

/** One signal classified by the surface domain over which its product is defined. */
export interface SignalDomainClassification {
  id: EnvironmentSignalId;
  label: string;
  source: DatasetRef;
  domain: SpatialDomain;
  /**
   * True when the product is defined over open ocean as well as land. False for
   * a land-only product and for an unclassified signal (not asserted).
   */
  coversOcean: boolean;
  /** Honest, source-carrying sentence; no condition, coverage, or value claim. */
  statement: string;
}

export interface SignalDomainSummary {
  kind: "signal-domain";
  /** Signals assessed (usable observations by default), in signal order. */
  consideredSignalIds: EnvironmentSignalId[];
  /** Per-signal domain classifications, in signal order. */
  signals: SignalDomainClassification[];
  /** Count of considered signals in each domain (zeros included). */
  domainCounts: Record<SpatialDomain, number>;
  /** Ids of considered land-only signals, in signal order. */
  landOnlySignalIds: EnvironmentSignalId[];
  /** Considered signals whose id is not in the domain table. */
  unclassifiedCount: number;
  /** True when every considered signal shares one domain (incl. unclassified). */
  homogeneous: boolean;
  /**
   * True when the considered signals mix a land-only product with a
   * land-and-ocean one. This is the case a reader at a coastal or marine place
   * must handle with care: the land-only signals are undefined over water, so
   * their absence there is out-of-domain, not a low value, while the
   * land-and-ocean signal is still defined.
   */
  mixesLandOnlyAndOcean: boolean;
  /** Honest one-line domain statement; no condition or value inference. */
  statement: string;
  limits: string[];
}

export interface SignalDomainOptions {
  /**
   * Which signals to classify. "available" (default) considers only signals
   * carrying a usable observation, because domain matters most for the values a
   * reader would actually place at a point; "all" describes the whole brief's
   * domain basis regardless of per-signal status.
   */
  include?: "available" | "all";
}

const DOMAIN_LIMITS = [
  "Domain of definition is where a product carries any defined value (land, ocean), a fixed property of the cited product and variable — not the share of a sampled area that returned data (that is coverage) and not the value itself.",
  "For a land-only product, an absence over open water is out of the product's domain, not a low or zero reading; only a land-and-ocean product is defined there.",
  "This descriptor does not know where the brief's place actually falls; it only makes the signals' differing domains explicit so an out-of-domain absence is not misread.",
  "A signal absent from the domain table is reported as unclassified, never inferred from its value.",
];

/**
 * Look up a signal's spatial domain of definition by its brief id, returning
 * "unclassified" for any id not in the table so a domain is never silently
 * invented for an unknown signal.
 */
export function classifySignalDomain(id: EnvironmentSignalId): SpatialDomain {
  return SIGNAL_DOMAIN[id] ?? "unclassified";
}

/**
 * Classify each brief signal by the surface domain over which its cited product
 * is defined, and report whether the considered signals mix a land-only product
 * with a land-and-ocean one. NDVI and the GLDAS land fields are undefined over
 * open water, while MERRA-2 air temperature is not; at a coastal or marine place
 * a land-only absence is out-of-domain rather than a low value, and this makes
 * that explicit without touching the values themselves.
 */
export function summarizeSignalDomains(
  signals: readonly EnvironmentSignalBrief[],
  options?: SignalDomainOptions
): SignalDomainSummary {
  const include = options?.include ?? "available";
  const considered = signals.filter((signal) =>
    include === "all" ? true : signal.status === "available"
  );

  const classified: SignalDomainClassification[] = considered.map((signal) => {
    const domain = classifySignalDomain(signal.id);
    const info = DOMAIN_INFO[domain];
    return {
      id: signal.id,
      label: signal.label,
      source: signal.source,
      domain,
      coversOcean: info.coversOcean,
      statement: `${signal.label}: defined over ${info.description} (${domain}); source ${sourceLabel(signal.source)}.`,
    };
  });

  const domainCounts = countDomains(classified);
  const landOnlySignalIds = classified
    .filter((s) => s.domain === "land-only")
    .map((s) => s.id);
  const unclassifiedCount = domainCounts.unclassified;
  const distinctDomains = DOMAINS.filter(
    (domain) => domainCounts[domain] > 0
  ).length;

  return {
    kind: "signal-domain",
    consideredSignalIds: classified.map((s) => s.id),
    signals: classified,
    domainCounts,
    landOnlySignalIds,
    unclassifiedCount,
    homogeneous: classified.length >= 1 && distinctDomains === 1,
    // The mix that matters for a coastal/marine reader is a land-only signal
    // alongside one that is also defined over ocean.
    mixesLandOnlyAndOcean:
      domainCounts["land-only"] > 0 && domainCounts["land-and-ocean"] > 0,
    statement: domainStatement(
      classified.length,
      domainCounts,
      landOnlySignalIds,
      unclassifiedCount
    ),
    limits: DOMAIN_LIMITS,
  };
}

/** Fixed domain order for reporting, so no domain is silently dropped. */
const DOMAINS: readonly SpatialDomain[] = [
  "land-only",
  "land-and-ocean",
  "unclassified",
];

function countDomains(
  signals: readonly SignalDomainClassification[]
): Record<SpatialDomain, number> {
  const counts = Object.fromEntries(
    DOMAINS.map((domain) => [domain, 0])
  ) as Record<SpatialDomain, number>;
  for (const signal of signals) counts[signal.domain] += 1;
  return counts;
}

function domainStatement(
  consideredCount: number,
  domainCounts: Record<SpatialDomain, number>,
  landOnlySignalIds: EnvironmentSignalId[],
  unclassifiedCount: number
): string {
  if (consideredCount === 0) {
    return "No usable observations to classify by spatial domain of definition.";
  }

  const noun = consideredCount === 1 ? "observation" : "observations";
  const breakdown = domainBreakdown(domainCounts);
  const classifiedCount = consideredCount - unclassifiedCount;
  const landOnlyCount = landOnlySignalIds.length;
  const oceanCount = domainCounts["land-and-ocean"];

  let domainClause: string;
  if (classifiedCount === 0) {
    domainClause =
      "no considered signal is in the domain table, so their domain of definition is not asserted";
  } else if (landOnlyCount > 0 && oceanCount > 0) {
    domainClause = `${landOnlySignalIds.join(
      ", "
    )} ${landOnlyCount === 1 ? "is" : "are"} defined over land only — over open water ${landOnlyCount === 1 ? "its" : "their"} absence is out of the product's domain, not a low value, while the land-and-ocean signal remains defined`;
  } else if (landOnlyCount > 0) {
    const verb = landOnlyCount === 1 ? "is" : "are";
    domainClause = `all ${landOnlyCount} classified ${verb} defined over land only, so over open water an absence is out of the product's domain, not a low value`;
  } else {
    const verb = oceanCount === 1 ? "is" : "are";
    domainClause = `all ${oceanCount} classified ${verb} defined over both land and ocean`;
  }

  const unclassifiedClause =
    unclassifiedCount > 0
      ? ` ${unclassifiedCount} unclassified signal${plural(unclassifiedCount)} not asserted.`
      : "";

  return `${consideredCount} usable ${noun}: ${breakdown}; ${domainClause}.${unclassifiedClause}`;
}

/** Non-zero domain counts in fixed order, e.g. "3 land-only, 1 land-and-ocean". */
function domainBreakdown(domainCounts: Record<SpatialDomain, number>): string {
  return DOMAINS.filter((domain) => domainCounts[domain] > 0)
    .map((domain) => `${domainCounts[domain]} ${domain}`)
    .join(", ");
}

function plural(count: number): string {
  return count === 1 ? "" : "s";
}

function sourceLabel(source: DatasetRef): string {
  return `${source.shortName} v${source.version}`;
}
