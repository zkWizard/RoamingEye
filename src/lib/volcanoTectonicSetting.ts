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
 * What a readout says when the catalog supplied no setting this parser could
 * read. Shared by both label builders below so the attributed form can detect
 * "there is nothing of GVP's here to credit" without matching a literal that
 * one of them might later reword.
 */
const NOT_RECORDED_TEXT = "tectonic setting not recorded";

/**
 * Short user-facing phrase for a parsed label. Unrecognized halves fall back
 * to the verbatim source text so nothing GVP said is hidden from the reader.
 */
export function tectonicSettingLabel(parsed: VolcanoTectonicSetting): string {
  if (parsed.setting === "not-supplied") return NOT_RECORDED_TEXT;
  const setting =
    parsed.setting === "unrecognized"
      ? (parsed.settingText ?? NOT_RECORDED_TEXT)
      : SETTING_TEXT[parsed.setting];
  const crust =
    parsed.crust === "unrecognized"
      ? parsed.crustText
      : parsed.crust === "not-supplied"
        ? null
        : CRUST_TEXT[parsed.crust];
  return crust === null ? setting : `${setting}, ${crust}`;
}

/**
 * {@link tectonicSettingLabel} with the catalog that assigned it named.
 *
 * The bare phrase — "subduction zone, continental crust" — carries nothing
 * saying whose assignment it is. On the place panel that field is already
 * rendered as "GVP tectonic setting: …"; on the globe tooltip it is the last
 * item of a `·`-joined line whose other items genuinely are RoamingEye's
 * readings of the record (a decoded type qualifier, a signed elevation read as
 * a depth, a derived eruption year), so an unattributed setting there reads as
 * a classification this app drew from the marker's position. That is precisely
 * the inference `plateBoundaryContext` refuses to make in prose.
 *
 * Deliberately terser than the panel's "GVP tectonic setting: ". The tooltip is
 * `white-space: nowrap` and `HoverInspector` can only flip it to the other side
 * of the cursor, so a line wider than the viewport is clipped rather than
 * wrapped; the longest bundled record already renders 179 characters. The value
 * itself names the setting, so the field name adds width without adding
 * meaning — what was missing is the credit.
 *
 * Returns the unattributed phrase when the parser read no setting at all:
 * there is nothing of GVP's to credit, and "GVP setting: tectonic setting not
 * recorded" would attribute an absence to the catalog.
 */
export function attributedTectonicSettingLabel(
  parsed: VolcanoTectonicSetting
): string {
  const label = tectonicSettingLabel(parsed);
  return label === NOT_RECORDED_TEXT ? label : `GVP setting: ${label}`;
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

/**
 * GVP's printed label for each class that carries kilometre bounds, in the
 * catalog's own wording so a reader can match it against a record row.
 */
const CRUST_BAND_TEXT: Record<
  "oceanic" | "intermediate" | "continental",
  string
> = {
  oceanic: "oceanic crust (< 15 km)",
  intermediate: "intermediate crust (15-25 km)",
  continental: "continental crust (> 25 km)",
};

/** Classes carrying printed bounds, thin to thick. Order is stable, not ranked. */
const BANDED_CLASSES = ["oceanic", "intermediate", "continental"] as const;

/**
 * Qualify the kilometre figures a record list prints inside GVP's compound
 * tectonic-setting label.
 *
 * A record row shows the label verbatim — "Subduction zone / Continental crust
 * (> 25 km)" — beside a summit elevation and coordinates, which *are* per-volcano
 * measurements. The parenthetical reads like a third one. It is not: it is the
 * printed bound of the crustal-thickness class GVP assigned, so every record in
 * that class carries the identical figure. The globe's volcano hover sidesteps
 * this by dropping the bounds (see tectonicSettingLabel), which leaves the place
 * panel as the only surface showing a number nothing explains.
 *
 * Counts are stated over the whole matched set, not the truncated visible rows,
 * and records carrying no kilometre figure are counted separately rather than
 * folded into a class they were never assigned.
 *
 * Returns null when no supplied record carries a printed band: there is then no
 * figure on screen to qualify, and saying so would read as a statement about the
 * crust beneath these volcanoes, which this cannot support.
 */
export function crustalThicknessBasisText(
  labels: readonly (string | null | undefined)[]
): string | null {
  const total = labels.length;
  if (total === 0) return null;

  const counts = new Map<string, number>();
  let bandedCount = 0;
  for (const label of labels) {
    const parsed = parseVolcanoTectonicSetting(label);
    if (parsed.crustalThicknessBandKm === null) continue;
    bandedCount += 1;
    counts.set(parsed.crust, (counts.get(parsed.crust) ?? 0) + 1);
  }
  if (bandedCount === 0) return null;

  const records = (count: number) => (count === 1 ? "record" : "records");
  const read = (count: number) => (count === 1 ? "reads" : "read");
  // Keyed by class, not by the verbatim source text: two spellings of one class
  // must not tally as two classes.
  const present = BANDED_CLASSES.filter((cls) => counts.has(cls));
  // One class covering every matched record is the common case, and saying so
  // states the uniformity the per-class counts only imply. A lone record has no
  // uniformity to report, so it is named rather than counted.
  const tallied =
    present.length === 1 && bandedCount === total
      ? total === 1
        ? `the matched record reads ${CRUST_BAND_TEXT[present[0]]}`
        : `all ${total} matched records read ${CRUST_BAND_TEXT[present[0]]}`
      : `of ${total} matched ${records(total)}, ` +
        present
          .map((cls) => {
            const count = counts.get(cls) ?? 0;
            return `${count} ${read(count)} ${CRUST_BAND_TEXT[cls]}`;
          })
          .join("; ");
  const unbanded = total - bandedCount;
  const remainder =
    unbanded === 0
      ? ""
      : ` ${unbanded} matched ${records(unbanded)} ` +
        `${unbanded === 1 ? "carries" : "carry"} no kilometre figure.`;

  return (
    "Crustal thickness here is a class GVP assigns, not a measurement at each " +
    `volcano: ${tallied}. The kilometre figures are the printed bounds of that ` +
    "class, so every record sharing a class carries the same figure whatever " +
    `lies beneath each summit.${remainder}`
  );
}

function normalize(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLocaleLowerCase("en-US");
}
