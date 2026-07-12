import { fetchWithRetry } from "./net";
import {
  LAYERS,
  DATA_LATEST,
  addMonths,
  extendDataLatest,
  setLayerLatest,
  compareYm,
  type LayerId,
  type YearMonth,
} from "./timeline";

/**
 * Keeps the timeline fresh without code changes: NASA publishes a new month
 * of composites every few weeks, but DATA_LATEST is a compiled-in constant
 * that goes stale between releases. At boot we ask GIBS for the published
 * time domain and extend the runtime latest to the newest month that
 * actually exists.
 *
 * The ask is a WMTS **DescribeDomains** request — a few hundred bytes of XML
 * listing a layer's time intervals (e.g. `2025-05-01/2026-05-01/P1M`), so
 * there's no trial-and-error 404 noise. Crucially it is asked **per product
 * family**: MOD13A3 (ndvi/evi), MOD11C3 (lst), and MOD10CM (snow) are
 * different products on different production pipelines, and their monthly
 * composites do not always publish in lockstep. Each family's layers extend
 * only to that family's own verified end; a family whose check fails is
 * pinned to the compiled-in baseline — never to another product's newest
 * month. Layers with a compiled `latest` (lagging reanalysis) are outside
 * this mechanism entirely.
 */

/** One boot-verified product family: the layer probed, and who inherits. */
export interface FreshnessFamily {
  /** Layer whose DescribeDomains answer speaks for the family. */
  probe: LayerId;
  /** Layers sharing the probe's source product (same publication schedule). */
  layers: LayerId[];
  /** The product, for log/contract readability. */
  product: string;
}

/** The dynamic-latest families (every layer without a compiled `latest`). */
export const FRESHNESS_FAMILIES: FreshnessFamily[] = [
  { probe: "ndvi", layers: ["ndvi", "evi"], product: "MOD13A3" },
  { probe: "lst", layers: ["lst"], product: "MOD11C3" },
  { probe: "snow", layers: ["snow"], product: "MOD10CM" },
];

/** DescribeDomains URL for a layer's time domain (exported for tests). */
export function describeDomainsUrl(layerId: LayerId, from: YearMonth): string {
  const layer = LAYERS[layerId];
  const start = addMonths(from, -1);
  const startDay = `${start.year}-${String(start.month).padStart(2, "0")}-01`;
  const params = new URLSearchParams({
    SERVICE: "WMTS",
    REQUEST: "DescribeDomains",
    VERSION: "1.0.0",
    LAYER: layer.wmsLayer,
    TILEMATRIXSET: layer.wmts?.set ?? "1km",
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
 * Boot-time entry point: verify each product family's newest published month
 * and pin every dynamic layer to its own family's verified end. Resolves
 * true when any family grew past the compiled-in baseline (the app should
 * rebuild its month range). A family whose check fails — network, timeout,
 * malformed XML — is pinned to the baseline: conservative, exactly like the
 * old behavior, but now a laggard can no longer ride a leader's extension.
 */
export async function refreshDataLatest(): Promise<boolean> {
  const floor = DATA_LATEST;
  const results = await Promise.allSettled(
    FRESHNESS_FAMILIES.map(async (family) => {
      const res = await fetchWithRetry(
        describeDomainsUrl(family.probe, floor),
        {
          retries: 1,
          timeoutMs: 10_000,
        }
      );
      return parseLatestFromDomains(await res.text());
    })
  );
  let grew = false;
  let globalMax = floor;
  results.forEach((result, i) => {
    const verified = result.status === "fulfilled" ? result.value : null;
    const pin = verified && compareYm(verified, floor) > 0 ? verified : floor;
    for (const id of FRESHNESS_FAMILIES[i].layers) setLayerLatest(id, pin);
    if (compareYm(pin, floor) > 0) grew = true;
    if (compareYm(pin, globalMax) > 0) globalMax = pin;
  });
  // The global value stays the world's newest *verified* month (it caps
  // month math for layers outside the families via `latest ?? DATA_LATEST`
  // fallbacks — all of which are now explicitly pinned anyway).
  extendDataLatest(globalMax);
  return grew;
}
