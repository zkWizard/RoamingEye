import type {
  EnvironmentSignalBrief,
  EnvironmentSignalId,
} from "./environmentBrief";
import type { DatasetRef } from "./timeline";

/**
 * Provenance-first DOI-registrant (registering-authority) descriptor for a
 * multi-signal environment brief.
 *
 * `sourceIndependence` groups the brief's signals by their full dataset DOI, so
 * two signals from the *same product* (rainfall and soil moisture, both GLDAS)
 * are correctly flagged as not independent evidence. But it treats every
 * *distinct* product as independent provenance — and that hides a coarser truth.
 * A DOI is `10.<registrant>/<suffix>`, and the registrant is the member a DOI
 * Registration Agency assigned that prefix to: the data-assigning authority. In
 * this app NDVI (MOD13A3), air temperature (MERRA-2, M2TMNXSLV), and the GLDAS
 * fields are *distinct products* but all mint DOIs under one registrant,
 * `10.5067` — NASA's Earth Science Data and Information System (ESDIS). They are
 * product-independent yet institutionally co-registered: a registration- or
 * curation-authority-wide change (a DOI re-minting after a DAAC migration, an
 * ESDIS-wide reprocessing decision) would touch all of them at once, so two
 * agreeing signals under one registrant are not independent *authorities*.
 *
 * This helper makes that coarser lens explicit. It groups the considered signals
 * by the registrant parsed from each cited DOI and reports whether the whole
 * brief traces to a single registering authority. It composes with — and never
 * replaces — `sourceIndependence`: product independence still holds at the finer
 * grain; this adds the institutional grain above it. It reports provenance
 * structure only: it never combines the signal values, weights them, or infers
 * any condition, risk, causation, or forecast — the brief's method limits hold.
 */

/** A DOI registrant (prefix) backing one or more of the brief's signals. */
export interface RegistrantGroup {
  /** DOI prefix used for grouping, e.g. "10.5067". */
  registrant: string;
  /**
   * Human name of the registering authority when the prefix is a known one;
   * null for a parseable-but-unrecognized registrant (reported by prefix only,
   * never invented).
   */
  authority: string | null;
  /** Distinct source products under this registrant (deduped by DOI), in order. */
  products: string[];
  /** Signals backed by this registrant, in signal order. */
  signalIds: EnvironmentSignalId[];
}

export interface RegistrantProvenanceSummary {
  kind: "registrant-provenance";
  /** Signals assessed (usable observations by default), in signal order. */
  consideredSignalIds: EnvironmentSignalId[];
  /** Distinct registrants backing the considered signals, first-seen order. */
  groups: RegistrantGroup[];
  /** Number of distinct parseable registrants (`groups.length`). */
  distinctRegistrants: number;
  /** Ids of signals whose cited DOI carries no parseable registrant, in order. */
  unknownRegistrantSignalIds: EnvironmentSignalId[];
  /**
   * Registrants backing more than one *distinct product* — the case this lens
   * adds over `sourceIndependence`: separate products sharing one authority.
   */
  sharedRegistrants: RegistrantGroup[];
  /**
   * True when there are at least two considered signals, none has an unknown
   * registrant, and all resolve to a single registrant: the whole brief traces
   * to one registering authority, so the signals are not institutionally
   * independent. False for a single signal, where authority independence is not
   * a meaningful concept.
   */
  singleRegistrant: boolean;
  /** Honest one-line provenance statement; carries no value or condition claim. */
  statement: string;
  limits: string[];
}

export interface RegistrantProvenanceOptions {
  /**
   * Which signals to assess. "available" (default) considers only signals
   * carrying a usable observation, because institutional independence matters
   * for the evidence a reader would actually combine; "all" describes the
   * brief's whole registrant basis regardless of per-signal status.
   */
  include?: "available" | "all";
}

/**
 * Known DOI registrants. A registrant prefix is assigned by a DOI Registration
 * Agency to one member, so its identity is a fixed, verifiable property — not a
 * guess. The one prefix RoamingEye's Earthdata products use is recorded here;
 * any other parseable prefix resolves to a null authority and is reported by its
 * prefix alone, never back-filled with an invented name.
 */
const REGISTRANT_AUTHORITY: Record<string, string> = {
  // DataCite prefix minted to NASA's Earth Science Data and Information System
  // (ESDIS / Earthdata). Every RoamingEye source DOI — MODIS (MOD13A3,
  // MOD11C3, MOD10CM, MCD12Q1), GLDAS, MERRA-2, ASTER GDEM — is of the form
  // 10.5067/… (verified against the resolved DOIs in src/lib/timeline.ts).
  "10.5067": "NASA ESDIS (Earthdata)",
};

const REGISTRANT_LIMITS = [
  "The registrant is the DOI-prefix holder (data-assigning authority), not the science team, instrument, or funding agency.",
  "Distinct products under one registrant remain distinct products; this is a coarser lens above per-product independence (src/lib/sourceIndependence.ts), not a replacement for it.",
  "A DOI with no parseable 10.<registrant>/ prefix is reported as unknown, never assigned an invented authority.",
];

/**
 * Parse the registrant prefix from a dataset DOI. A DOI is
 * `10.<registrant>/<suffix>`; the registrant is everything up to the first
 * slash and must match `10.` followed by a 4–9 digit registrant. Returns null
 * for a missing, blank, or non-conforming DOI so a registrant is never invented.
 * The prefix is case-insensitive but numeric here, so no case folding is needed.
 */
