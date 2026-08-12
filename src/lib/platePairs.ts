import type { PlateBoundary } from "./plates";

/**
 * Decode Bird (2003) PB2002 plate-pair boundary labels into the two bordering
 * plates.
 *
 * Each polyline in the plate-boundary overlay (see plates.ts) carries only a
 * plate-pair label such as "AF-AN": a pair of two-letter plate codes from the
 * PB2002 model. This module resolves those codes into the model's documented
 * plate names so a place panel or export can name the plates a boundary
 * separates.
 *
 * The delimiter between the two codes is itself part of the model: PB2002
 * encodes subduction polarity in it (see PB2002_LABEL_CONVENTION). This module
 * reads that encoding back out rather than discarding it.
 *
 * Categorical decode only. Names and polarity come from the fixed PB2002
 * vocabulary and label grammar; the module never measures anything, averages
 * codes, or classifies the boundary's non-subduction type, motion rate,
 * activity, or hazard. Unknown codes are surfaced (name: null), never dropped,
 * so the provenance stays honest.
 */

export const PB2002_PLATE_MODEL_SOURCE = {
  name: "PB2002 plate model",
  citation:
    "Bird, P. (2003), An updated digital model of plate boundaries, Geochemistry, Geophysics, Geosystems 4(3)",
  doi: "10.1029/2001GC000252",
  url: "https://doi.org/10.1029/2001GC000252",
  digitization: "open tectonicplates GeoJSON digitization",
  digitizationUrl: "https://github.com/fraxen/tectonicplates",
  localFile: "public/data/plate-boundaries.geojson",
  vocabulary: "PB2002 two-letter plate identifiers (Bird 2003, Table 1)",
} as const;

/**
 * The PB2002 plate vocabulary: two-letter identifier to plate name, exactly as
 * enumerated in Bird (2003), Table 1 (52 plates). These are categorical labels,
 * not measurements. Frozen so callers cannot mutate the shared vocabulary.
 */
export const PB2002_PLATE_NAMES: Readonly<Record<string, string>> =
  Object.freeze({
    AF: "Africa",
    AM: "Amur",
    AN: "Antarctica",
    AP: "Altiplano",
    AR: "Arabia",
    AS: "Aegean Sea",
    AT: "Anatolia",
    AU: "Australia",
    BH: "Birds Head",
    BR: "Balmoral Reef",
    BS: "Banda Sea",
    BU: "Burma",
    CA: "Caribbean",
    CL: "Caroline",
    CO: "Cocos",
    CR: "Conway Reef",
    EA: "Easter",
    EU: "Eurasia",
    FT: "Futuna",
    GP: "Galapagos",
    IN: "India",
    JF: "Juan de Fuca",
    JZ: "Juan Fernandez",
    KE: "Kermadec",
    MA: "Mariana",
    MN: "Manus",
    MO: "Maoke",
    MS: "Molucca Sea",
    NA: "North America",
    NB: "North Bismarck",
    ND: "North Andes",
    NH: "New Hebrides",
    NI: "Niuafo'ou",
    NZ: "Nazca",
    OK: "Okhotsk",
    ON: "Okinawa",
    PA: "Pacific",
    PM: "Panama",
    PS: "Philippine Sea",
    RI: "Rivera",
    SA: "South America",
    SB: "South Bismarck",
    SC: "Scotia",
    SL: "Shetland",
    SO: "Somalia",
    SS: "Solomon Sea",
    SU: "Sunda",
    SW: "Sandwich",
    TI: "Timor",
    TO: "Tonga",
    WL: "Woodlark",
    YA: "Yangtze",
  });

/**
 * The PB2002 boundary-label grammar, quoted from the model's own data
 * documentation so the decode below can be checked against its source.
 *
 * Bird (2003), electronic supplement readme (2001GC000252_readme.txt),
 * mirrored in the tectonicplates digitization this app bundles:
 *
 *   "The title record for each segment has 5 bytes, in which the first two
 *    bytes give the identifier of the plate on the left (as one travels along
 *    the segment, looking down from outside the Earth) and bytes 4-5 give the
 *    identifier of the plate on the right."
 *
 *   "In byte 3, the symbol '/' indicates that the right-hand plate subducts
 *    under the left-hand plate, while symbol '\' indicates the opposite
 *    polarity of subduction. All non-subducting plate boundary segments have a
 *    hyphen '-' in byte 3."
 *
 * Left/right are properties of the label itself, so the polarity decode needs
 * only the label — never the rendered polyline's traversal direction.
 */
