import { geocode, type GeoResult } from "./geocoding";
import { flyToDistance } from "./placeFrame";
import {
  pairFocus,
  resolvePlaceCompareMonth,
  unionBounds,
} from "./placeCompare";
import { ProbeSampler } from "../probe/ProbeSampler";
import { ComparePins } from "../scene/ComparePins";
import type { PlaceCompareCard, PlaceNumber } from "../ui/PlaceComparePanel";
import { onFrameComparePins } from "../ui/placeCompareBridge";
import {
  chartWindow,
  formatRain,
  formatScaled,
  formatTemp,
  fullMonthLabel,
  isPointClimateLayer,
  measureName,
  rainSentence,
  scaledSentence,
  selectPairMonth,
  tempSentence,
  valueChart,
  variableForLayer,
  type ChartPoint,
  type ClimateQuery,
} from "./compareClimate";
import { loadMonthlyClimate } from "./openMeteoClimate";
import { PROBE_SCALES, scaleValue } from "./probe";
import {
  addMonths,
  formatTimelineLabel,
  LAYERS,
  nearestMonthIndex,
  utcYearMonth,
  type LayerId,
  type YearMonth,
} from "./timeline";
import {
  chooseCompareHit,
  needsNaturalFeature,
  resolveCompareMonths,
  type ThenNowQuery,
} from "./thenNow";
import { PlaceComparePanel } from "../ui/PlaceComparePanel";

/** What the search row carries. Kept as plain fields so the box never parses it. */
export interface ThenNowPick {
  place: string;
  layerId: string;
  earlierYear: number;
  earlierMonth: number;
  laterYear: number | null;
  laterMonth: number;
}

export interface PlaceComparePick {
  placeA: string;
  placeB: string;
  layerId: string;
  year: number | null;
  month: number | null;
  defaultMonth: number;
}

export interface ComparisonHost {
  announce(message: string): void;
  layer(): LayerId;
  months(): readonly YearMonth[];
  /** Close the previous analysis and show `id`, rebuilding the timeline. */
  prepareLayer(id: LayerId): void;
  seek(index: number): void;
  fly(lat: number, lon: number, distance: number): void;
  endFlight(): void;
  showHighlight(result: GeoResult): void;
  clearHighlight(): void;
  /** Add the comparison pins to the globe. Called once. */
  attach(object: object): void;
  hideStudy(): void;
  enableMonthCompare(earlier: YearMonth): void;
  clearSharedSearch(): void;
  scheduleHashSync(): void;
}

let generation = 0;
let geocodeAbort: AbortController | undefined;
let panel: PlaceComparePanel | undefined;
let pins: ComparePins | undefined;

function comparisonPanel(): PlaceComparePanel {
  if (!panel) {
    const parent = document.querySelector("#app");
    panel = new PlaceComparePanel(
      parent instanceof HTMLElement ? parent : document.body
    );
    panel.setOnClose(() => pins?.hide());
  }
  return panel;
}

function placePins(host: ComparisonHost): ComparePins {
  if (!pins) {
    const parent = document.querySelector("#app");
    pins = new ComparePins(
      parent instanceof HTMLElement ? parent : document.body
    );
    host.attach(pins.object);
    onFrameComparePins((camera) => pins?.update(camera));
  }
  return pins;
}

function isLayerId(id: string): id is LayerId {
  return Object.prototype.hasOwnProperty.call(LAYERS, id);
}

async function pickPlace(
  name: string,
  signal: AbortSignal
): Promise<GeoResult | undefined> {
  const found = await geocode(name, signal);
  if (signal.aborted) return undefined;
  let natural: GeoResult[] = [];
  if (needsNaturalFeature(found[0])) {
    natural = await geocode(name, signal, "natural");
  }
  return chooseCompareHit(found, natural);
}

function still(token: number): boolean {
  return token === generation;
}

function interrupted(err: unknown): boolean {
  return err instanceof DOMException && err.name === "AbortError";
}

