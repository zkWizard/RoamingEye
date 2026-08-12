import { LAYERS, LAYER_ORDER } from "./timeline";
import { HIRES_LAYER } from "./imagery";

/**
 * What quantity does a GIBS layer actually render?
 *
 * RoamingEye cites its sources by dataset DOI. That is the right unit for a
 * *citation* but not for an *identity*: one dataset supplies many variables.
 * GLDAS_NOAH025_M (10.5067/SXAVCZFAQLNO) backs both the precipitation and the
 * soil-moisture layer, and MOD13A3 (10.5067/MODIS/MOD13A3.061) backs both NDVI
 * and EVI — so the DOI alone cannot say which number is on screen. The
 * authoritative statement of the rendered variable is the layer's own
 * `<ows:Title>` in the GIBS WMTS capabilities, which nothing in this repo read.
 *
 * That gap is not hypothetical. `GLDAS_Underground_Soil_Moisture_Monthly` is
 * described here as root-zone soil moisture; GIBS's title says "Soil Moisture
 * (Monthly, 0-10 cm, Noah LSM, GLDAS)" — a different Noah variable holding
 * roughly an order of magnitude less water. Every existing guard passed,
 * because every existing guard checks that an identifier still EXISTS
 * (contract/gibs-catalog) or that its dataset mapping still holds
 * (contract/data-citations), never what quantity it IS.
 *
 * So: pin each rendered layer's advertised title, parse the qualifiers that
 * change what the number means (measurement depth or height, wavelength, grid
 * resolution, time of observation, rate-vs-total), and report which of those
 * our own user-facing copy leaves unstated.
 *
 * Two limits, stated plainly. This asserts nothing about whether GIBS's title
 * is *correct* — only that our description of the variable agrees with the
 * source's own; the title is the best client-side reference available, not
 * ground truth. And an unstated qualifier is a documentation gap, not evidence
 * that the rendered pixels are wrong.
 *
 * Pure and offline-testable; the live-capabilities run is the weekly contract
 * test (contract/variable-identity.contract.test.ts).
 */

/** The kinds of qualifier a source title states about its variable. */
export type QualifierKind =
  | "depth"
  | "height"
  | "wavelength"
  | "resolution"
  | "observationTime"
  | "statistic"
  | "compositing";

export interface VariableQualifier {
  kind: QualifierKind;
  /** Verbatim, as the source title states it (e.g. "0-10 cm", "550nm"). */
  text: string;
  /** Plain-language phrase, for a caption or an export header. */
  phrase: string;
  /**
   * Accepted surface forms in our own copy. Deliberately permissive about
   * spacing, hyphens, en dashes, and spelled-out units, so a description that
   * says "0–10 cm" satisfies a title that says "0-10 cm".
   */
  pattern: RegExp;
  /**
   * True when omitting this qualifier changes what a reader thinks the number
   * IS. Compositing is not discriminating — the whole app is a monthly
   * timeline and each layer's cadence is already in its LayerConfig — and
   * neither is a "Total"/"Average"/"Percent" statistic, which the legend's
   * units already carry. A measurement depth, a measurement height, a
   * wavelength, a native grid size, a daytime-only overpass, and a rate (as
   * opposed to a total) all do.
   */
  discriminating: boolean;
}

/** Escape a literal for embedding in a generated RegExp. */
function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Any hyphen a range might be written with, in a title or in our copy. */
const DASH = "[-‐‑‒–—]";

interface Extractor {
  kind: QualifierKind;
  /** Global regex over the source title. */
  re: RegExp;
  build(m: RegExpExecArray): Omit<VariableQualifier, "kind">;
}

/**
 * Ordered so the more specific pattern wins: "2-meter" is a measurement
 * height, not a 2-metre grid, so the hyphenated height runs before the
 * whitespace-separated resolution (which is why the resolution pattern
 * requires whitespace before its unit rather than accepting a hyphen).
 */