export const PB2002_LABEL_CONVENTION = {
  source: "Bird (2003) PB2002 electronic supplement readme, byte-3 convention",
  url: "https://raw.githubusercontent.com/fraxen/tectonicplates/master/original/README.md",
  separators: {
    "-": "non-subducting segment",
    "/": "right-hand plate subducts under the left-hand plate",
    "\\": "left-hand plate subducts under the right-hand plate",
  },
} as const;

/**
 * Delimiter observed between the two codes in a PB2002 label. Byte 3 of the
 * source model's title record: "/" and "\" encode subduction polarity, "-"
 * marks a non-subducting segment (see PB2002_LABEL_CONVENTION).
 *
 * It is NOT the model's 7-way boundary-class code. PB2002 classifies each
 * boundary step as one of CRB/CTF/CCB/OSR/OTF/OCB/SUB in its separate steps
 * file, which this app does not bundle; a hyphen therefore says only "not
 * subduction", never which of the non-subducting classes applies.
 */
export type PlateSeparator = "-" | "/" | "\\";

/**
 * The subduction polarity a PB2002 label's delimiter encodes, resolved to the
 * two plates involved.
 *
 * This reports what the model records for the segment: which plate descends
 * and which overrides. It is a categorical assertion from PB2002's linework,
 * not a measured convergence rate, a slab geometry, a depth, an activity
 * level, or a hazard statement.
 */
export interface PlatePairSubduction {
  /**
   * True only when the delimiter encodes a polarity ("/" or "\"). A hyphen is
   * an explicit "not a subduction segment" in PB2002, not missing data.
   */
  encoded: boolean;
  /** The descending (downgoing) plate; null when no polarity is encoded. */
  subducting: PlateIdentity | null;
  /** The overriding plate; null when no polarity is encoded. */
  overriding: PlateIdentity | null;
}

export interface PlateIdentity {
  /** Two-letter PB2002 code, normalized to upper case, e.g. "AF". */
  code: string;
  /** PB2002 plate name, or null when the code is not in the vocabulary. */
  name: string | null;
}

export interface DecodedPlatePair {
  /** Original label exactly as supplied, e.g. "AF-AN". */
  label: string;
  /**
   * The two plates in the order they appear in the label, which PB2002 defines
   * as [left, right] along the digitized segment.
   */
  plates: [PlateIdentity, PlateIdentity];
  /** The delimiter found between the two codes. */
  separator: PlateSeparator;
  /** Subduction polarity read back out of the delimiter (byte 3). */
  subduction: PlatePairSubduction;
  /**
   * Order- and delimiter-independent grouping key: both codes upper-cased and
   * sorted, joined with "-". "AF-AN", "AN-AF", and "AN\\AF" all yield "AF-AN".
   */
  canonicalKey: string;
  /** True only when both codes resolve to a PB2002 plate name. */
  recognized: boolean;
}

const PLATE_PAIR_RE = /^([A-Za-z]{2})([-/\\])([A-Za-z]{2})$/;

/** Look up a PB2002 plate name; null for any code outside the vocabulary. */
export function plateName(code: string): string | null {
  const key = code.trim().toUpperCase();
  return PB2002_PLATE_NAMES[key] ?? null;
}

function identity(code: string): PlateIdentity {
  const normalized = code.toUpperCase();
  return { code: normalized, name: PB2002_PLATE_NAMES[normalized] ?? null };
}

/**
 * Decode a PB2002 plate-pair label into its two bordering plates. Returns null
 * when the label is not a two-code pair (e.g. empty, or the unlabeled ""),
 * rather than guessing — a shape this module cannot decode is not forced into
 * one. Codes not present in the vocabulary decode to a name of null.
 */
export function decodePlatePair(label: string): DecodedPlatePair | null {
  const match = PLATE_PAIR_RE.exec(label.trim());
  if (!match) return null;

  const [, first, separator, second] = match;
  const plates: [PlateIdentity, PlateIdentity] = [
    identity(first),
    identity(second),
  ];
  const canonicalKey = [plates[0].code, plates[1].code].sort().join("-");

  return {
    label,
    plates,
    separator: separator as PlateSeparator,
    subduction: subductionFor(separator as PlateSeparator, plates),
    canonicalKey,
    recognized: plates.every((plate) => plate.name !== null),
  };
}

/**
 * Resolve byte 3 into the descending and overriding plates. "/" means the
 * right-hand plate goes down; "\" is the opposite polarity; "-" encodes no
 * subduction at all.
 */