/** Month swipe for one place: "Amazon 2005 vs 2020". */
export async function openThenNow(
  pick: ThenNowPick,
  host: ComparisonHost
): Promise<void> {
  if (!isLayerId(pick.layerId)) return;
  const token = ++generation;
  geocodeAbort?.abort();
  const abort = new AbortController();
  geocodeAbort = abort;
  const query: ThenNowQuery = {
    place: pick.place,
    layer: pick.layerId,
    earlier: { year: pick.earlierYear, month: pick.earlierMonth },
    later: { year: pick.laterYear, month: pick.laterMonth },
  };
  if (LAYERS[query.layer].static) return;

  let place: GeoResult | undefined;
  try {
    place = await pickPlace(query.place, abort.signal);
  } catch (err) {
    if (!still(token) || abort.signal.aborted) return;
    if (interrupted(err)) {
      host.announce(
        "The place lookup was interrupted. Choose the comparison again."
      );
      return;
    }
    console.warn("RoamingEye: comparison geocode failed", err);
    host.announce("Search unavailable — check connection");
    return;
  }
  if (!still(token)) return;
  if (!place) {
    host.announce(`No place found for ${query.place}`);
    return;
  }

  host.clearSharedSearch();
  host.prepareLayer(query.layer);
  host.hideStudy();
  host.endFlight();
  const box = place.boundingBox;
  const span = box
    ? Math.max(Math.abs(box[1] - box[0]), Math.abs(box[3] - box[2]))
    : 0;
  // A river segment is a few tenths of a degree. Frame the landscape around
  // it; a state-sized box already frames itself.
  const distance =
    box && span < 4 ? Math.max(flyToDistance(box), 1.65) : flyToDistance(box);
  host.fly(place.lat, place.lon, distance);
  host.showHighlight(place);

  const pair = resolveCompareMonths(host.months(), query);
  if (!pair) {
    host.announce("Those months aren't in this layer's record.");
    host.scheduleHashSync();
    return;
  }
  host.seek(nearestMonthIndex([...host.months()], pair.later));
  host.enableMonthCompare(pair.earlier);
  host.scheduleHashSync();
}

/** Both places, one layer, one month: "Houston vs Austin rainfall 2026". */
export async function openPlaceCompare(
  pick: PlaceComparePick,
  host: ComparisonHost
): Promise<void> {
  if (!isLayerId(pick.layerId)) return;
  const layerId = pick.layerId;
  const token = ++generation;
  geocodeAbort?.abort();
  const abort = new AbortController();
  geocodeAbort = abort;
  if (LAYERS[layerId].static || LAYERS[layerId].categorical) {
    host.announce("That layer has no months to compare.");
    return;
  }

  host.clearSharedSearch();
  host.prepareLayer(layerId);
  host.hideStudy();
  host.clearHighlight();
  if (!still(token)) return;

  const climateQuery: ClimateQuery = {
    requested: { year: pick.year, month: pick.month },
    defaultMonth: pick.defaultMonth,
  };
  const view = comparisonPanel();
  view.show({
    title: `${pick.placeA} vs ${pick.placeB}`,
    meta: "",
    sentence: `Reading ${pick.placeA} and ${pick.placeB}…`,
    note: "",
    source: "",
    mapNote: "",
    places: null,
    chart: null,
  });

  let placeA: GeoResult | undefined;
  let placeB: GeoResult | undefined;
  try {
    placeA = await pickPlace(pick.placeA, abort.signal);
    if (!still(token) || abort.signal.aborted) return;
    placeB = await pickPlace(pick.placeB, abort.signal);
  } catch (err) {
    if (!still(token) || abort.signal.aborted) return;
    if (interrupted(err)) {
      const text =
        "The place lookup was interrupted. Choose the comparison again.";
      showStatus(view, `${pick.placeA} vs ${pick.placeB}`, text);
      host.announce(text);
      return;
    }
    console.warn("RoamingEye: comparison geocode failed", err);
    showStatus(
      view,
      `${pick.placeA} vs ${pick.placeB}`,
      "Search unavailable — check connection."
    );
    host.announce("Search unavailable — check connection");
    return;
  }
  if (!still(token)) return;
  if (!placeA || !placeB) {
    const missing = !placeA ? pick.placeA : pick.placeB;
    const text = `No place found for ${missing}.`;
    showStatus(view, `${pick.placeA} vs ${pick.placeB}`, text);
    host.announce(text);
    return;
  }

  const focus = pairFocus(placeA, placeB);
  const framed = unionBounds(placeA, placeB);
  host.endFlight();
  // A city-pair box is only a couple of degrees. The single-place formula
  // then sits on the ground between them; a regional floor keeps both in view
  // and leaves room for the card on the left.
  const distance = framed ? Math.max(flyToDistance(framed), 2.8) : 3.2;
  // On a phone the card and the dock cover the lower half of the canvas, and
  // the camera target is drawn at the canvas centre. Aim south of the pair so
  // both cities land in the open map above the card.
  const stacked = window.matchMedia(
    "(max-width: 540px), (max-height: 460px)"
  ).matches;
  const aimLat = stacked ? Math.max(-75, focus.lat - 18) : focus.lat;
  host.fly(aimLat, focus.lon, distance);
  if (!still(token)) return;
  placePins(host).show(
    { name: placeA.name, lat: placeA.lat, lon: placeA.lon },
    { name: placeB.name, lat: placeB.lat, lon: placeB.lon }
  );

  try {
    const card = isPointClimateLayer(layerId)
      ? await climateCard(
          layerId,
          placeA,
          placeB,
          climateQuery,
          host,
          abort.signal
        )
      : await probeCard(
          layerId,
          placeA,
          placeB,
          climateQuery,
          host,
          abort.signal
        );
    if (!still(token) || abort.signal.aborted) return;
    if (!card) {
      const text = "This layer has no published months.";
      showStatus(view, `${placeA.name} vs ${placeB.name}`, text);
      host.announce(text);
      return;
    }
    view.show(card);
    host.announce(card.note ? `${card.note} ${card.sentence}` : card.sentence);
  } catch (err) {
    if (!still(token) || abort.signal.aborted) return;
    console.warn("RoamingEye: place comparison failed", err);
    const text = "Couldn't read that comparison just now.";
    showStatus(view, `${placeA.name} vs ${placeB.name}`, text);
    host.announce(text);
  }
}