const EXTRACTORS: Extractor[] = [
  {
    kind: "depth",
    re: new RegExp(`\\b(\\d+)\\s*${DASH}\\s*(\\d+)\\s*(cm|mm)\\b`, "g"),
    build: (m) => ({
      text: `${m[1]}-${m[2]} ${m[3]}`,
      phrase: `${m[1]}–${m[2]} ${m[3]} below the surface`,
      pattern: new RegExp(
        `\\b${m[1]}\\s*${DASH}\\s*${m[2]}\\s*${m[3]}\\b`,
        "i"
      ),
      discriminating: true,
    }),
  },
  {
    kind: "height",
    re: /\b(\d+)-(?:meter|metre|m)\b/g,
    build: (m) => ({
      text: `${m[1]}-meter`,
      phrase: `${m[1]} m above the surface`,
      pattern: new RegExp(
        `\\b${m[1]}\\s*(?:${DASH}|\\s)?\\s*(?:m|meters?|metres?)\\b`,
        "i"
      ),
      discriminating: true,
    }),
  },
  {
    kind: "wavelength",
    re: /\b(\d+(?:\.\d+)?)\s*(nm|µm|um)\b/g,
    build: (m) => ({
      text: `${m[1]}${m[2]}`,
      phrase: `at ${m[1]} ${m[2]}`,
      pattern: new RegExp(
        `\\b${escapeRe(m[1])}\\s*(?:${escapeRe(m[2])}|nanomet(?:er|re)s?|micromet(?:er|re)s?)\\b`,
        "i"
      ),
      discriminating: true,
    }),
  },
  {
    kind: "resolution",
    re: /\b(\d+(?:\.\d+)?)\s+(km|m)\b/g,
    build: (m) => ({
      text: `${m[1]} ${m[2]}`,
      phrase: `${m[1]} ${m[2]} native grid`,
      pattern: new RegExp(
        `\\b${escapeRe(m[1])}\\s*${DASH}?\\s*${escapeRe(m[2])}\\b`,
        "i"
      ),
      discriminating: true,
    }),
  },
  {
    kind: "observationTime",
    re: /\b(Day|Night|Daytime|Nighttime)\b/g,
    build: (m) => {
      const night = /^night/i.test(m[1]);
      return {
        text: m[1],
        phrase: night ? "night overpass only" : "daytime overpass only",
        pattern: night
          ? /\b(night|nighttime|nocturnal)\b/i
          : /\b(day|daytime|daylight)\b/i,
        discriminating: true,
      };
    },
  },
  {
    kind: "statistic",
    re: /\b(Rate|Average|Percent|Total|Mean|Anomaly)\b/g,
    build: (m) => {
      const rate = /^rate$/i.test(m[1]);
      return {
        text: m[1],
        // A rate is the one statistic a reader routinely mistakes for its
        // opposite — "total precipitation rate" is mm per unit time, not the
        // month's accumulation.
        phrase: rate ? "a rate, not an accumulated total" : m[1].toLowerCase(),
        pattern: new RegExp(`\\b${m[1]}s?\\b`, "i"),
        discriminating: rate,
      };
    },
  },
  {
    kind: "compositing",
    re: /\b(Monthly|Annual|Daily|Weekly)\b/g,
    build: (m) => ({
      text: m[1],
      phrase: m[1].toLowerCase(),
      pattern: new RegExp(`\\b${m[1]}\\b`, "i"),
      discriminating: false,
    }),
  },
];

/**
 * Parse the qualifiers a GIBS `<ows:Title>` states about its variable.
 * Deduplicated by kind+text (a title may repeat a word), and returned in
 * extractor order so the output is stable enough to assert on.
 */