function subductionFor(
  separator: PlateSeparator,
  [left, right]: readonly [PlateIdentity, PlateIdentity]
): PlatePairSubduction {
  if (separator === "/") {
    return { encoded: true, subducting: right, overriding: left };
  }
  if (separator === "\\") {
    return { encoded: true, subducting: left, overriding: right };
  }
  return { encoded: false, subducting: null, overriding: null };
}

/**
 * One-line reading of an encoded subduction polarity, e.g.
 * "Nazca subducts beneath South America". Returns null when the label's
 * delimiter encodes no subduction, so callers render nothing rather than
 * implying a polarity PB2002 did not record.
 *
 * Plates outside the vocabulary fall back to their raw code rather than being
 * dropped, keeping an unrecognized pair visible instead of silently omitted.
 */
export function subductionSummary(pair: DecodedPlatePair): string | null {
  const { subducting, overriding } = pair.subduction;
  if (subducting === null || overriding === null) return null;
  const label = (plate: PlateIdentity): string => plate.name ?? plate.code;
  return `${label(subducting)} subducts beneath ${label(overriding)}`;
}

/**
 * Tally how the supplied boundary polylines divide across PB2002's byte-3
 * classes. Descriptive coverage of the supplied linework only: it counts
 * labeled segments, not trench length, convergence, or activity. Undecodable
 * labels are counted separately rather than folded into a class.
 */
export function subductionPolarityCoverage(
  boundaries: readonly PlateBoundary[]
): {
  subductionEncodedCount: number;
  nonSubductingCount: number;
  undecodableCount: number;
} {
  let subductionEncodedCount = 0;
  let nonSubductingCount = 0;
  let undecodableCount = 0;
  for (const boundary of boundaries) {
    const decoded = decodePlatePair(boundary.name);
    if (!decoded) undecodableCount += 1;
    else if (decoded.subduction.encoded) subductionEncodedCount += 1;
    else nonSubductingCount += 1;
  }
  return { subductionEncodedCount, nonSubductingCount, undecodableCount };
}

export interface PlateInventoryEntry {
  /** Two-letter PB2002 code, upper case. */
  code: string;
  /** PB2002 plate name, or null for a code outside the vocabulary. */
  name: string | null;
  /** Number of supplied boundary polylines whose label names this plate. */
  boundaryCount: number;
}

/**
 * A categorical inventory of the plates that border a supplied set of boundary
 * polylines: which plates appear, their PB2002 names, and how many of the
 * supplied polylines name each. Boundaries whose labels are not decodable
 * (e.g. unlabeled features) contribute nothing. Each plate is counted at most
 * once per boundary. Results are ordered by code so callers get a stable list.
 *
 * This names the plates present in the supplied linework; it does not assert
 * region membership, adjacency beyond the supplied polylines, or any boundary
 * property.
 */
export function platesInBoundaries(
  boundaries: readonly PlateBoundary[]
): PlateInventoryEntry[] {
  const counts = new Map<string, number>();
  for (const boundary of boundaries) {
    const decoded = decodePlatePair(boundary.name);
    if (!decoded) continue;
    const codes = new Set(decoded.plates.map((plate) => plate.code));
    for (const code of codes) {
      counts.set(code, (counts.get(code) ?? 0) + 1);
    }
  }

  return [...counts.entries()]
    .map(([code, boundaryCount]) => ({
      code,
      name: PB2002_PLATE_NAMES[code] ?? null,
      boundaryCount,
    }))
    .sort((a, b) => a.code.localeCompare(b.code));
}

export const PLATE_PAIR_LIMITATIONS = [
  "Decodes only the plate-pair identity and byte-3 subduction polarity of the supplied Bird (2003) PB2002 labels; it does not add geometry, relative motion, convergence rate, slab depth, deformation, activity, or a data month.",
  "Subduction polarity is read from the label's delimiter as PB2002 recorded it, not measured or inferred; a hyphen is the model's explicit 'non-subducting segment', never missing data.",
  "PB2002's 7-way boundary class (CRB/CTF/CCB/OSR/OTF/OCB/SUB) lives in a steps file this app does not bundle, so a non-subducting segment cannot be resolved to rift, ridge, or transform here.",
  "Naming the plates a boundary separates, and which of them descends, is descriptive map context only; it does not infer seismicity, volcanism, hazard, risk, cause, or a forecast.",
] as const;
