import { geocode, type GeoResult } from "./geocoding";
import {
  flyToDistance,
  framePair,
  longitudesInGeometry,
  type FrameOcclusion,
} from "./placeFrame";
import { resolvePlaceCompareMonth } from "./placeCompare";
import { ProbeSampler } from "../probe/ProbeSampler";
import { ComparePins } from "../scene/ComparePins";
import type { PlaceCompareCard, PlaceNumber } from "../ui/PlaceComparePanel";
import {
  onDismissPlaceCompare,
  onFrameComparePins,
} from "../ui/placeCompareBridge";
import {
  chartWindow,
  formatRain,
  formatScaled,
  formatTemp,
  fullMonthLabel,
  isPointClimateLayer,
  measureName,
  monthValue,
  rainSentence,
  scaledSentence,
  tempSentence,
  valueChart,
  variableForLayer,
  type ChartPoint,
  type ClimateQuery,
  type MonthClimate,
} from "./compareClimate";
import { loadMonthlyClimate } from "./openMeteoClimate";
import { PROBE_SCALES, scaleValue } from "./probe";
import {
  addMonths,
  formatTimelineLabel,
  LAYERS,
  MONTH_NAMES,
  nearestMonthIndex,
  utcYearMonth,
  ymEqual,
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
  /**
   * `tight` frames the place itself. The default backs up when the box is
   * small, which suits a river and leaves a city too far away to read.
   */
  fit?: "tight";
  /**
   * Closest the camera may sit, as a distance from the globe's centre.
   * A city outline otherwise opens on one pixel of a coarse layer.
   */
  minDistance?: number;
  /** Overlay ids to turn on once the place is the subject, such as borders. */
  overlays?: readonly string[];
}

export interface PlaceComparePick {
  placeA: string;
  placeB: string;
  layerId: string;
  year: number | null;
  month: number | null;
  defaultMonth: number;
  /** The typed query, so a shared link can open the same comparison. */
  query?: string;
  /**
   * Month the globe is already showing. A shared link passes the hash
   * month so the card does not resolve a different one on reload.
   */
  lockedMonth?: YearMonth | null;
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
  /** Turn a map overlay on. Optional so older hosts keep working. */
  pressOverlay?(id: string): void;
  enableMonthCompare(earlier: YearMonth): void;
  clearSharedSearch(): void;
  /** Remember the comparison query so the share link reopens it. */
  noteQuery(query: string): void;
  scheduleHashSync(): void;
}

let generation = 0;
let geocodeAbort: AbortController | undefined;
let panel: PlaceComparePanel | undefined;
let pins: ComparePins | undefined;
let active: ActiveCompare | undefined;
/** A scrub that landed before the card's numbers did. */
let scrub: { token: number; month: YearMonth } | undefined;
let watchingTimeline = false;

interface ClimateBundle {
  monthsA: MonthClimate[];
  monthsB: MonthClimate[];
}

interface ProbeBundle {
  seriesA: ChartPoint[];
  seriesB: ChartPoint[];
}

interface ActiveCompare {
  token: number;
  layerId: LayerId;
  placeA: GeoResult;
  placeB: GeoResult;
  /** Month the card is describing. Null while the first read is in flight. */
  shown: YearMonth | null;
  /** Timeline month when this comparison took the globe over. */
  openedAt: YearMonth | null;
  climate: ClimateBundle | null;
  probe: ProbeBundle | null;
  host: ComparisonHost;
}

