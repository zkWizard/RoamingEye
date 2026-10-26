import { LAYERS } from "../timeline";
import { matchScore } from "./rank";
import type { SearchHit, SearchProvider } from "./provider";

/**
 * A place the empty field can offer because its vegetation, snow, or smoke
 * is one of the stories the site already tells.
 *
 * `headline` is a measured change ("NDVI +12% since 2005") only when
 * `verified` is true. The parser drops a headline on an unverified row, so a
 * number cannot reach the screen unless the offline script stood behind it.
 */
export interface ChangeHotspot {
  id: string;
  title: string;
  layerId: string;
  lat: number;
  lon: number;
  sinceYear: number;
  headline: string | null;
  verified: boolean;
  /** Lower comes first. The script assigns this; it is not a measured magnitude. */
  rank: number;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : null;
}

function finite(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/** Parse the file `scripts/change-hotspots.mjs` writes. Bad rows are dropped. */
export function hotspotsFromJson(json: unknown): ChangeHotspot[] {
  const root = asRecord(json);
  const rows = root && Array.isArray(root.hotspots) ? root.hotspots : [];
  const out: ChangeHotspot[] = [];
  for (const entry of rows) {
    const record = asRecord(entry);
    if (!record || typeof record.id !== "string" || record.id === "") continue;
    if (typeof record.title !== "string" || record.title === "") continue;
    if (
      typeof record.layerId !== "string" ||
      !Object.hasOwn(LAYERS, record.layerId)
    ) {
      continue;
    }
    const lat = finite(record.lat);
    const lon = finite(record.lon);
    const sinceYear = finite(record.sinceYear);
    const rank = finite(record.rank);
    if (
      lat === null ||
      lon === null ||
      sinceYear === null ||
      rank === null ||
      Math.abs(lat) > 90 ||
      Math.abs(lon) > 180
    ) {
      continue;
    }
    const verified = record.verified === true;
    const headline =
      verified && typeof record.headline === "string" && record.headline !== ""
        ? record.headline
        : null;
    out.push({
      id: record.id,
      title: record.title,
      layerId: record.layerId,
      lat,
      lon,
      sinceYear,
      headline,
      verified: verified && headline !== null,
      rank,
    });
  }
  out.sort((a, b) => a.rank - b.rank || a.title.localeCompare(b.title));
  return out;
}

/** What the row says under the place. A number appears only when it was checked. */
export function hotspotSubtitle(hotspot: ChangeHotspot): string {
  const layer = LAYERS[hotspot.layerId as keyof typeof LAYERS].label;
  if (hotspot.verified && hotspot.headline) {
    return `${layer} ${hotspot.headline} since ${hotspot.sinceYear}`;
  }
  return layer;
}

function toHit(hotspot: ChangeHotspot, score: number): SearchHit {
  return {
    id: `hotspot:${hotspot.id}`,
    group: "Changes",
    title: hotspot.title,
    subtitle: hotspotSubtitle(hotspot),
    score,
    data: {
      type: "hotspot",
      name: hotspot.title,
      layerId: hotspot.layerId,
      lat: hotspot.lat,
      lon: hotspot.lon,
    },
  };
}

let hotspotPromise: Promise<ChangeHotspot[]> | undefined;

/** The ranked file, fetched once. A missing file is an empty list. */
export function loadHotspots(
  base = import.meta.env.BASE_URL
): Promise<ChangeHotspot[]> {
  hotspotPromise ??= fetch(`${base}data/change-hotspots.json`)
    .then((response) => {
      if (!response.ok) throw new Error(`Could not load change hotspots`);
      return response.json() as Promise<unknown>;
    })
    .then(hotspotsFromJson)
    .catch((error: unknown) => {
      console.warn("RoamingEye: change hotspots skipped", error);
      return [];
    });
  return hotspotPromise;
}

/** Test hook. */
export function resetHotspots(): void {
  hotspotPromise = undefined;
}

export function hotspotProvider(): SearchProvider {
  void loadHotspots();
  return {
    id: "hotspots",
    when: "instant",
    suggest() {
      return loadHotspots().then((hotspots) =>
        hotspots.map((hotspot) => toHit(hotspot, 1000 - hotspot.rank))
      );
    },
    search(query) {
      return loadHotspots().then((hotspots) => {
        const hits: SearchHit[] = [];
        for (const hotspot of hotspots) {
          const score = matchScore(query, hotspot.title);
          if (score === null) continue;
          hits.push(toHit(hotspot, score));
        }
        return hits;
      });
    },
  };
}
