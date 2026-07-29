/**
 * Preserve and explain qualifiers encoded in GVP primary-volcano-type labels.
 * Kept independent from the volcano data model so summaries and live marker
 * labels can share the exact same interpretation.
 *
 * A trailing "(s)"/"(es)" denotes multiple landforms and "?" marks GVP's
 * morphology assignment as uncertain. The parser retains the source string,
 * removes only those recognized trailing qualifiers, and leaves unrecognized
 * parentheticals untouched rather than guessing.
 */
export interface CanonicalVolcanoType {
  base: string | null;
  isMultiple: boolean;
  isUncertain: boolean;
  raw: string | null;
}

const PLURAL_SUFFIX = /\((?:es|s)\)$/i;

export function canonicalVolcanoType(
  type: string | null | undefined
): CanonicalVolcanoType {
  const raw = typeof type === "string" ? type : null;
  let working = raw === null ? "" : raw.trim();
  let isMultiple = false;
  let isUncertain = false;

  let changed = true;
  while (changed && working.length > 0) {
    changed = false;
    if (working.endsWith("?")) {
      isUncertain = true;
      working = working.slice(0, -1).trimEnd();
      changed = true;
      continue;
    }
    const plural = working.match(PLURAL_SUFFIX);
    if (plural) {
      isMultiple = true;
      working = working.slice(0, working.length - plural[0].length).trimEnd();
      changed = true;
    }
  }

  return {
    base: working.length > 0 ? working : null,
    isMultiple,
    isUncertain,
    raw,
  };
}

export function canonicalVolcanoTypeLabel(
  canonical: CanonicalVolcanoType
): string {
  if (canonical.base === null) return "Volcano type not recorded";
  const qualifiers: string[] = [];
  if (canonical.isMultiple) qualifiers.push("multiple landforms");
  if (canonical.isUncertain) qualifiers.push("type uncertain");
  return qualifiers.length === 0
    ? canonical.base
    : `${canonical.base} (${qualifiers.join("; ")})`;
}
