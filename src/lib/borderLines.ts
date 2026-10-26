/**
 * Compact boundary polylines produced by scripts/prepare-data.mjs.
 * Each line is a flat `[lon, lat, lon, lat, …]` run.
 */

export function parseBorderLines(
  data: unknown
): Array<Array<[number, number]>> {
  if (!data || typeof data !== "object") return [];
  const lines = (data as { lines?: unknown }).lines;
  if (!Array.isArray(lines)) return [];
  const out: Array<Array<[number, number]>> = [];
  for (const line of lines) {
    if (!Array.isArray(line)) continue;
    const pairs: Array<[number, number]> = [];
    for (let i = 0; i + 1 < line.length; i += 2) {
      const lon = line[i];
      const lat = line[i + 1];
      if (typeof lon !== "number" || typeof lat !== "number") continue;
      if (!Number.isFinite(lon) || !Number.isFinite(lat)) continue;
      if (Math.abs(lon) > 180 || Math.abs(lat) > 90) continue;
      pairs.push([lon, lat]);
    }
    if (pairs.length >= 2) out.push(pairs);
  }
  return out;
}
