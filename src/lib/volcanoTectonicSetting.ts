/**
 * Read GVP's compound tectonic-setting label as the two classifications it
 * encodes.
 *
 * Smithsonian GVP publishes one string per volcano — for example
 * "Subduction zone / Continental crust (> 25 km)" — pairing a plate-tectonic
 * setting with a crustal-thickness class. Both halves are catalog assignments
 * GVP made for the volcano's location. Neither is measured by RoamingEye, and
 * the kilometre figures are the printed bounds of the class GVP assigned, not
 * a crustal thickness measured beneath the summit. Adjacent classes share
 * their printed edge (GVP prints "< 15 km", "15-25 km", "> 25 km"), so the
 * band is reproduced as printed rather than given invented open/closed
 * semantics.
 *
 * The parser retains the source string, maps each half against a closed
 * vocabulary, and reports anything outside it as "unrecognized" rather than
 * guessing — a future GVP refresh that adds a setting surfaces as an
 * unrecognized value (and a failing vocabulary guard) instead of being folded
 * silently into an existing class.
 *
 * This is a reading of a catalog label. It is not a hazard assessment, an
 * eruption forecast, or a claim about why a volcano is where it is.
 */

/** GVP plate-tectonic setting, or how this parser failed to read one. */
export type TectonicSettingClass =
  | "subduction-zone"
  | "rift-zone"
  | "intraplate"
  /** Text supplied, but outside this parser's closed vocabulary. */
  | "unrecognized"
  /** The catalog supplied no tectonic-setting label at all. */
  | "not-supplied";

/** GVP crustal-thickness class, or how this parser failed to read one. */
export type CrustalThicknessClass =
  | "oceanic"
  | "intermediate"
  | "continental"
  /** GVP explicitly recorded the thickness class as unknown. */
  | "unknown"
  | "unrecognized"
  | "not-supplied";

/**
 * The kilometre bounds GVP prints for a crustal-thickness class. Null on a
 * side means the printed class is open in that direction ("< 15 km" has no
 * lower bound, "> 25 km" no upper one).
 */
export interface CrustalThicknessBand {
  minKm: number | null;
  maxKm: number | null;
}

export interface VolcanoTectonicSetting {
  /** The GVP label exactly as supplied; null when the catalog omitted it. */
  raw: string | null;
  setting: TectonicSettingClass;
  /** Verbatim left-hand half of the label, or null when there was none. */
  settingText: string | null;
  crust: CrustalThicknessClass;
  /** Verbatim right-hand half of the label, or null when there was none. */
  crustText: string | null;
  /**
   * Bounds of the assigned class, as printed by GVP. Null whenever no class
   * with printed bounds was read — including GVP's own "unknown". Never a
   * thickness measured at this volcano.
   */
  crustalThicknessBandKm: CrustalThicknessBand | null;
}

const SETTINGS: ReadonlyMap<string, TectonicSettingClass> = new Map([
  ["subduction zone", "subduction-zone"],
  ["rift zone", "rift-zone"],
  ["intraplate", "intraplate"],
]);

const CRUSTS: ReadonlyMap<
  string,
  {
    readonly cls: CrustalThicknessClass;
    readonly band: CrustalThicknessBand | null;
  }
> = new Map([
  [
    "oceanic crust (< 15 km)",
    { cls: "oceanic", band: { minKm: null, maxKm: 15 } },
  ],
  [
    "intermediate crust (15-25 km)",
    { cls: "intermediate", band: { minKm: 15, maxKm: 25 } },
  ],
  [
    "continental crust (> 25 km)",
    { cls: "continental", band: { minKm: 25, maxKm: null } },
  ],
  ["crustal thickness unknown", { cls: "unknown", band: null }],
]);

/** Setting classes in GVP's own label order, for stable tallies and keys. */
export const TECTONIC_SETTING_CLASSES: readonly TectonicSettingClass[] = [
  "subduction-zone",
  "rift-zone",
  "intraplate",
  "unrecognized",
  "not-supplied",
];

/** Crustal-thickness classes ordered thin to thick, then the non-readings. */
export const CRUSTAL_THICKNESS_CLASSES: readonly CrustalThicknessClass[] = [
  "oceanic",
  "intermediate",
  "continental",
  "unknown",
  "unrecognized",
  "not-supplied",
];

/**
 * Split a GVP tectonic-setting label into its setting and crustal-thickness
 * halves. Only the first "/" separates them; anything after it stays in the
 * crust half verbatim, so an unfamiliar grammar reads as unrecognized rather
 * than being silently truncated.
 */
export function parseVolcanoTectonicSetting(
  label: string | null | undefined
): VolcanoTectonicSetting {
  const raw =
    typeof label === "string" && label.trim().length > 0 ? label : null;
  if (raw === null) {
    return {
      raw: null,
      setting: "not-supplied",
      settingText: null,
      crust: "not-supplied",
      crustText: null,
      crustalThicknessBandKm: null,
    };
  }

  const separator = raw.indexOf("/");
  const settingText =
    separator === -1 ? raw.trim() : raw.slice(0, separator).trim();
  const crustText =
    separator === -1 ? null : raw.slice(separator + 1).trim() || null;

  const crust = crustText === null ? null : CRUSTS.get(normalize(crustText));
  return {
    raw,
    setting: SETTINGS.get(normalize(settingText)) ?? "unrecognized",
    settingText: settingText.length > 0 ? settingText : null,
    // A label that supplied no readable crust half is text this parser could
    // not read, not an absent catalog field — keep those states distinct.
    crust: crust?.cls ?? "unrecognized",
    crustText,
    crustalThicknessBandKm: crust?.band ?? null,
  };
}

/**
 * Short user-facing phrase for a parsed label. Unrecognized halves fall back
 * to the verbatim source text so nothing GVP said is hidden from the reader.
 */
export function tectonicSettingLabel(parsed: VolcanoTectonicSetting): string {
  if (parsed.setting === "not-supplied") return "tectonic setting not recorded";
  const setting =
    parsed.setting === "unrecognized"
      ? (parsed.settingText ?? "tectonic setting not recorded")
      : SETTING_TEXT[parsed.setting];
  const crust =
    parsed.crust === "unrecognized"
      ? parsed.crustText
      : parsed.crust === "not-supplied"
        ? null
        : CRUST_TEXT[parsed.crust];
  return crust === null ? setting : `${setting}, ${crust}`;
}

const SETTING_TEXT: Record<
  "subduction-zone" | "rift-zone" | "intraplate",
  string
> = {
  "subduction-zone": "subduction zone",
  "rift-zone": "rift zone",
  intraplate: "intraplate",
};

const CRUST_TEXT: Record<
  "oceanic" | "intermediate" | "continental" | "unknown",
  string
> = {
  oceanic: "oceanic crust",
  intermediate: "intermediate crust",
  continental: "continental crust",
  unknown: "crustal thickness unknown",
};

function normalize(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLocaleLowerCase("en-US");
}