export function parseDoiRegistrant(
  doi: string | undefined | null
): string | null {
  if (typeof doi !== "string") return null;
  const trimmed = doi.trim();
  const match = /^(10\.\d{4,9})\//.exec(trimmed);
  return match ? match[1] : null;
}

/** Look up a registrant prefix's registering authority, or null when unknown. */
export function registrantAuthority(registrant: string): string | null {
  return REGISTRANT_AUTHORITY[registrant] ?? null;
}

/**
 * Group the brief's signals by the registrant of their cited DOI and report
 * whether they all trace to a single registering authority. Two signals under
 * one registrant — even from different products — share a data-assigning
 * authority and are not institutionally independent evidence.
 */
export function summarizeRegistrantProvenance(
  signals: readonly EnvironmentSignalBrief[],
  options?: RegistrantProvenanceOptions
): RegistrantProvenanceSummary {
  const include = options?.include ?? "available";
  const considered = signals.filter((signal) =>
    include === "all" ? true : signal.status === "available"
  );

  const groupsByRegistrant = new Map<string, RegistrantGroup>();
  const unknownRegistrantSignalIds: EnvironmentSignalId[] = [];
  for (const signal of considered) {
    const registrant = parseDoiRegistrant(signal.source.doi);
    if (registrant === null) {
      unknownRegistrantSignalIds.push(signal.id);
      continue;
    }
    const existing = groupsByRegistrant.get(registrant);
    const product = productLabel(signal.source);
    if (existing) {
      existing.signalIds.push(signal.id);
      if (!existing.products.includes(product)) existing.products.push(product);
    } else {
      groupsByRegistrant.set(registrant, {
        registrant,
        authority: registrantAuthority(registrant),
        products: [product],
        signalIds: [signal.id],
      });
    }
  }

  const groups = [...groupsByRegistrant.values()];
  // "Shared" here means a single authority backing more than one *distinct
  // product* — the finding this lens contributes over per-product independence.
  const sharedRegistrants = groups.filter((group) => group.products.length > 1);
  const consideredSignalIds = considered.map((signal) => signal.id);
  const singleRegistrant =
    considered.length >= 2 &&
    unknownRegistrantSignalIds.length === 0 &&
    groups.length === 1;

  return {
    kind: "registrant-provenance",
    consideredSignalIds,
    groups,
    distinctRegistrants: groups.length,
    unknownRegistrantSignalIds,
    sharedRegistrants,
    singleRegistrant,
    statement: registrantStatement(
      consideredSignalIds.length,
      groups,
      unknownRegistrantSignalIds
    ),
    limits: REGISTRANT_LIMITS,
  };
}

function registrantStatement(
  consideredCount: number,
  groups: readonly RegistrantGroup[],
  unknownRegistrantSignalIds: readonly EnvironmentSignalId[]
): string {
  if (consideredCount === 0) {
    return "No usable observations to assess for registering-authority provenance.";
  }

  const unknownCount = unknownRegistrantSignalIds.length;
  const unknownClause =
    unknownCount > 0
      ? ` DOI registrant not parseable for: ${unknownRegistrantSignalIds.join(", ")}.`
      : "";
  const knownCount = consideredCount - unknownCount;

  if (consideredCount === 1) {
    if (knownCount === 0) {
      return `1 usable observation whose DOI carries no parseable registrant; institutional independence is not assessable.${unknownClause}`;
    }
    return `1 usable observation registered by ${authorityText(groups[0])}; institutional independence is not applicable to a single signal.`;
  }

  if (knownCount === 0) {
    return `No parseable DOI registrant for the ${consideredCount} usable observations.${unknownClause}`;
  }

  const obs = `${consideredCount} usable observations`;

  if (groups.length === 1) {
    const group = groups[0];
    const productClause =
      group.products.length > 1
        ? `${group.products.length} distinct products, all `
        : "";
    const tail =
      unknownCount === 0
        ? `${obs} across ${productClause}trace to one registering authority — ${authorityText(group)}; distinct products but a single registrant, so they are not institutionally independent and a registration- or curation-authority-wide change would affect them together.`
        : `${knownCount} of ${obs} across ${productClause}trace to one registering authority — ${authorityText(group)}; distinct products but a single registrant, so they are not institutionally independent.${unknownClause}`;
    return tail;
  }

  const authorities = groups.map((group) => authorityText(group)).join("; ");
  const sharedClauses = groups
    .filter((group) => group.products.length > 1)
    .map(
      (group) =>
        `${group.signalIds.join(", ")} share ${authorityText(group)} across ${group.products.length} distinct products`
    )
    .join("; ");
  const sharedTail = sharedClauses
    ? ` ${sharedClauses} — co-registered, not institutionally independent.`
    : "";
  return `${obs} across ${groups.length} registering authorities: ${authorities}.${sharedTail}${unknownClause}`;
}

/** "NASA ESDIS (Earthdata) (10.5067)" when named, else "DOI registrant 10.xxxx". */
function authorityText(group: RegistrantGroup): string {
  return group.authority
    ? `${group.authority} (${group.registrant})`
    : `DOI registrant ${group.registrant}`;
}

function productLabel(source: DatasetRef): string {
  return `${source.shortName} v${source.version}`;
}
