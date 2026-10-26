import { parseCityList } from "../cities";
import { matchScore } from "./rank";
import { placeFixFromGeometry, pointBox } from "./outline";
import type { SearchHit } from "./provider";

interface IndexedPlace {
  name: string;
  subtitle: string;
  lat: number;
  lon: number;
  boundingBox: [number, number, number, number];
  boost: number;
}

const LIMIT = 6;

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : null;
}

function indexCountries(json: unknown, subtitle: string): IndexedPlace[] {
  const root = asRecord(json);
  const features = root && Array.isArray(root.features) ? root.features : [];
  const out: IndexedPlace[] = [];
  for (const feature of features) {
    const record = asRecord(feature);
    const properties = record ? asRecord(record.properties) : null;
    const name =
      properties && typeof properties.name === "string" ? properties.name : "";
    if (!name || !record) continue;
    const fix = placeFixFromGeometry(record.geometry);
    if (!fix) continue;
    const admin =
      subtitle === "State"
        ? typeof properties?.admin === "string"
          ? properties.admin
          : ""
        : subtitle;
    out.push({
      name,
      subtitle: admin || subtitle,
      lat: fix.lat,
      lon: fix.lon,
      boundingBox: fix.boundingBox,
      boost: subtitle === "Country" ? 40 : 0,
    });
  }
  return out;
}

function indexVolcanoes(json: unknown): IndexedPlace[] {
  const root = asRecord(json);
  const records = Array.isArray(json)
    ? json
    : root && Array.isArray(root.records)
      ? root.records
      : [];
  const out: IndexedPlace[] = [];
  for (const entry of records) {
    const record = asRecord(entry);
    if (!record || typeof record.name !== "string") continue;
    const lat = typeof record.lat === "number" ? record.lat : NaN;
    const lon = typeof record.lon === "number" ? record.lon : NaN;
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    const kind = typeof record.type === "string" ? record.type : "Volcano";
    const country = typeof record.country === "string" ? record.country : "";
    out.push({
      name: record.name,
      subtitle: country ? `${kind} · ${country}` : kind,
      lat,
      lon,
      boundingBox: pointBox(lat, lon, 0.3),
      boost: 0,
    });
  }
  return out;
}

function indexCities(json: unknown): IndexedPlace[] {
  return parseCityList(json).map((city) => ({
    name: city.name,
    subtitle: city.country ?? "City",
    lat: city.lat,
    lon: city.lon,
    boundingBox: pointBox(city.lat, city.lon),
    boost: Math.min(30, Math.log10((city.pop ?? 0) + 10)),
  }));
}

export function matchPlaces(
  records: readonly IndexedPlace[],
  query: string,
  group: string,
  limit = LIMIT
): SearchHit[] {
  const hits: SearchHit[] = [];
  for (const record of records) {
    const base = matchScore(query, record.name);
    if (base === null) continue;
    hits.push({
      id: `${group}:${record.name}:${record.lat.toFixed(3)}`,
      group,
      title: record.name,
      subtitle: record.subtitle,
      score: base + record.boost,
      data: {
        type: "place",
        name: record.name,
        subtitle: record.subtitle,
        lat: record.lat,
        lon: record.lon,
        boundingBox: record.boundingBox,
        geometry: null,
      },
    });
  }
  hits.sort((a, b) => b.score - a.score || a.title.localeCompare(b.title));
  return hits.slice(0, limit);
}

export interface PlaceCatalog {
  cities: IndexedPlace[];
  countries: IndexedPlace[];
  states: IndexedPlace[];
  volcanoes: IndexedPlace[];
}

export function catalogFromJson(files: {
  cities: unknown;
  countries: unknown;
  states: unknown;
  volcanoes: unknown;
}): PlaceCatalog {
  return {
    cities: indexCities(files.cities),
    countries: indexCountries(files.countries, "Country"),
    states: indexCountries(files.states, "State"),
    volcanoes: indexVolcanoes(files.volcanoes),
  };
}

let catalogPromise: Promise<PlaceCatalog> | undefined;

async function fetchJson(url: string): Promise<unknown> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Could not load ${url}`);
  return response.json() as Promise<unknown>;
}

/** The bundled place lists, fetched once. A failed file degrades to empty. */
export function loadPlaceCatalog(
  base = import.meta.env.BASE_URL
): Promise<PlaceCatalog> {
  catalogPromise ??= (async () => {
    const load = async (file: string): Promise<unknown> => {
      try {
        return await fetchJson(`${base}data/${file}`);
      } catch (error) {
        console.warn(`RoamingEye: search index skipped ${file}`, error);
        return null;
      }
    };
    const [cities, countries, states, volcanoes] = await Promise.all([
      load("cities.json"),
      load("countries.geojson"),
      load("admin1.geojson"),
      load("volcanoes.json"),
    ]);
    return catalogFromJson({ cities, countries, states, volcanoes });
  })();
  return catalogPromise;
}

/** Test hook. */
export function resetPlaceCatalog(): void {
  catalogPromise = undefined;
}
