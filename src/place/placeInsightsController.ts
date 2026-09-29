import { LAYERS, monthRangeForLayer } from "../lib/timeline";
import {
  geometryBounds,
  isAreaGeometry,
  type GeoGeometry,
} from "../lib/geojson";
import { loadPlaceColormap } from "../lib/placeInsights";
import { NDVI_MAX_INVERSION_DISTANCE } from "../lib/vegetationIndexNoData";
import { SST_MAX_INVERSION_DISTANCE } from "../lib/sstNoData";
import { PROBE_SCALES, scaleValue } from "../lib/probe";
import {
  annualValue,
  effectiveYears,
  formatHeadline,
  monthlyDisplayValue,
  PLACE_CHANGE_METRICS,
  placeChange,
  placeMetricShown,
  plateBoundaryCrosses,
  presetRange,
  quakeQueryUrl,
  tallyQuakes,
  tallyVolcanoes,
  usableYears,
  yearBounds,
  type PlaceChange,
  type PlaceChangeLayerId,
  type PlaceChangeMetric,
  type QuakeTally,
  type YearRange,
} from "../lib/placeChange";
import {
  nearestPlateBoundary,
  placePointPlateQuery,
} from "../lib/plateProximity";
import { parsePlateBoundaries, type PlateBoundary } from "../lib/plates";
import { parseVolcanoDataset, type VolcanoDataset } from "../lib/volcanoes";
import type { GeoResult } from "../lib/geocoding";
import { fetchJson, fetchWithRetry, isAbortError } from "../lib/net";
import { ProbeSampler } from "../probe/ProbeSampler";
import { PlaceInsights } from "../ui/PlaceInsights";

/**
 * The place panel's data: for the chosen years, each metric's annual mean at
 * both ends of the range, sampled inside the searched boundary, plus hazard
 * counts. Split out of main.ts so it loads as its own chunk on first search.
 *
 * Every year is sampled once per place and cached, so moving the range only
 * fetches the years it has not seen.
 */

export interface PlaceInsightsOptions {
  activeLayer: string;
  onSelectLayer(layerId: PlaceChangeLayerId): void;
}

interface PlaceSession {
  result: GeoResult;
  geometry: GeoGeometry;
  abort: AbortController;
  annual: Map<string, Promise<number | null>>;
  quakes: Map<string, Promise<QuakeTally>>;
  generation: number;
}

interface CsvRow {
  metric: PlaceChangeMetric;
  years: YearRange;
  change: PlaceChange;
}

const DEFAULT_PRESET = "20y";
/** A month's mean from any drawn cell at all (see sampleYear). */
const ANY_COVERAGE = 1e-6;
/** Years of monthly imagery sampled at once; each runs a few requests. */
const YEAR_JOBS = 3;

const placeInsightsEl = document.querySelector<HTMLElement>("#place-insights");
const sampler = new ProbeSampler({ width: 512, height: 512 }, 4);
const runJob = makePool(YEAR_JOBS);

let session: PlaceSession | undefined;
let options: PlaceInsightsOptions | undefined;
/** The last range the reader picked, kept across searches. */
let chosenRange: YearRange | undefined;
let volcanoData: Promise<VolcanoDataset> | undefined;
let plateData: Promise<PlateBoundary[]> | undefined;

const panel = placeInsightsEl
  ? new PlaceInsights(placeInsightsEl, {
      onClose: () => session?.abort.abort(),
      onRangeChange: (range) => {
        chosenRange = range;
        if (session) showRange(session, range);
      },
      onSelectLayer: (layerId) => options?.onSelectLayer(layerId),
    })
  : undefined;

export function runPlaceInsights(
  result: GeoResult,
  placeOptions: PlaceInsightsOptions
): void {
  options = placeOptions;
  if (!panel || !result.geometry || !isAreaGeometry(result.geometry)) {
    panel?.close();
    return;
  }
  session?.abort.abort();
  const s: PlaceSession = (session = {
    result,
    geometry: result.geometry,
    abort: new AbortController(),
    annual: new Map(),
    quakes: new Map(),
    generation: 0,
  });

  // Recomputed per search: the boot freshness probe can extend the records.
  const bounds = yearBounds(
    PLACE_CHANGE_METRICS.map((m) => usableYears(m.layerId))
  );
  const range = clampRange(
    chosenRange ?? presetRange(DEFAULT_PRESET, bounds),
    bounds
  );
  panel.open(result.name, bounds, range);
  panel.setActiveLayer(placeOptions.activeLayer);
  loadVolcanoes(s);
  loadPlates(s);
  showRange(s, range);
}

/** Mark the card for the layer now on the globe. */
export function setActivePlaceLayer(layerId: string): void {
  panel?.setActiveLayer(layerId);
}

