import { LAYERS } from "./timeline";

/**
 * Caption guard for the three atmosphere layers (2 m air temperature, total
 * precipitation rate, column aerosol optical depth).
 *
 * `Legend` renders `LAYERS[id].description` verbatim under the globe and
 * `LayerSelector` uses it as the option tooltip, so that one sentence is the
 * most-read scientific claim the app makes about a layer. The atmosphere
 * descriptors in lib/ are careful about what these fields can support —
 * aerosolLoading.ts alone disclaims the column-versus-surface conflation four
 * times — but nothing kept the rendered caption in step with them, and the
 * aerosol caption had drifted into advertising "air quality": a surface
 * concentration the layer cannot see, asserted in the one place a user reads
 * before they read anything else.
 *
 * This module states, per layer, what an atmosphere caption may not claim and
 * why, so re-introducing an over-claim fails a test instead of shipping.
 *
 * Limits of the check (it is a copy audit, nothing more):
 *  - It matches declared phrases. A clean audit means the caption makes no
 *    *checked* over-claim; it is not evidence the caption is complete or that
 *    some unlisted wording is honest.
 *  - It reads only the caption. It does not inspect the imagery, the colormap,
 *    or the values, and it can neither confirm nor refute what the layer
 *    actually renders.
 */

/** The layers whose rendered field is an atmospheric quantity. */
export const ATMOSPHERE_LAYER_IDS = ["airtemp", "precip", "aerosol"] as const;

export type AtmosphereLayerId = (typeof ATMOSPHERE_LAYER_IDS)[number];

/** A claim an atmosphere caption must not make, and the reason it cannot. */
export interface CaptionClaimRule {
  /** Short name of the claim, e.g. "surface air quality". */
  claim: string;
  /** Lower-cased phrases that assert the claim. */
  phrases: readonly string[];
  /** Why the rendered field cannot support it. */
  reason: string;
}

/**
 * Applies to every atmosphere layer: all three render an archived monthly
 * field, and all three are model output rather than a directly measured
 * quantity (MERRA-2 is a reanalysis; GLDAS is a land-surface model).
 */
const SHARED_CLAIM_RULES: readonly CaptionClaimRule[] = [
  {
    claim: "future conditions",
    phrases: ["forecast", "predict", "outlook", "will be", "expected to"],
    reason:
      "The layer renders an archived monthly field; no month after the last published one is available to it, so it supports no statement about a future value.",
  },
  {
    claim: "direct measurement",
    phrases: [
      "directly measured",
      "direct measurement",
      "measured by satellite",
      "satellite measurement",
      "in situ",
      "in-situ",
    ],
    reason:
      "Every atmosphere layer is model output — MERRA-2 is a reanalysis (a model constrained by assimilated observations) and GLDAS is a land-surface model — so a rendered value is a modelled monthly mean, not a direct measurement.",
  },
];

/** Per-layer claims on top of the shared ones. */
const LAYER_CLAIM_RULES: Record<
  AtmosphereLayerId,
  readonly CaptionClaimRule[]
> = {
  airtemp: [],
  precip: [
    {
      claim: "accumulated depth",
      phrases: ["rainfall total", "accumulation", "monthly total"],
      reason:
        "The layer renders a precipitation *rate*; an accumulated depth is a separate quantity that requires multiplying by the length of the month, which the caption's number has not had done to it.",
    },
  ],
  aerosol: [
    {
      claim: "surface air quality",
      phrases: [
        "air quality",
        "air-quality",
        "pollution",
        "pollutant",
        "smog",
        "pm2.5",
        "pm10",
        "surface concentration",
        "breathe",
        "health",
      ],
      reason:
        "AOD at 550 nm is a whole-column optical thickness. A loaded column can sit above clean surface air and a clean column above loaded surface air, so the layer cannot see the surface concentration an air-quality claim asserts, and it is not a regulatory or health index.",
    },
  ],
};

/**
 * Wording that names how each layer's field was produced. Both sibling
 * atmosphere captions already carry this and it is the provenance a reader
 * needs to weigh the number; the aerosol caption was the one that omitted it.
 */
const PRODUCTION_METHOD_PHRASES: Record<AtmosphereLayerId, readonly string[]> =
  {
    airtemp: ["reanalysis"],
    precip: ["land model", "land-surface model", "land surface model"],
    aerosol: ["reanalysis"],
  };

export type AtmosphereCaptionFindingKind =
  "unsupported-claim" | "unstated-production-method";

export interface AtmosphereCaptionFinding {
  layerId: AtmosphereLayerId;
  kind: AtmosphereCaptionFindingKind;
  /** The matched phrase, or null when the finding is a missing statement. */
  phrase: string | null;
  claim: string;
  reason: string;
}

/** Every claim rule that applies to one atmosphere layer, shared first. */
export function atmosphereClaimRules(
  layerId: AtmosphereLayerId
): readonly CaptionClaimRule[] {
  return [...SHARED_CLAIM_RULES, ...LAYER_CLAIM_RULES[layerId]];
}

/**
 * Audit one caption against the claims its layer cannot support. Matching is
 * case-insensitive substring matching on declared phrases — deliberately blunt,
 * because a caption is one short sentence and a near-miss spelling of an
 * over-claim should still be caught by a human reading the rule.
 */
export function auditAtmosphereCaption(
  layerId: AtmosphereLayerId,
  caption: string
): AtmosphereCaptionFinding[] {
  const haystack = caption.toLowerCase();
  const findings: AtmosphereCaptionFinding[] = [];

  for (const rule of atmosphereClaimRules(layerId)) {
    for (const phrase of rule.phrases) {
      if (!haystack.includes(phrase)) continue;
      findings.push({
        layerId,
        kind: "unsupported-claim",
        phrase,
        claim: rule.claim,
        reason: rule.reason,
      });
    }
  }

  const namesMethod = PRODUCTION_METHOD_PHRASES[layerId].some((phrase) =>
    haystack.includes(phrase)
  );
  if (!namesMethod) {
    findings.push({
      layerId,
      kind: "unstated-production-method",
      phrase: null,
      claim: "production method",
      reason:
        "The caption is the only place most readers learn how the field was produced; an atmosphere caption that names no reanalysis or land model reads as a measurement.",
    });
  }

  return findings;
}

/** Audit the captions the app actually ships for all atmosphere layers. */
export function auditAtmosphereCaptions(): AtmosphereCaptionFinding[] {
  return ATMOSPHERE_LAYER_IDS.flatMap((layerId) =>
    auditAtmosphereCaption(layerId, LAYERS[layerId].description)
  );
}

/** One-line rendering of a finding, for a test failure message. */
export function formatAtmosphereCaptionFinding(
  finding: AtmosphereCaptionFinding
): string {
  const matched = finding.phrase === null ? "" : ` ("${finding.phrase}")`;
  return `${finding.layerId}: ${finding.kind} — ${finding.claim}${matched}; ${finding.reason}`;
}
