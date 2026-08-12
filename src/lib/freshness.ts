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
 * pinned to a baseline — never to another product's newest month.
 *
 * That baseline is per family, which is what lets the *lagging* products be
 * verified at all. Reanalysis (MERRA-2) and the land-surface model (GLDAS)
 * trail the MODIS composites by months, so they carry a compiled `latest`
 * of their own; falling back to the global DATA_LATEST would offer months
 * their producers have not published. Each family therefore falls back to
 * its own probe layer's compiled `latest` when it has one, and to the global
 * baseline when it does not — so a lagging family can extend forward on a
 * verified answer without a failed answer ever over-offering.
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

/**
 * The boot-verified families, one per source product. Membership follows the
 * granule, not the theme: precipitation and soil moisture are two fields of
 * the same GLDAS granule (GLDAS_NOAH025_M 2.1, one DOI), so they publish
 * together and must extend together — pinning one without the other would
 * show two record ends for a single product.
 *
 * `sst` and `landcover` are deliberately absent: they are the marine and
 * land-cover products' own business, and an unverified layer simply keeps
 * its compiled `latest` exactly as before.
 */
export const FRESHNESS_FAMILIES: FreshnessFamily[] = [
  { probe: "ndvi", layers: ["ndvi", "evi"], product: "MOD13A3" },
  { probe: "lst", layers: ["lst"], product: "MOD11C3" },
  { probe: "snow", layers: ["snow"], product: "MOD10CM" },
  { probe: "airtemp", layers: ["airtemp"], product: "M2TMNXSLV" },
  { probe: "aerosol", layers: ["aerosol"], product: "M2TMNXAER" },
  { probe: "precip", layers: ["precip", "soil"], product: "GLDAS_NOAH025_M" },
];

/**
 * Each family's fallback month, read at module load — before any pinning —
 * so a value written by one refresh can never become the floor a later
 * refresh falls back to. Undefined for the families whose layers carry no
 * compiled `latest`; those keep using the global baseline.
 */
const COMPILED_FLOOR = new Map<LayerId, YearMonth | undefined>(
  FRESHNESS_FAMILIES.map((f) => [f.probe, LAYERS[f.probe].latest])
);

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
 * Is `ym` a month a monthly composite could actually cover? A month that has
 * not begun cannot have been observed, so an answer naming one is not data.
 *
 * This is worth checking because a *parseable* answer can still be wrong in
 * that direction: DescribeDomains is asked over a two-year forward window
 * (see describeDomainsUrl), and an interval end is the domain the layer
 * declares, not a granule that exists — a server that echoes the requested
 * range, or a layer whose declared domain runs ahead of production, hands
 * back a future month. Accepting it would put months of 404-ing tiles on the
 * timeline and present them as available observations.
 *
 * Only the physically impossible region is rejected. Whether the *current*
 * month has published yet is exactly what the probe is asked to find out, so
 * it is left to the answer. Judged in UTC, as GIBS dates its domains.
 */
export function isObservableMonth(ym: YearMonth, now: Date): boolean {
  const current = { year: now.getUTCFullYear(), month: now.getUTCMonth() + 1 };
  return compareYm(ym, current) <= 0;
}

/**
 * Boot-time entry point: verify each product family's newest published month
 * and pin every dynamic layer to its own family's verified end. Resolves
 * true when any family grew past the compiled-in baseline (the app should
 * rebuild its month range). A family whose check fails — network, timeout,
 * malformed XML, or an answer naming a month that cannot have been observed
 * yet — is pinned to the baseline: conservative, exactly like the old
 * behavior, but now a laggard can no longer ride a leader's extension.
 *
 * `now` is injectable for tests. A client clock set far in the past makes
 * this discard good answers and fall back to the compiled baseline — the
 * same conservative outcome as an unreachable probe, and the direction to
 * fail in: the baseline is a curated, verified month.
 */
export async function refreshDataLatest(
  now: Date = new Date()
): Promise<boolean> {
  const global = DATA_LATEST;
  /** The month this family falls back to, and must beat to move anything. */
  const floorFor = (family: FreshnessFamily): YearMonth =>
    COMPILED_FLOOR.get(family.probe) ?? global;
  const results = await Promise.allSettled(
    FRESHNESS_FAMILIES.map(async (family) => {
      const res = await fetchWithRetry(
        describeDomainsUrl(family.probe, floorFor(family)),
        {
          retries: 1,
          timeoutMs: 10_000,
        }
      );
      return parseLatestFromDomains(await res.text());
    })
  );
  let grew = false;
  let globalMax = global;
  results.forEach((result, i) => {
    const family = FRESHNESS_FAMILIES[i];
    const floor = floorFor(family);
    const answered = result.status === "fulfilled" ? result.value : null;
    // Discard rather than clamp: if the declared domain runs past what could
    // have been observed, we don't know which of its months are backed by a
    // granule, so we claim none of them.
    const verified =
      answered && isObservableMonth(answered, now) ? answered : null;
    const pin = verified && compareYm(verified, floor) > 0 ? verified : floor;
    for (const id of family.layers) setLayerLatest(id, pin);
    if (compareYm(pin, floor) > 0) grew = true;
    if (compareYm(pin, globalMax) > 0) globalMax = pin;
  });
  // The global value stays the world's newest *verified* month (it caps
  // month math for layers outside the families via `latest ?? DATA_LATEST`
  // fallbacks). A lagging family can never move it: its pin sits below the
  // global baseline by construction, and extendDataLatest is forward-only.
  extendDataLatest(globalMax);
  return grew;
}