function clampRange(range: YearRange, bounds: YearRange): YearRange {
  const to = Math.min(Math.max(range.to, bounds.from + 1), bounds.to);
  const from = Math.max(Math.min(range.from, to - 1), bounds.from);
  return { from, to };
}

function showRange(s: PlaceSession, range: YearRange): void {
  if (!panel) return;
  const generation = ++s.generation;
  const current = () => generation === s.generation && session === s;
  panel.showRange(range);
  const rows: CsvRow[] = [];

  const cards = PLACE_CHANGE_METRICS.map(async (metric) => {
    const { layerId } = metric;
    const years = effectiveYears(usableYears(layerId), range);
    if (!years) {
      panel.setCardEmpty(layerId, null, "Not in these years");
      return;
    }
    panel.setCardLoading(layerId, years);
    try {
      const [from, to] = await Promise.all([
        annual(s, layerId, years.from),
        annual(s, layerId, years.to),
      ]);
      if (!current()) return;
      if (from === null || to === null) {
        if (metric.optional) panel.hideCard(layerId);
        else panel.setCardEmpty(layerId, years, "No data here");
        return;
      }
      const change = placeChange(metric, from, to);
      if (!placeMetricShown(metric, change)) {
        panel.hideCard(layerId);
        return;
      }
      panel.setCardChange(layerId, years, change);
      rows.push({ metric, years, change });
    } catch (error) {
      if (isAbortError(error) || !current()) return;
      console.warn(`RoamingEye: place ${layerId} sampling failed`, error);
      panel.setCardEmpty(layerId, years, "Unavailable");
    }
  });

  const quakes = loadQuakes(s, range, current);
  void Promise.all(cards)
    .then(() => quakes)
    .then((tally) => {
      if (!current() || rows.length === 0) return;
      rows.sort(
        (a, b) =>
          PLACE_CHANGE_METRICS.indexOf(a.metric) -
          PLACE_CHANGE_METRICS.indexOf(b.metric)
      );
      panel.setCsv(buildCsv(s.result, range, rows, tally));
    });
}

/** One year's annual mean for a layer inside the boundary, sampled once. */
function annual(
  s: PlaceSession,
  layerId: PlaceChangeLayerId,
  year: number
): Promise<number | null> {
  const key = `${layerId}:${year}`;
  let pending = s.annual.get(key);
  if (!pending) {
    pending = runJob(() => sampleYear(s, layerId, year));
    s.annual.set(key, pending);
    // A failed year is retried the next time a range asks for it.
    pending.catch(() => s.annual.delete(key));
  }
  return pending;
}

async function sampleYear(
  s: PlaceSession,
  layerId: PlaceChangeLayerId,
  year: number
): Promise<number | null> {
  const { signal } = s.abort;
  if (signal.aborted) throw new DOMException("Place closed", "AbortError");
  const layer = LAYERS[layerId];
  const months = monthRangeForLayer(layer).filter((m) => m.year === year);
  const fallback = { lat: s.result.lat, lon: s.result.lon };
  const colormap = await loadPlaceColormap(layerId);
  // Any drawn cell yields a month's mean; annualValue then screens months
  // against the place's own best coverage. SST keeps the sampler's floor, so
  // a few coastal cells cannot put a sea-temperature card on an inland place.
  const minValidFraction = layerId === "sst" ? undefined : ANY_COVERAGE;
  // Snow has no continuous GIBS colormap; it decodes through the display
  // ramp, which is measured accurate for it (lib/snowCoverRamp).
  const sample = colormap
    ? await sampler.sampleGeometryPhysical(
        layer,
        months,
        s.geometry,
        fallback,
        colormap.entries,
        colormap.factor,
        {
          signal,
          minValidFraction,
          // Both ramps end close to the black GIBS renders where it has no
          // value, so their tighter screens keep that black out of the mean.
          maxInversionDistance:
            layerId === "ndvi"
              ? NDVI_MAX_INVERSION_DISTANCE
              : layerId === "sst"
                ? SST_MAX_INVERSION_DISTANCE
                : undefined,
        }
      )
    : await sampler.sampleGeometry(layer, months, s.geometry, fallback, {
        signal,
        minValidFraction,
      });
  const monthly = months.map((_, i) => {
    const validFraction = sample.validFractions[i] ?? 0;
    // A month whose image never arrived is unknown, not empty.
    if (sample.transportFailureByMonth[i])
      return { value: null, validFraction };
    const raw = sample.values[i];
    const value =
      colormap || raw === null ? raw : scaleValue(raw, PROBE_SCALES[layerId]);
    return {
      value: monthlyDisplayValue(layerId, value, validFraction),
      validFraction,
    };
  });
  return annualValue(layerId, monthly);
}

