/**
 * OpenStreetMap / OpenMapTiles building height hints (render_height, levels).
 * Pure parsing for unit tests.
 */

export function parseBuildingHeight(
  props: Record<string, unknown> | null | undefined
): number {
  if (!props) return 12;
  const render = toPosNumber(props.render_height);
  if (render != null) return clampHeight(render);
  const height = toPosNumber(props.height);
  if (height != null) return clampHeight(height);
  const levels = toPosNumber(props["building:levels"]);
  if (levels != null) return clampHeight(levels * 3.2);
  return 12;
}

export function parseBuildingMinHeight(
  props: Record<string, unknown> | null | undefined
): number {
  if (!props) return 0;
  const render = toPosNumber(props.render_min_height);
  if (render != null) return Math.max(0, render);
  const min = toPosNumber(props.min_height);
  if (min != null) return Math.max(0, min);
  return 0;
}

export function placeLabelName(
  props: Record<string, unknown> | null | undefined
): string | null {
  if (!props) return null;
  for (const key of [
    "name_en",
    "name:en",
    "name",
    "name_latin",
    "name:latin",
  ]) {
    const v = props[key];
    if (typeof v === "string" && v.trim().length > 0) return v.trim();
  }
  return null;
}

function toPosNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return value;
  }
  if (typeof value === "string" && value.trim().length > 0) {
    const n = Number(value);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return null;
}

function clampHeight(metres: number): number {
  return Math.min(420, Math.max(2, metres));
}