function comparisonPanel(host: ComparisonHost): PlaceComparePanel {
  if (!panel) {
    const parent = document.querySelector("#app");
    panel = new PlaceComparePanel(
      parent instanceof HTMLElement ? parent : document.body
    );
    panel.setOnClose(() => {
      pins?.hide();
      active = undefined;
      scrub = undefined;
      host.clearSharedSearch();
      host.scheduleHashSync();
    });
    onDismissPlaceCompare(() => onGlobeDismiss());
    watchTimeline();
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
  for (const id of pick.overlays ?? []) host.pressOverlay?.(id);
  host.hideStudy();
  host.endFlight();
  const box = place.boundingBox;
  const span = box
    ? Math.max(Math.abs(box[1] - box[0]), Math.abs(box[3] - box[2]))
    : 0;
  // A river segment is a few tenths of a degree. Frame the landscape around
  // it; a state-sized box already frames itself.
  const framed =
    pick.fit === "tight"
      ? flyToDistance(box, longitudesInGeometry(place.geometry))
      : box && span < 4
        ? Math.max(flyToDistance(box), 1.65)
        : flyToDistance(box);
  const distance =
    pick.minDistance === undefined
      ? framed
      : Math.max(framed, pick.minDistance);
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
  // prepareLayer dismisses the previous card, and that close clears the
  // shared query. Record this comparison after that, or the link loses it.
  if (pick.query) host.noteQuery(pick.query);
  host.hideStudy();
  host.clearHighlight();
  if (!still(token)) return;

  const climateQuery: ClimateQuery = {
    requested: { year: pick.year, month: pick.month },
    defaultMonth: pick.defaultMonth,
  };
  const view = comparisonPanel(host);
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

  const pose = framePair(
    { lat: placeA.lat, lon: placeA.lon },
    { lat: placeB.lat, lon: placeB.lon },
    compareViewport()
  );
  host.endFlight();
  host.fly(pose.lat, pose.lon, pose.distance);
  if (!still(token)) return;
  placePins(host).show(
    { name: placeA.name, lat: placeA.lat, lon: placeA.lon },
    { name: placeB.name, lat: placeB.lat, lon: placeB.lon }
  );

  const placeQuery = {
    placeA: placeA.name,
    placeB: placeB.name,
    layer: layerId,
    defaultMonth: pick.defaultMonth,
    requested: climateQuery.requested,
  };
  const choice = resolvePlaceCompareMonth(
    host.months(),
    placeQuery,
    pick.lockedMonth
  );
  if (!choice) {
    const text = "This layer has no published months.";
    showStatus(view, `${placeA.name} vs ${placeB.name}`, text);
    host.announce(text);
    return;
  }
  active = {
    token,
    layerId,
    placeA,
    placeB,
    shown: null,
    openedAt: readTimelineMonth(),
    climate: null,
    probe: null,
    host,
  };

  try {
    if (isPointClimateLayer(layerId)) {
      const bundle = await loadClimatePair(
        placeA,
        placeB,
        climateQuery,
        abort.signal
      );
      if (!still(token) || abort.signal.aborted || !active) return;
      active.climate = bundle;
    } else {
      const bundle = await loadProbePair(
        layerId,
        placeA,
        placeB,
        choice.month,
        host.months(),
        abort.signal
      );
      if (!still(token) || abort.signal.aborted || !active) return;
      active.probe = bundle;
    }
    if (!still(token) || !active || active.token !== token) return;
    const followed = scrub?.token === token ? scrub.month : null;
    const month = followed ?? choice.month;
    const note = followed ? "" : (choice.note ?? "");
    // The scrub already moved the globe. Seeking again would undo it.
    if (!followed) seekImagery(host, month);
    active.shown = month;
    const card = cardFor(active, month, note);
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

async function loadClimatePair(
  placeA: GeoResult,
  placeB: GeoResult,
  query: ClimateQuery,
  signal: AbortSignal
): Promise<ClimateBundle> {
  const today = utcYearMonth();
  const [left, right] = await Promise.allSettled([
    loadMonthlyClimate(placeA.lat, placeA.lon, query, today, signal),
    loadMonthlyClimate(placeB.lat, placeB.lon, query, today, signal),
  ]);
  if (signal.aborted) return { monthsA: [], monthsB: [] };
  const monthsA = left.status === "fulfilled" ? left.value : [];
  const monthsB = right.status === "fulfilled" ? right.value : [];
  if (monthsA.length === 0 && monthsB.length === 0) {
    throw left.status === "rejected"
      ? left.reason
      : new Error("Open-Meteo returned no months");
  }
  return { monthsA, monthsB };
}

async function loadProbePair(
  layerId: LayerId,
  placeA: GeoResult,
  placeB: GeoResult,
  focus: YearMonth,
  available: readonly YearMonth[],
  signal: AbortSignal
): Promise<ProbeBundle> {
  const layer = LAYERS[layerId];
  const [seriesA, seriesB] = await Promise.all([
    readProbe(layer, focus, available, placeA.lat, placeA.lon, signal),
    readProbe(layer, focus, available, placeB.lat, placeB.lon, signal),
  ]);
  return { seriesA, seriesB };
}

function cardFor(
  session: ActiveCompare,
  month: YearMonth,
  note: string
): PlaceCompareCard {
  if (session.climate) return climateView(session, month, note);
  if (session.probe) return probeView(session, month, note);
  return baseCard(
    session.placeA,
    session.placeB,
    measureName(session.layerId),
    "",
    `Reading ${session.placeA.name} and ${session.placeB.name}…`,
    null,
    "",
    ""
  );
}

function climateView(
  session: ActiveCompare,
  month: YearMonth,
  note: string
): PlaceCompareCard {
  const { layerId, placeA, placeB } = session;
  const bundle = session.climate ?? { monthsA: [], monthsB: [] };
  const variable = variableForLayer(layerId);
  const valueA = monthValue(bundle.monthsA, month, variable);
  const valueB = monthValue(bundle.monthsB, month, variable);
  const prose = fullMonthLabel(month);
  const short = formatTimelineLabel(LAYERS[layerId], month);
  const sentence =
    layerId === "precip"
      ? rainSentence(placeA.name, placeB.name, prose, valueA, valueB)
      : tempSentence(placeA.name, placeB.name, prose, valueA, valueB);
  const window = chartWindow(month, bundle.monthsA, bundle.monthsB, variable);
  return {
    ...baseCard(
      placeA,
      placeB,
      measureName(layerId),
      short,
      sentence,
      [
        figure(placeA.name, valueA, layerId),
        figure(placeB.name, valueB, layerId),
      ],
      climateSource(layerId),
      ""
    ),
    note,
    chart: {
      ...window,
      zeroBased: layerId === "precip",
      label: `${measureName(layerId)} for the 12 months ending ${prose}. ${placeA.name} in blue, ${placeB.name} in gold.`,
    },
  };
}

function probeView(
  session: ActiveCompare,
  month: YearMonth,
  note: string
): PlaceCompareCard {
  const { layerId, placeA, placeB } = session;
  const bundle = session.probe ?? { seriesA: [], seriesB: [] };
  const layer = LAYERS[layerId];
  const monthLabel = formatTimelineLabel(layer, month);
  const valueA = pointAt(bundle.seriesA, month);
  const valueB = pointAt(bundle.seriesB, month);
  const scale = PROBE_SCALES[layerId];
  const chart = valueChart(month, bundle.seriesA, bundle.seriesB);
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
    note,
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

function onGlobeDismiss(): void {
  if (!active || active.token !== generation || !panel) {
    panel?.hide();
    return;
  }
  const live = readTimelineMonth();
  if (!active.shown) {
    if (live && active.openedAt && !ymEqual(live, active.openedAt)) {
      scrub = { token: active.token, month: live };
      return;
    }
    panel.hide();
    return;
  }
  if (live && !ymEqual(live, active.shown)) {
    followMonth(live);
    return;
  }
  panel.hide();
}

function followMonth(month: YearMonth): void {
  if (!active || active.token !== generation || !panel) return;
  scrub = { token: active.token, month };
  if (!active.climate && !active.probe) return;
  active.shown = month;
  const card = cardFor(active, month, "");
  panel.show(card);
  active.host.announce(card.sentence);
}

function readTimelineMonth(): YearMonth | null {
  const text =
    document.querySelector(".timeline__readout")?.textContent?.trim() ?? "";
  const match = /^([A-Za-z]{3}) (\d{4})$/.exec(text);
  if (!match) return null;
  const month = (MONTH_NAMES as readonly string[]).indexOf(match[1]) + 1;
  if (month < 1) return null;
  const year = Number(match[2]);
  if (!Number.isInteger(year)) return null;
  return { year, month };
}

function watchTimeline(): void {
  if (watchingTimeline || typeof MutationObserver === "undefined") return;
  const root = document.querySelector("#timeline");
  if (!root) return;
  watchingTimeline = true;
  const observer = new MutationObserver(() => {
    const live = readTimelineMonth();
    if (!live || !active || active.token !== generation || !active.shown)
      return;
    if (ymEqual(live, active.shown)) return;
    followMonth(live);
  });
  observer.observe(root, {
    subtree: true,
    childList: true,
    characterData: true,
  });
}

/** Globe camera field of view. Kept in step with the camera in main.ts. */
const GLOBE_FOV = 45;

function compareViewport(): {
  fovDeg: number;
  aspect: number;
  occlude: FrameOcclusion;
  padding: number;
} {
  const w = Math.max(1, window.innerWidth);
  const h = Math.max(1, window.innerHeight);
  const occlude: FrameOcclusion = { top: 0, right: 0, bottom: 0, left: 0 };
  const take = (selector: string) => {
    const el = document.querySelector(selector);
    if (!(el instanceof HTMLElement)) return;
    if (el.hidden || getComputedStyle(el).display === "none") return;
    absorbChrome(occlude, reservedRect(el), w, h);
  };
  take(".overlay--top");
  take(".overlay--bottom");
  take(".place-compare.is-open");
  take(".toolbar:not(.is-collapsed)");
  // A collapsed phone sheet is only a handle, but it still covers the bottom.
  take(".toolbar.is-collapsed");
  // Pin markers are drawn larger than the point. A bottom sheet that ends
  // exactly at the label still covers the circle.
  if (occlude.bottom > 0.35)
    occlude.bottom = Math.min(0.8, occlude.bottom + 0.1);
  return { fovDeg: GLOBE_FOV, aspect: w / h, occlude, padding: 0.05 };
}

function reservedRect(el: HTMLElement): DOMRect {
  const rect = el.getBoundingClientRect();
  const style = getComputedStyle(el);
  const maxH = Number.parseFloat(style.maxHeight);
  // A bottom sheet grows upward. Measure the tallest it is allowed to be,
  // not the short "Reading…" card, or the pins land under the full card.
  if (
    Number.isFinite(maxH) &&
    maxH > rect.height + 1 &&
    style.top === "auto" &&
    style.bottom !== "auto"
  ) {
    return new DOMRect(rect.x, rect.bottom - maxH, rect.width, maxH);
  }
  return rect;
}

function absorbChrome(
  occlude: FrameOcclusion,
  rect: DOMRect,
  w: number,
  h: number
): void {
  if (rect.width < 8 || rect.height < 8) return;
  const widthFrac = rect.width / w;
  const heightFrac = rect.height / h;
  const touchesLeft = rect.left < w * 0.08;
  const touchesRight = rect.right > w * 0.92;
  if (touchesLeft && !touchesRight && widthFrac < 0.55) {
    occlude.left = Math.max(occlude.left, rect.right / w);
  }
  if (touchesRight && !touchesLeft && widthFrac < 0.55) {
    occlude.right = Math.max(occlude.right, (w - rect.left) / w);
  }
  if (rect.top < h * 0.08 && widthFrac > 0.5 && heightFrac < 0.34) {
    occlude.top = Math.max(occlude.top, rect.bottom / h);
  }
  if (widthFrac > 0.62 && rect.top > h * 0.18) {
    occlude.bottom = Math.max(occlude.bottom, (h - rect.top) / h);
  }
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
