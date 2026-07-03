import { fetchWithRetry } from "./net";
import {
  LAYERS,
  DATA_LATEST,
  addMonths,
  extendDataLatest,
  compareYm,
  type YearMonth,
} from "./timeline";

/**
 * Keeps the timeline fresh without code changes: NASA publishes a new month
 * of composites every few weeks, but DATA_LATEST is a compiled-in constant
 * that goes stale between releases. At boot we ask GIBS for the reference
 * layer's published time domain and extend the runtime latest to the newest
 * month that actually exists.
 *
 * The ask is a WMTS **DescribeDomains** request — a few hundred bytes of XML
 * listing the layer's time intervals (e.g. `2025-05-01/2026-05-01/P1M`), so
 * there's no trial-and-error 404 noise. NDVI is the reference product — the
 * MODIS monthly family publishes together; layers with their own `latest`
 * (reanalysis products that lag) are unaffected by the global value.
 */

/** DescribeDomains URL for the NDVI reference layer (exported for tests). */
export function describeDomainsUrl(from: YearMonth): string {
  const start = addMonths(from, -1);
  const startDay = `${start.year}-${String(start.month).padStart(2, "0")}-01`;
  const params = new URLSearchParams({
    SERVICE: "WMTS",
    REQUEST: "DescribeDomains",
    VERSION: "1.0.0",
    LAYER: LAYERS.ndvi.wmsLayer,
    TILEMATRIXSET: LAYERS.ndvi.wmts?.set ?? "1km",
  });
  // TIME goes in raw: GIBS rejects a percent-encoded slash in the range
  // ("Invalid periods start date"), and the dates need no escaping.
  return (
    `https://gibs.earthdata.nasa.gov/wmts/epsg4326/best/wmts.cgi?${params.toString()}` +
    `&TIME=${startDay}/${from.year + 2}-01-01`
  );
}

/**
 * Pull the newest month out of a DescribeDomains response. The time domain is
 * a comma-separated list of `start/end/period` intervals; the answer is the
 * largest interval end. Null for anything malformed — a broken response must
 * never move the timeline.
 */
export function parseLatestFromDomains(xml: string): YearMonth | null {
  const domain = /<Domain>([^<]*)<\/Domain>/.exec(xml)?.[1];
  if (!domain) return null;
  let latest: YearMonth | null = null;
  for (const interval of domain.split(",")) {
    const end = interval.split("/")[1] ?? interval.split("/")[0];
    const m = /^(\d{4})-(\d{2})-\d{2}$/.exec(end?.trim() ?? "");
    if (!m) continue;
    const ym = { year: Number(m[1]), month: Number(m[2]) };
    if (ym.month < 1 || ym.month > 12) continue;
    if (!latest || compareYm(ym, latest) > 0) latest = ym;
  }
  return latest;
}

/**
 * Boot-time entry point: detect and apply a newer global latest. Resolves
 * true when the timeline grew (the app should rebuild its month range).
 * Network or parse failures resolve false — the compiled-in baseline stands.
 */
export async function refreshDataLatest(): Promise<boolean> {
  let latest: YearMonth | null;
  try {
    const res = await fetchWithRetry(describeDomainsUrl(DATA_LATEST), {
      retries: 1,
      timeoutMs: 10_000,
    });
    latest = parseLatestFromDomains(await res.text());
  } catch {
    return false;
  }
  if (!latest || compareYm(latest, DATA_LATEST) <= 0) return false;
  extendDataLatest(latest);
  return true;
}