function showStatus(
  view: PlaceComparePanel,
  title: string,
  sentence: string
): void {
  view.show({
    title,
    meta: "",
    sentence,
    note: "",
    source: "",
    mapNote: "",
    places: null,
    chart: null,
  });
}

async function climateCard(
  layerId: LayerId,
  placeA: GeoResult,
  placeB: GeoResult,
  query: ClimateQuery,
  host: ComparisonHost,
  signal: AbortSignal
): Promise<PlaceCompareCard | undefined> {
  const today = utcYearMonth();
  const variable = variableForLayer(layerId);
  const [left, right] = await Promise.allSettled([
    loadMonthlyClimate(placeA.lat, placeA.lon, query, today, signal),
    loadMonthlyClimate(placeB.lat, placeB.lon, query, today, signal),
  ]);
  if (signal.aborted) return undefined;
  const monthsA = left.status === "fulfilled" ? left.value : [];
  const monthsB = right.status === "fulfilled" ? right.value : [];
  if (monthsA.length === 0 && monthsB.length === 0) {
    throw left.status === "rejected"
      ? left.reason
      : new Error("Open-Meteo returned no months");
  }
  const selected = selectPairMonth(monthsA, monthsB, query, variable, today);
  if (!selected) {
    return baseCard(
      placeA,
      placeB,
      measureName(layerId),
      "",
      `No ${measureName(layerId).toLowerCase()} reading for ${placeA.name} and ${placeB.name}.`,
      null,
      climateSource(layerId),
      ""
    );
  }
  const monthLabel = fullMonthLabel(selected.month);
  const sentence =
    layerId === "precip"
      ? rainSentence(
          placeA.name,
          placeB.name,
          monthLabel,
          selected.valueA,
          selected.valueB
        )
      : tempSentence(
          placeA.name,
          placeB.name,
          monthLabel,
          selected.valueA,
          selected.valueB
        );
  const window = chartWindow(selected.month, monthsA, monthsB, variable);
  seekImagery(host, selected.month);
  return {
    ...baseCard(
      placeA,
      placeB,
      measureName(layerId),
      monthLabel,
      sentence,
      [
        figure(placeA.name, selected.valueA, layerId),
        figure(placeB.name, selected.valueB, layerId),
      ],
      climateSource(layerId),
      imageryNote(host, layerId, selected.month)
    ),
    note: selected.note ?? "",
    chart: {
      ...window,
      zeroBased: layerId === "precip",
      label: `${measureName(layerId)} for the 12 months ending ${monthLabel}. ${placeA.name} in blue, ${placeB.name} in gold.`,
    },
  };
}

