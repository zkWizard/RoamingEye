/**
 * One-tap looks. Natural is the untouched globe: the share link omits it,
 * and the full-screen pass is not loaded.
 */

export const LOOKS = [
  { id: "natural", label: "Natural" },
  { id: "night", label: "Night vision" },
  { id: "thermal", label: "Thermal" },
  { id: "noir", label: "Noir" },
  { id: "crt", label: "Retro CRT" },
  { id: "blueprint", label: "Blueprint" },
] as const;

export type LookId = (typeof LOOKS)[number]["id"];

const LOOK_IDS: ReadonlySet<string> = new Set(LOOKS.map((look) => look.id));

export function isLookId(value: string): value is LookId {
  return LOOK_IDS.has(value);
}

/** Shader branch for a look. Natural is 0 and never reaches the shader. */
export function lookMode(id: LookId): number {
  switch (id) {
    case "night":
      return 1;
    case "thermal":
      return 2;
    case "noir":
      return 3;
    case "crt":
      return 4;
    case "blueprint":
      return 5;
    default:
      return 0;
  }
}
