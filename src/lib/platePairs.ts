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
 * Categorical decode only. Names come from the fixed PB2002 vocabulary; the
 * module never measures anything, averages codes, or classifies the boundary's
 * type, motion, activity, or hazard. Unknown codes are surfaced (name: null),
 * never dropped, so the provenance stays honest.
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
 * Delimiter observed between the two codes in a PB2002 label. It reflects the
 * source digitization's boundary-step orientation and is NOT a boundary-type
 * code (spreading / convergent / transform are not encoded here).
 */
export type PlateSeparator = "-" | "/" | "\\";

export interface PlateIdentity {
  /** Two-letter PB2002 code, normalized to upper case, e.g. "AF". */
  code: string;
  /** PB2002 plate name, or null when the code is not in the vocabulary. */
  name: string | null;
}

export interface DecodedPlatePair {
  /** Original label exactly as supplied, e.g. "AF-AN". */
  label: string;
  /** The two plates in the order they appear in the label. */
  plates: [PlateIdentity, PlateIdentity];
  /** The delimiter found between the two codes. */
  separator: PlateSeparator;
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
    canonicalKey,
    recognized: plates.every((plate) => plate.name !== null),
  };
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
  "Decodes only the plate-pair identity of the supplied Bird (2003) PB2002 labels; it does not add geometry, boundary type, relative motion, deformation, activity, or a data month.",
  "The delimiter and code order reflect the source digitization's boundary-step orientation, not a boundary-type or which-plate-subducts classification.",
  "Naming the plates a boundary separates is descriptive map context only; it does not infer seismicity, volcanism, hazard, risk, cause, or a forecast.",
] as const;
