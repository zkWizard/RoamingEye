/**
 * Time-zone boundaries prepared from Natural Earth (public domain).
 * `offset` is hours from UTC, including the half-hour and 45-minute zones.
 */

export interface TimeZoneFeature {
  offset: number;
  /** A [lon, lat] anchor for the offset label. */
  label: [number, number];
  lines: Array<Array<[number, number]>>;
}

export function formatUtcOffset(hours: number): string {
  if (!Number.isFinite(hours) || hours === 0) return "UTC";
  const sign = hours > 0 ? "+" : "−";
  const abs = Math.abs(hours);
  const whole = Math.trunc(abs);
  const minutes = Math.round((abs - whole) * 60);
  if (minutes === 0) return `UTC${sign}${whole}`;
  return `UTC${sign}${whole}:${String(minutes).padStart(2, "0")}`;
}

function pairsFromFlat(line: unknown): Array<[number, number]> | null {
  if (!Array.isArray(line)) return null;
  const pairs: Array<[number, number]> = [];
  for (let i = 0; i + 1 < line.length; i += 2) {
    const lon = line[i];
    const lat = line[i + 1];
    if (typeof lon !== "number" || typeof lat !== "number") return null;
    if (Math.abs(lon) > 180 || Math.abs(lat) > 90) return null;
    pairs.push([lon, lat]);
  }
  return pairs.length >= 2 ? pairs : null;
}

export function parseTimeZones(data: unknown): TimeZoneFeature[] {
  if (!data || typeof data !== "object") return [];
  const zones = (data as { zones?: unknown }).zones;
  if (!Array.isArray(zones)) return [];
  const out: TimeZoneFeature[] = [];
  for (const zone of zones) {
    if (!zone || typeof zone !== "object") continue;
    const offset = (zone as { offset?: unknown }).offset;
    const label = (zone as { label?: unknown }).label;
    const lines = (zone as { lines?: unknown }).lines;
    if (typeof offset !== "number" || !Number.isFinite(offset)) continue;
    if (
      !Array.isArray(label) ||
      typeof label[0] !== "number" ||
      typeof label[1] !== "number"
    ) {
      continue;
    }
    if (!Array.isArray(lines)) continue;
    const parsed: Array<Array<[number, number]>> = [];
    for (const line of lines) {
      const pairs = pairsFromFlat(line);
      if (pairs) parsed.push(pairs);
    }
    if (parsed.length === 0) continue;
    out.push({ offset, label: [label[0], label[1]], lines: parsed });
  }
  return out;
}

/** One label anchor per offset: the zone with the most boundary vertices. */
export function labelAnchors(
  zones: readonly TimeZoneFeature[]
): Array<{ offset: number; label: [number, number] }> {
  const best = new Map<number, { points: number; label: [number, number] }>();
  for (const zone of zones) {
    const points = zone.lines.reduce((sum, line) => sum + line.length, 0);
    const current = best.get(zone.offset);
    if (!current || points > current.points) {
      best.set(zone.offset, { points, label: zone.label });
    }
  }
  return [...best.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([offset, value]) => ({ offset, label: value.label }));
}
