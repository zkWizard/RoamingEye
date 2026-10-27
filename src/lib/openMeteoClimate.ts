import {
  climateFetchRange,
  era5DailyUrl,
  isoMonthEnd,
  isoMonthStart,
  monthsFromDaily,
  type ClimateQuery,
  type MonthClimate,
} from "./compareClimate";
import type { YearMonth } from "./timeline";

/**
 * ERA5 monthly rain and 2 m temperature from the Open-Meteo archive.
 * No key, CORS-open, and cached for the session so a second comparison
 * does not ask again. Only complete months are stored.
 */

const MEMORY = new Map<string, MonthClimate[]>();
const STORAGE_KEY = "roamingeye.era5.v1";

function cacheKey(lat: number, lon: number): string {
  return `${lat.toFixed(2)},${lon.toFixed(2)}`;
}

function monthKey(row: MonthClimate): string {
  return `${row.year}-${row.month}`;
}

function readStore(): Record<string, MonthClimate[]> {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, MonthClimate[]>;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeStore(store: Record<string, MonthClimate[]>): void {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch {
    // Private mode and full storage both just skip the disk cache.
  }
}

function remember(key: string, months: readonly MonthClimate[]): void {
  const prior = MEMORY.get(key) ?? [];
  const merged = new Map<string, MonthClimate>();
  for (const row of prior) merged.set(monthKey(row), row);
  for (const row of months) {
    if (
      row.precipDays === row.expectedDays ||
      row.tempDays === row.expectedDays
    ) {
      merged.set(monthKey(row), row);
    }
  }
  const next = [...merged.values()].sort(
    (a, b) => a.year - b.year || a.month - b.month
  );
  MEMORY.set(key, next);
  const store = readStore();
  store[key] = next;
  writeStore(store);
}

function cached(key: string): MonthClimate[] {
  const memory = MEMORY.get(key);
  if (memory) return memory;
  const stored = readStore()[key];
  if (!stored) return [];
  MEMORY.set(key, stored);
  return stored;
}

function covers(
  months: readonly MonthClimate[],
  start: YearMonth,
  end: YearMonth
): boolean {
  const index = (ym: YearMonth) => ym.year * 12 + ym.month;
  const from = index(start);
  const to = index(end);
  const have = new Set(months.map((row) => row.year * 12 + row.month));
  for (let i = from; i <= to; i++) {
    if (!have.has(i)) return false;
  }
  return from <= to;
}

interface ArchiveDaily {
  time?: string[];
  precipitation_sum?: (number | null)[];
  temperature_2m_mean?: (number | null)[];
}

function asDaily(body: unknown): ArchiveDaily | undefined {
  if (!body || typeof body !== "object") return undefined;
  const daily = (body as { daily?: unknown }).daily;
  if (!daily || typeof daily !== "object") return undefined;
  return daily as ArchiveDaily;
}

/** The archive rejects an end date that has not happened yet. */
function endDate(ym: YearMonth): string {
  const monthEnd = isoMonthEnd(ym);
  const today = new Date().toISOString().slice(0, 10);
  return monthEnd < today ? monthEnd : today;
}

function dayBefore(iso: string): string {
  const date = new Date(`${iso}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}

async function fetchDaily(
  lat: number,
  lon: number,
  start: YearMonth,
  end: YearMonth,
  signal: AbortSignal | undefined
): Promise<MonthClimate[]> {
  let endIso = endDate(end);
  const startIso = isoMonthStart(start);
  let last: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const response = await fetch(era5DailyUrl(lat, lon, startIso, endIso), {
        signal,
      });
      if (response.status === 400 && attempt === 0) {
        endIso = dayBefore(endIso);
        continue;
      }
      if (!response.ok) throw new Error(`Open-Meteo HTTP ${response.status}`);
      const daily = asDaily(await response.json());
      if (
        !daily?.time ||
        !daily.precipitation_sum ||
        !daily.temperature_2m_mean
      ) {
        throw new Error("Open-Meteo returned no daily series");
      }
      return monthsFromDaily({
        time: daily.time,
        precipMm: daily.precipitation_sum,
        tempC: daily.temperature_2m_mean,
      });
    } catch (err) {
      if (signal?.aborted) throw err;
      last = err;
    }
  }
  throw last instanceof Error ? last : new Error("Open-Meteo request failed");
}

/**
 * Monthly climate at one point. A recent comparison refetches so a month
 * that was incomplete last visit can fill in; an older window is reused.
 */
export async function loadMonthlyClimate(
  lat: number,
  lon: number,
  query: ClimateQuery,
  today: YearMonth,
  signal?: AbortSignal
): Promise<MonthClimate[]> {
  const key = cacheKey(lat, lon);
  const range = climateFetchRange(query, today);
  const have = cached(key);
  const recent =
    range.end.year === today.year && range.end.month === today.month;
  if (!recent && covers(have, range.start, range.end)) return have;
  const fresh = await fetchDaily(lat, lon, range.start, range.end, signal);
  remember(key, fresh);
  return fresh;
}