function loadQuakes(
  s: PlaceSession,
  range: YearRange,
  current: () => boolean
): Promise<QuakeTally | null> {
  if (!panel) return Promise.resolve(null);
  const extent = geometryBounds(s.geometry);
  if (!extent) {
    panel.setQuakes("error");
    return Promise.resolve(null);
  }
  panel.setQuakes("loading");
  const key = `${range.from}-${range.to}`;
  let pending = s.quakes.get(key);
  if (!pending) {
    pending = fetchWithRetry(quakeQueryUrl(extent, range), {
      signal: s.abort.signal,
      retries: 1,
      timeoutMs: 20_000,
    })
      .then((response) => response.text())
      .then((text) => tallyQuakes(text, s.geometry));
    s.quakes.set(key, pending);
    pending.catch(() => s.quakes.delete(key));
  }
  return pending.then(
    (tally) => {
      if (current()) panel.setQuakes(tally);
      return tally;
    },
    (error: unknown) => {
      if (!isAbortError(error) && current()) {
        console.warn("RoamingEye: place earthquake count failed", error);
        panel.setQuakes("error");
      }
      return null;
    }
  );
}

function loadVolcanoes(s: PlaceSession): void {
  if (!panel) return;
  panel.setVolcanoes("loading");
  volcanoData ??= fetchJson<unknown>(
    `${import.meta.env.BASE_URL}data/volcanoes.json`
  ).then(parseVolcanoDataset);
  volcanoData.then(
    (dataset) => {
      if (session !== s) return;
      panel.setVolcanoes(
        tallyVolcanoes(dataset.volcanoes, s.geometry, {
          lat: s.result.lat,
          lon: s.result.lon,
        })
      );
    },
    (error: unknown) => {
      volcanoData = undefined;
      if (session !== s) return;
      console.warn("RoamingEye: place volcano count failed", error);
      panel.setVolcanoes("error");
    }
  );
}

function loadPlates(s: PlaceSession): void {
  if (!panel) return;
  panel.setPlates("loading");
  plateData ??= fetchJson<unknown>(
    `${import.meta.env.BASE_URL}data/plate-boundaries.geojson`
  ).then(parsePlateBoundaries);
  plateData.then(
    (boundaries) => {
      if (session !== s) return;
      const crosses = plateBoundaryCrosses(boundaries, s.geometry);
      panel.setPlates({
        crosses,
        distanceKm: crosses
          ? 0
          : (nearestPlateBoundary(
              boundaries,
              placePointPlateQuery(s.result.lat, s.result.lon)
            ).nearest?.distanceKm ?? null),
      });
    },
    (error: unknown) => {
      plateData = undefined;
      if (session !== s) return;
      console.warn("RoamingEye: place plate distance failed", error);
      panel.setPlates("error");
    }
  );
}

function csvCell(text: string): string {
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function buildCsv(
  place: GeoResult,
  range: YearRange,
  rows: readonly CsvRow[],
  quakes: QuakeTally | null
): string {
  const header = [
    "# RoamingEye place change — APPROXIMATE values from NASA GIBS imagery",
    `# place: ${place.displayName.replace(/[\r\n,"]/g, " ")}`,
    `# range: ${range.from}-${range.to}`,
    "# method: annual mean of monthly values sampled inside the boundary; first year vs last year",
    ...(quakes
      ? [
          `# earthquakes_m4.5_plus: ${quakes.count}${quakes.capped ? "+" : ""}${quakes.maxMagnitude === null ? "" : ` (max M${quakes.maxMagnitude.toFixed(1)})`} — USGS`,
        ]
      : []),
    `# generated: ${new Date().toISOString()}`,
    `# tool_version: ${__APP_VERSION__}`,
    "metric,unit,from_year,from_value,to_year,to_value,change,source",
  ];
  const lines = rows.map(({ metric, years, change }) =>
    [
      csvCell(metric.label),
      csvCell(metric.unit),
      years.from,
      change.from.toFixed(metric.decimals + 1),
      years.to,
      change.to.toFixed(metric.decimals + 1),
      csvCell(formatHeadline(metric, change)),
      csvCell(metric.source),
    ].join(",")
  );
  return [...header, ...lines].join("\n") + "\n";
}

/** Run at most `size` async jobs at once, in the order they were queued. */
function makePool(size: number): <T>(job: () => Promise<T>) => Promise<T> {
  let running = 0;
  const queue: (() => void)[] = [];
  const next = (): void => {
    running--;
    queue.shift()?.();
  };
  return <T>(job: () => Promise<T>): Promise<T> =>
    new Promise<T>((resolve, reject) => {
      const start = (): void => {
        running++;
        job().then(resolve, reject).finally(next);
      };
      if (running < size) start();
      else queue.push(start);
    });
}