async function probeCard(
  layerId: LayerId,
  placeA: GeoResult,
  placeB: GeoResult,
  query: ClimateQuery,
  host: ComparisonHost,
  signal: AbortSignal
): Promise<PlaceCompareCard | undefined> {
  const layer = LAYERS[layerId];
  const resolved = resolvePlaceCompareMonth(host.months(), {
    placeA: placeA.name,
    placeB: placeB.name,
    layer: layerId,
    defaultMonth: query.defaultMonth,
    requested: query.requested,
  });
  if (!resolved) return undefined;
  seekImagery(host, resolved.month);
  const [seriesA, seriesB] = await Promise.all([
    readProbe(
      layer,
      resolved.month,
      host.months(),
      placeA.lat,
      placeA.lon,
      signal
    ),
    readProbe(
      layer,
      resolved.month,
      host.months(),
      placeB.lat,
      placeB.lon,
      signal
    ),
  ]);
  const monthLabel = formatTimelineLabel(layer, resolved.month);
  const valueA = pointAt(seriesA, resolved.month);
  const valueB = pointAt(seriesB, resolved.month);
  const scale = PROBE_SCALES[layerId];
  const chart = valueChart(resolved.month, seriesA, seriesB);
  return {
    title: `${placeA.name} vs ${placeB.name}`,
    meta: `${layer.label} · ${monthLabel}`,
    sentence: scaledSentence(
      layerId,
      placeA.name,
      placeB.name,
      monthLabel,
      valueA,
      valueB,
      scale
    ),
    note: resolved.note ?? "",
    source: "Approximate, read from the map colors.",
    mapNote: "",
    places: [
      figure(placeA.name, valueA, layerId),
      figure(placeB.name, valueB, layerId),
    ],
    chart: {
      ...chart,
      zeroBased: scale.unit !== "°C",
      label: `${layer.label} for the 12 months ending ${monthLabel}. ${placeA.name} in blue, ${placeB.name} in gold.`,
    },
  };
}

function baseCard(
  placeA: GeoResult,
  placeB: GeoResult,
  measure: string,
  monthLabel: string,
  sentence: string,
  places: readonly [PlaceNumber, PlaceNumber] | null,
  source: string,
  mapNote: string
): PlaceCompareCard {
  return {
    title: `${placeA.name} vs ${placeB.name}`,
    meta: monthLabel ? `${measure} · ${monthLabel}` : measure,
    sentence,
    note: "",
    source,
    mapNote,
    places,
    chart: null,
  };
}

function figure(
  name: string,
  value: number | null,
  layerId: LayerId
): PlaceNumber {
  if (value === null) return { name, primary: "—", secondary: "" };
  if (layerId === "precip") {
    const rain = formatRain(value);
    return { name, primary: rain.primary, secondary: rain.secondary };
  }
  if (layerId === "lst" || layerId === "airtemp") {
    const temp = formatTemp(value);
    return { name, primary: temp.primary, secondary: temp.secondary };
  }
  const scaled = formatScaled(value, PROBE_SCALES[layerId]);
  return { name, primary: scaled.primary, secondary: scaled.secondary };
}

function climateSource(layerId: LayerId): string {
  if (layerId === "precip") return "ERA5 reanalysis via Open-Meteo";
  return "ERA5 reanalysis via Open-Meteo · 2 m air temperature";
}

function seekImagery(host: ComparisonHost, month: YearMonth): void {
  const months = host.months();
  if (months.length === 0) return;
  host.seek(nearestMonthIndex([...months], month));
  host.scheduleHashSync();
}

function imageryNote(
  host: ComparisonHost,
  layerId: LayerId,
  shown: YearMonth
): string {
  const months = host.months();
  if (months.length === 0) return "";
  const imagery = months[nearestMonthIndex([...months], shown)];
  if (!imagery) return "";
  if (imagery.year === shown.year && imagery.month === shown.month) return "";
  return `Map shows ${formatTimelineLabel(LAYERS[layerId], imagery)}.`;
}

async function readProbe(
  layer: (typeof LAYERS)[LayerId],
  focus: YearMonth,
  available: readonly YearMonth[],
  lat: number,
  lon: number,
  signal: AbortSignal
): Promise<ChartPoint[]> {
  const wanted: YearMonth[] = [];
  for (let i = 11; i >= 0; i--) wanted.push(addMonths(focus, -i));
  const present = wanted.filter((ym) =>
    available.some(
      (month) => month.year === ym.year && month.month === ym.month
    )
  );
  const blanks = wanted.map((ym) => ({ ...ym, value: null }));
  if (present.length === 0) return blanks;
  const sample = await new ProbeSampler().sample(layer, present, lat, lon, {
    signal,
  });
  const scale = PROBE_SCALES[layer.id];
  return wanted.map((ym) => {
    const index = present.findIndex(
      (month) => month.year === ym.year && month.month === ym.month
    );
    if (index < 0) return { ...ym, value: null };
    const raw = sample.values[index];
    if (
      raw === null ||
      raw === undefined ||
      sample.transportFailureByMonth[index]
    ) {
      return { ...ym, value: null };
    }
    return { ...ym, value: scaleValue(raw, scale) };
  });
}

function pointAt(series: readonly ChartPoint[], ym: YearMonth): number | null {
  const point = series.find(
    (row) => row.year === ym.year && row.month === ym.month
  );
  return point?.value ?? null;
}
