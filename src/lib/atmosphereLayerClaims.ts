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
 * One of its rules outgrew that scope. The production-method rule — say whether
 * the field is a reanalysis or a land model — exists so a caption cannot read
 * as a measurement, and that has nothing to do with whether the quantity is
 * atmospheric. It therefore runs over MODEL_PRODUCED_LAYER_IDS, which adds the
 * second GLDAS variable (`soil`) to the atmosphere three.
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

/**
 * The layers whose rendered field is model output rather than a measured
 * quantity. This is the population the production-method rule below belongs
 * to, and it is deliberately wider than the atmosphere set: the rule exists so
 * a caption cannot read as a measurement, and that failure has nothing to do
 * with whether the quantity is atmospheric.
 *
 * `soil` is the layer that made the distinction worth drawing. It is the second
 * variable GLDAS_NOAH025_M supplies — the same land-surface model run that
 * produces `precip` — but it is categorized Water rather than Atmosphere, so
 * the audit that requires its sibling to say "land model" never read it, and
 * its caption named the model only as a proper noun ("GLDAS Noah") in a
 * parenthetical slot every observed layer fills with an instrument
 * ("MODIS/Terra", "ASTER GDEM"). A reader who learned the convention from the
 * other captions read it as one more sensor.
 */
export const MODEL_PRODUCED_LAYER_IDS = [
  "airtemp",
  "precip",
  "aerosol",
  "soil",
] as const;

export type ModelProducedLayerId = (typeof MODEL_PRODUCED_LAYER_IDS)[number];

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
 * Wording that names how each layer's field was produced. It is the provenance
 * a reader needs to weigh the number, and every model-produced layer owes it:
 * the aerosol caption was the first to omit it, and `soil` the second.
 *
 * The two GLDAS layers share a phrase list because they are the same model run.
 */
const PRODUCTION_METHOD_PHRASES: Record<
  ModelProducedLayerId,
  readonly string[]
> = {
  airtemp: ["reanalysis"],
  precip: ["land model", "land-surface model", "land surface model"],
  aerosol: ["reanalysis"],
  soil: ["land model", "land-surface model", "land surface model"],
};

export type AtmosphereCaptionFindingKind =
  "unsupported-claim" | "unstated-production-method";

export interface AtmosphereCaptionFinding {
  layerId: ModelProducedLayerId;
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

  findings.push(...auditProductionMethod(layerId, caption));

  return findings;
}

/**
 * Audit one caption for the statement of how its field was produced. Split out
 * from the claim audit because its population is wider: a caption that names no
 * reanalysis and no land model reads as a measurement whether or not the
 * quantity it renders is atmospheric.
 */
export function auditProductionMethod(
  layerId: ModelProducedLayerId,
  caption: string
): AtmosphereCaptionFinding[] {
  const haystack = caption.toLowerCase();
  const namesMethod = PRODUCTION_METHOD_PHRASES[layerId].some((phrase) =>
    haystack.includes(phrase)
  );
  if (namesMethod) return [];
  return [
    {
      layerId,
      kind: "unstated-production-method",
      phrase: null,
      claim: "production method",
      reason:
        "The caption is the only place most readers learn how the field was produced; a modelled field whose caption names no reanalysis or land model reads as a measurement.",
    },
  ];
}

/** Audit the captions the app actually ships for all atmosphere layers. */
export function auditAtmosphereCaptions(): AtmosphereCaptionFinding[] {
  return ATMOSPHERE_LAYER_IDS.flatMap((layerId) =>
    auditAtmosphereCaption(layerId, LAYERS[layerId].description)
  );
}

/**
 * Audit every shipped caption whose field is model output for its production
 * method. Wider than `auditAtmosphereCaptions` by exactly the layers that are
 * modelled without being atmospheric, which is how `soil` went unread.
 */
export function auditModelProducedCaptions(): AtmosphereCaptionFinding[] {
  return MODEL_PRODUCED_LAYER_IDS.flatMap((layerId) =>
    auditProductionMethod(layerId, LAYERS[layerId].description)
  );
}

/** One-line rendering of a finding, for a test failure message. */
export function formatAtmosphereCaptionFinding(
  finding: AtmosphereCaptionFinding
): string {
  const matched = finding.phrase === null ? "" : ` ("${finding.phrase}")`;
  return `${finding.layerId}: ${finding.kind} — ${finding.claim}${matched}; ${finding.reason}`;
}
