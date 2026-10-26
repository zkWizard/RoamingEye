import { geocode, type GeoResult } from "./geocoding";
import { flyToDistance } from "./placeFrame";
import {
  describePlaceDifference,
  pairFocus,
  placePreviewUrl,
  previewBounds,
  resolvePlaceCompareMonth,
  unionBounds,
} from "./placeCompare";
import { ProbeSampler } from "../probe/ProbeSampler";
import {
  formatTimelineLabel,
  LAYERS,
  nearestMonthIndex,
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
  hideStudy(): void;
  enableMonthCompare(earlier: YearMonth): void;
  clearSharedSearch(): void;
  scheduleHashSync(): void;
}

let generation = 0;
let geocodeAbort: AbortController | undefined;
let panel: PlaceComparePanel | undefined;

function comparisonPanel(): PlaceComparePanel {
  if (!panel) {
    const parent = document.querySelector("#app");
    panel = new PlaceComparePanel(
      parent instanceof HTMLElement ? parent : document.body
    );
  }
  return panel;
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
  if (LAYERS[layerId].static) {
    host.announce("That layer has no months to compare.");
    return;
  }

  host.clearSharedSearch();
  host.prepareLayer(layerId);
  host.hideStudy();
  if (!still(token)) return;

  const query = {
    placeA: pick.placeA,
    placeB: pick.placeB,
    layer: layerId,
    defaultMonth: pick.defaultMonth,
    requested: { year: pick.year, month: pick.month },
  };
  const resolved = resolvePlaceCompareMonth(host.months(), query);
  if (!resolved) {
    host.announce("This layer has no published months.");
    return;
  }
  const layer = LAYERS[layerId];
  const monthLabel = formatTimelineLabel(layer, resolved.month);
  host.seek(nearestMonthIndex([...host.months()], resolved.month));
  host.scheduleHashSync();

  const view = comparisonPanel();
  view.show({
    placeA: pick.placeA,
    placeB: pick.placeB,
    layerLabel: layer.label,
    monthLabel,
    note: resolved.note ?? "",
    readout: `Reading ${pick.placeA} and ${pick.placeB}…`,
  });
  if (resolved.note) host.announce(resolved.note);

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
      view.setReadout(text);
      host.announce(text);
      return;
    }
    console.warn("RoamingEye: comparison geocode failed", err);
    view.setReadout("Search unavailable — check connection.");
    host.announce("Search unavailable — check connection");
    return;
  }
  if (!still(token)) return;
  if (!placeA || !placeB) {
    const missing = !placeA ? pick.placeA : pick.placeB;
    const text = `No place found for ${missing}.`;
    view.setReadout(text);
    host.announce(text);
    return;
  }

  const focus = pairFocus(placeA, placeB);
  const framed = unionBounds(placeA, placeB);
  host.endFlight();
  // A city-pair box is only a couple of degrees. The single-place formula
  // then sits on the ground between them; a regional floor keeps both in view.
  const distance = framed ? Math.max(flyToDistance(framed), 1.55) : 2.2;
  host.fly(focus.lat, focus.lon, distance);
  const alt = `${layer.label}, ${monthLabel}`;
  view.setImages(
    placePreviewUrl(
      layer,
      resolved.month,
      previewBounds(placeA.boundingBox, placeA.lat, placeA.lon)
    ),
    placePreviewUrl(
      layer,
      resolved.month,
      previewBounds(placeB.boundingBox, placeB.lat, placeB.lon)
    ),
    `${placeA.name}, ${alt}`,
    `${placeB.name}, ${alt}`
  );

  try {
    const sampler = new ProbeSampler();
    const [sampleA, sampleB] = await Promise.all([
      sampler.sample(layer, [resolved.month], placeA.lat, placeA.lon, {
        signal: abort.signal,
      }),
      sampler.sample(layer, [resolved.month], placeB.lat, placeB.lon, {
        signal: abort.signal,
      }),
    ]);
    if (!still(token) || abort.signal.aborted) return;
    if (
      sampleA.transportFailureByMonth[0] ||
      sampleB.transportFailureByMonth[0]
    ) {
      const text = resolved.note
        ? `${resolved.note} Couldn't read the imagery just now.`
        : "Couldn't read the imagery just now.";
      view.setReadout(text);
      host.announce(text);
      return;
    }
    const difference = describePlaceDifference({
      placeA: pick.placeA,
      placeB: pick.placeB,
      layer: layerId,
      monthLabel,
      valueA: sampleA.values[0] ?? null,
      valueB: sampleB.values[0] ?? null,
      note: null,
    });
    view.setReadout(difference);
    host.announce(
      resolved.note ? `${resolved.note} ${difference}` : difference
    );
  } catch (err) {
    if (!still(token) || abort.signal.aborted) return;
    console.warn("RoamingEye: place comparison sample failed", err);
    view.setReadout(
      resolved.note
        ? `${resolved.note} Couldn't read the imagery just now.`
        : "Couldn't read the imagery just now."
    );
  }
}