export function variableQualifiers(gibsTitle: string): VariableQualifier[] {
  const out: VariableQualifier[] = [];
  const seen = new Set<string>();
  for (const extractor of EXTRACTORS) {
    // Fresh regex per call: the extractors carry /g and therefore lastIndex.
    const re = new RegExp(extractor.re.source, extractor.re.flags);
    let m: RegExpExecArray | null;
    while ((m = re.exec(gibsTitle)) !== null) {
      const built = extractor.build(m);
      const key = `${extractor.kind}:${built.text.toLowerCase()}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ kind: extractor.kind, ...built });
    }
  }
  return out;
}

/**
 * The variable name a title leads with, before its parenthesised qualifier
 * list — "Soil Moisture" from "Soil Moisture (Monthly, 0-10 cm, Noah LSM,
 * GLDAS)". Trailing punctuation is trimmed because GIBS's own titles are not
 * uniformly punctuated (MERRA-2's carry a comma before the parenthesis).
 */
export function variableName(gibsTitle: string): string {
  return gibsTitle
    .split("(")[0]
    .replace(/[\s,;:]+$/, "")
    .trim();
}

/**
 * A one-line, fully qualified statement of what a layer renders, suitable for
 * a figure caption or an export header: the variable as GIBS names it, then
 * every qualifier its title states, then the identifier the pixels came from.
 * Everything in the string is copied from the source's own metadata — nothing
 * is paraphrased and nothing is inferred.
 *
 * A qualifier already spelled out in the variable's own name is not repeated:
 * "Total Precipitation Rate" needs no parenthetical restating that it is a
 * rate, and "…Extinction 550nm" already carries its band.
 */
export function identityStatement(wmsLayer: string, gibsTitle: string): string {
  const name = variableName(gibsTitle);
  const lowerName = name.toLowerCase();
  const phrases = variableQualifiers(gibsTitle)
    .filter((q) => !lowerName.includes(q.text.toLowerCase()))
    .map((q) => q.phrase)
    .join(", ");
  return phrases
    ? `${name} (${phrases}) — GIBS ${wmsLayer}`
    : `${name} — GIBS ${wmsLayer}`;
}

/**
 * GIBS's advertised `<ows:Title>` for every layer RoamingEye renders, read from
 * the live WMTS capabilities on 2026-08-11 and pinned here. The weekly contract
 * test re-reads them, so if NASA re-points an identifier at a different
 * quantity — the failure mode that produced the soil-moisture mislabel — CI
 * names the layer instead of the app quietly rendering something else.
 */
export const GIBS_VARIABLE_TITLES: Record<string, string> = {
  MODIS_Terra_L3_NDVI_Monthly: "Vegetation Index (L3, Monthly, MODIS, Terra)",
  MODIS_Terra_L3_EVI_Monthly:
    "Enhanced Vegetation Index (L3, Monthly, MODIS, Terra)",
  MODIS_Terra_L3_Land_Surface_Temp_Monthly_Day:
    "Land Surface Temperature (L3, Monthly, Day, MODIS, Terra)",
  MERRA2_2m_Air_Temperature_Monthly:
    "2-meter Air Temperature, (Monthly, MERRA2)",
  MODIS_Aqua_L3_SST_Thermal_9km_Day_Monthly:
    "Sea Surface Temperature (L3, Day, Monthly, Thermal, 9 km, MODIS, Aqua)",
  GLDAS_Surface_Total_Precipitation_Rate_Monthly:
    "Total Precipitation Rate (Monthly, Surface, Noah LSM,  GLDAS)",
  GLDAS_Underground_Soil_Moisture_Monthly:
    "Soil Moisture (Monthly, 0-10 cm, Noah LSM, GLDAS)",
  MODIS_Terra_L3_Snow_Cover_Monthly_Average_Pct:
    "Snow Cover (L3, Monthly Average Percent, MODIS, Terra)",
  MERRA2_Total_Aerosol_Optical_Thickness_550nm_Extinction_Monthly:
    "Total Aerosol Optical Thickness Extinction 550nm (Monthly, MERRA2)",
  MODIS_Combined_L3_IGBP_Land_Cover_Type_Annual:
    "Land Cover Type (L3, IGBP, Annual, MODIS, Aqua+Terra)",
  ASTER_GDEM_Color_Shaded_Relief:
    "Digital Elevation Model (Color Shaded Relief, ASTER, Terra)",
  HLS_S30_Nadir_BRDF_Adjusted_Reflectance:
    "Reflectance (Nadir BRDF-Adjusted,  Sentinel-2 / MSI)",
};

/** One rendered layer, paired with the source's own statement of its variable. */
export interface RenderedLayerIdentity {
  /** Our layer id, or "hls" for the high-resolution study patch. */
  id: string;
  /** The GIBS layer identifier we request tiles for. */
  wmsLayer: string;
  /** GIBS's `<ows:Title>` (pinned above). */
  gibsTitle: string;
  /** Our own user-facing copy for the same layer: label plus description. */
  ourCopy: string;
}

/**
 * Every layer whose pixels reach a user, paired with its pinned source title.
 * Built from LAYER_ORDER plus the high-res study patch, so a layer added to the
 * catalog without a pinned title is a missing entry the tests catch rather than
 * a silent omission.
 */
export function renderedLayerIdentities(): RenderedLayerIdentity[] {
  const entries = [
    ...LAYER_ORDER.map((id) => ({
      id: id as string,
      wmsLayer: LAYERS[id].wmsLayer,
      ourCopy: `${LAYERS[id].label} ${LAYERS[id].description}`,
    })),
    {
      id: HIRES_LAYER.id as string,
      wmsLayer: HIRES_LAYER.wmsLayer as string,
      ourCopy: HIRES_LAYER.label as string,
    },
  ];
  return entries.map((e) => ({
    ...e,
    gibsTitle: GIBS_VARIABLE_TITLES[e.wmsLayer] ?? "",
  }));
}

/** True when our copy states a qualifier in any accepted surface form. */
export function statesQualifier(
  ourCopy: string,
  qualifier: VariableQualifier
): boolean {
  return qualifier.pattern.test(ourCopy);
}

/**
 * The discriminating qualifiers the source states that our own copy does not —
 * the places where a reader could take our paraphrase for the whole story. A
 * false negative (we judge a qualifier stated when the wording is only
 * incidentally similar) is the safe direction here: this report exists to raise
 * gaps, not to gate wording.
 */
export function unstatedQualifiers(
  identity: RenderedLayerIdentity
): VariableQualifier[] {
  return variableQualifiers(identity.gibsTitle)
    .filter((q) => q.discriminating)
    .filter((q) => !statesQualifier(identity.ourCopy, q));
}

/**
 * The identity gaps measured across the catalog on 2026-08-11, layer id to the
 * reason each is still open. This is a committed measurement in the same spirit
 * as MEASURED_INVERSION: the unit test asserts the live catalog's gaps are a
 * SUBSET of this list, so closing one of these never breaks CI while a NEW
 * mislabel — the next `soil` — fails immediately, naming the layer and the
 * qualifier our copy dropped.
 */
export const UNSTATED_IDENTITY_GAPS: Record<string, string> = {
  // GIBS: "0-10 cm"; our copy says root-zone, a different Noah variable.
  // Being corrected in the soil-moisture depth work (#733).
  soil: "depth: source says 0-10 cm, our copy says root-zone",
  // GIBS: "Day, ... 9 km". Daytime-only sampling and the 9 km native bin are
  // both material to a coastal or diurnal reading, and neither is in our copy.
  sst: "observationTime + resolution: daytime-only overpass, 9 km native grid",
  // GIBS: "550nm". Aerosol optical thickness is wavelength-dependent — an AOD
  // with no band stated is not a complete quantity.
  aerosol: "wavelength: optical thickness is defined at 550 nm",
};
