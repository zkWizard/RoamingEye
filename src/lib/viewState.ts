import { LAYERS, type LayerId, type YearMonth } from "./timeline";
// Type-only: the bounds shape drawn regions already travel in. Keeping this
// module's runtime imports to timeline.ts alone is deliberate — it sits in the
// entry chunk, and pulling in probe.ts (via geo/imagery helpers) has
// repartitioned the build before.
import type { Bounds } from "./imagery";

/**
 * Shareable view state, encoded in the URL hash.
 *
 * A link like `#layer=lst&t=2024-08&lat=-21.2&lon=55.7&alt=1.8` reproduces
 * exactly what the sender was looking at — the academic use case is citing a
 * specific view in a paper, thesis, or message. A searched place rides along
 * as `place=` (name, lat/lon, bbox) plus `q=`, the query that place was parsed
 * from, so the recipient gets the outline, the place panel, and the chart
 * rather than only the camera. Pure logic, no DOM (see viewState.test.ts);
 * main.ts owns reading/writing `location.hash`.
 *
 * Links written before `place=` and `q=` existed omit both. Decoding drops a
 * missing or malformed field and keeps the rest, so those bookmarks still
 * open the view they always opened.
 */

export interface CameraState {
  /** Sub-satellite point the camera hovers over, in degrees. */
  lat: number;
  lon: number;
  /** Camera altitude above the surface, in Earth radii. */
  alt: number;
}

/**
 * How a shared probe sampled its point. The two toggleable modes read the same
 * rendered imagery but reduce it differently — `point` takes the median of a
 * 3×3 pixel neighbourhood, `area` a cos(latitude)-weighted mean over a 1° box
 * (see probe/ProbeSampler.ts) — so they are different statistics, and the CSV
 * export names which one produced a series.
 */
export type ProbeShareMode = "point" | "area";

const PROBE_MODES: readonly string[] = ["point", "area"];

/**
 * An open probe, as a link carries it.
 *
 * A drawn region is not a sampling mode — it is a different kind of target,
 * carrying its own bounds instead of a point and a statistic. The two share
 * one hash field because the app itself holds them exclusive (starting a point
 * probe clears the drawn box, and drawing a box clears the point), so a single
 * field is the shape that cannot encode a contradiction.
 */
export type ProbeShare =
  | { kind: "point"; lat: number; lon: number; mode: ProbeShareMode }
  | { kind: "region"; bounds: Bounds };

// A drawn box, as dragBounds() produces it: latitudes clamped to ±85°, and
// longitudes on the continuous convention where a box across the antimeridian
// has east > 180 (see probe.ts). The span bounds are dragBounds' short-arc
// rule and boundsUsable's stray-click floor, re-stated here rather than
// imported so this module keeps its timeline-only runtime imports.
//
// The spans carry a ten-thousandth of slack because the encoder writes corners
// to 4 decimals: a box drawn at exactly the usable floor can come back a hair
// under it, and differencing two rounded corners costs another ulp on top.
// The job here is to reject a box the drawer could never have made, not to
// re-measure one it did — the fuzz suite found this at a 0.2° span.
const SPAN_SLACK = 1e-4;

function isUsableBounds(b: Bounds): boolean {
  const lonSpan = b.east - b.west;
  return (
    Math.abs(b.south) <= 85 &&
    Math.abs(b.north) <= 85 &&
    b.north - b.south >= 0.2 - SPAN_SLACK &&
    b.west >= -180 &&
    b.west <= 180 &&
    lonSpan >= 0.2 - SPAN_SLACK &&
    lonSpan <= 180 + SPAN_SLACK
  );
}

/**
 * Nominatim object id (`N` node, `W` way, `R` relation). A shared link looks
 * the outline up once with this; a name is not enough to address `/lookup`.
 */
export const NOMINATIM_OSM_ID = /^[NWR][1-9]\d{0,15}$/;

/** How long a shared place name or query may be. A hash is untrusted input. */
const PLACE_NAME_MAX = 160;
const QUERY_MAX = 200;

/**
 * A searched place, small enough for a hash.
 *
 * The polygon itself is not here — a country outline is far too large — so
 * the link carries the point, the bounding box, and the Nominatim id. Opening
 * it looks the outline up once (or traces the box when that lookup cannot).
 * `bbox` is Nominatim's order: `[south, north, west, east]`. West may be
 * greater than east when the box crosses the antimeridian.
 */
export interface SharedPlace {
  name: string;
  lat: number;
  lon: number;
  bbox?: [number, number, number, number];
  osm?: string;
}

export interface ViewState {
  /** A story playing (lib/stories.ts): the link replays it from the top. */
  story?: string;
  layer?: LayerId;
  month?: YearMonth;
  camera?: CameraState;
  /** An open time-series probe — the link reproduces the chart. What it
   * sampled travels with it: `mode` for a point (the two modes report
   * different statistics), the bounds for a drawn region. A link that dropped
   * either one reopened a chart of something else while a CSV `view_url`
   * pointed at it as the reproduction. */
  probe?: ProbeShare;
  /** An active comparison pinned to this month (the timeline month is the
   * other side) — the link reproduces the A/B view. */
  pin?: YearMonth;
  /** The searched place. Absent on every link written before place sharing. */
  place?: SharedPlace;
  /**
   * The query the place was parsed from. For a place search this is the
   * resolved name — the string the app understood, not the keystrokes — so a
   * shared link can show what was asked as well as where it landed.
   */
  query?: string;
}

const MONTH_RE = /^(\d{4})-(\d{2})$/;

const STORY_ID_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function isLayerId(value: string): value is LayerId {
  // Object.hasOwn, not `in`: the `in` operator walks the prototype chain, so
  // a crafted hash like #layer=toString would pass the guard and smuggle a
  // non-layer into app state — found by the fuzz suite (seed 1100653994).
  return Object.hasOwn(LAYERS, value);
}

/** A control character, or DEL. A hash is untrusted and these are not labels. */
function hasControlChar(value: string): boolean {
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    if (code <= 31 || code === 127) return true;
  }
  return false;
}

/** A shareable label: trimmed, bounded, and free of control characters. */
function cleanLabel(value: string, max: number): string | undefined {
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > max || hasControlChar(trimmed)) {
    return undefined;
  }
  return trimmed;
}

function isCoord(value: number, limit: number): boolean {
  return Number.isFinite(value) && Math.abs(value) <= limit;
}

/**
 * A bounding box the globe can outline. Zero-area boxes and a full-world
 * longitude span (Nominatim's antimeridian failure mode, west -180 / east
 * 180) are rejected; a box that merely crosses the dateline is kept.
 */
function isShareBbox(bbox: readonly [number, number, number, number]): boolean {
  const [south, north, west, east] = bbox;
  // A ten-thousandth of slack: the encoder writes corners to 4 decimals, and
  // a span of exactly 0.01° (the smallest box worth outlining) can come back
  // a hair under it. Same idea as the drawn-region floor in isUsableBounds.
  const minSpan = 0.01 - 1e-4;
  if (
    !isCoord(south, 90) ||
    !isCoord(north, 90) ||
    !isCoord(west, 180) ||
    !isCoord(east, 180) ||
    north - south < minSpan
  ) {
    return false;
  }
  let lonSpan = east - west;
  if (lonSpan <= 0) lonSpan += 360;
  return lonSpan >= minSpan && lonSpan <= 180 + 1e-4;
}

function formatCoord(value: number): string {
  return value.toFixed(4);
}

/**
 * `lat,lon,south,north,west,east,osm,name`.
 *
 * Seven fixed fields, then the name as the tail, so a name that itself
 * contains commas ("Paris, France") round-trips. Empty fields mean "no
 * bbox" or "no Nominatim id". Coordinates are 4 decimals, the same
 * precision a probe point uses.
 */
function encodePlace(place: SharedPlace): string | undefined {
  const name = cleanLabel(place.name, PLACE_NAME_MAX);
  if (!name || !isCoord(place.lat, 90) || !isCoord(place.lon, 180)) {
    return undefined;
  }
  const bbox =
    place.bbox && isShareBbox(place.bbox)
      ? place.bbox.map(formatCoord).join(",")
      : ",,,";
  const osm = place.osm && NOMINATIM_OSM_ID.test(place.osm) ? place.osm : "";
  return `${formatCoord(place.lat)},${formatCoord(place.lon)},${bbox},${osm},${name}`;
}

function decodePlace(raw: string): SharedPlace | undefined {
  const parts = raw.split(",");
  // lat, lon, four bbox slots, osm, and at least one name field.
  if (parts.length < 8) return undefined;
  const lat = Number(parts[0]);
  const lon = Number(parts[1]);
  if (!isCoord(lat, 90) || !isCoord(lon, 180)) return undefined;
  const name = cleanLabel(parts.slice(7).join(","), PLACE_NAME_MAX);
  if (!name) return undefined;

  const bboxParts = parts.slice(2, 6);
  let bbox: [number, number, number, number] | undefined;
  if (bboxParts.some((part) => part !== "")) {
    if (bboxParts.some((part) => part === "")) return undefined;
    const nums = bboxParts.map(Number) as [number, number, number, number];
    if (!isShareBbox(nums)) return undefined;
    bbox = nums;
  }

  const osmRaw = parts[6];
  if (osmRaw !== "" && !NOMINATIM_OSM_ID.test(osmRaw)) return undefined;

  const place: SharedPlace = { name, lat, lon };
  if (bbox) place.bbox = bbox;
  if (osmRaw) place.osm = osmRaw;
  return place;
}

/**
 * The place a search result contributes to a link. A result with no usable
 * point contributes nothing; a bad box or id is dropped rather than taking
 * the point down with it.
 */
export function sharedPlaceFrom(result: {
  name: string;
  lat: number;
  lon: number;
  boundingBox?: [number, number, number, number] | null;
  osm?: string;
}): SharedPlace | undefined {
  const name = cleanLabel(result.name, PLACE_NAME_MAX);
  if (!name || !isCoord(result.lat, 90) || !isCoord(result.lon, 180)) {
    return undefined;
  }
  const place: SharedPlace = { name, lat: result.lat, lon: result.lon };
  if (result.boundingBox && isShareBbox(result.boundingBox)) {
    place.bbox = result.boundingBox;
  }
  if (result.osm && NOMINATIM_OSM_ID.test(result.osm)) place.osm = result.osm;
  return place;
}

/**
 * Decimal places for a shared camera. `alt` is height above the unit sphere
 * in Earth radii (negative once the camera is inside that sphere, which is
 * every street-level view away from the equator).
 */
function cameraDigits(alt: number): { ll: number; alt: number } {
  const abs = Math.abs(alt);
  if (abs >= 0.1) return { ll: 2, alt: 2 };
  if (abs >= 0.02) return { ll: 4, alt: 5 };
  return { ll: 5, alt: 6 };
}

/** Encode a view state as a URL-hash payload (no leading `#`). */
export function encodeViewState(state: ViewState): string {
  const params = new URLSearchParams();
  if (state.story) params.set("story", state.story);
  if (state.layer) params.set("layer", state.layer);
  if (state.month) {
    params.set(
      "t",
      `${state.month.year}-${String(state.month.month).padStart(2, "0")}`
    );
  }
  if (state.camera) {
    // Orbital links stay at hundredths, the precision every existing citation
    // was written with. Street level needs metres: two decimals is ~64 km.
    const digits = cameraDigits(state.camera.alt);
    params.set("lat", state.camera.lat.toFixed(digits.ll));
    params.set("lon", state.camera.lon.toFixed(digits.ll));
    params.set("alt", state.camera.alt.toFixed(digits.alt));
  }
  if (state.probe?.kind === "region") {
    // S W N E — the same order and precision the probe CSV prints its
    // `# region:` header in, so the file and the link it stamps read alike.
    const b = state.probe.bounds;
    params.set(
      "probe",
      `${b.south.toFixed(4)},${b.west.toFixed(4)},${b.north.toFixed(4)},${b.east.toFixed(4)},region`
    );
  } else if (state.probe) {
    // The mode is always written, never left to a default: the silent default
    // is exactly how an area mean used to come back as a point median.
    params.set(
      "probe",
      `${state.probe.lat.toFixed(4)},${state.probe.lon.toFixed(4)},${state.probe.mode}`
    );
  }
  if (state.pin) {
    params.set(
      "pin",
      `${state.pin.year}-${String(state.pin.month).padStart(2, "0")}`
    );
  }
  if (state.place) {
    const place = encodePlace(state.place);
    if (place) params.set("place", place);
  }
  if (state.query) {
    const query = cleanLabel(state.query, QUERY_MAX);
    if (query) params.set("q", query);
  }
  return params.toString();
}

/**
 * Decode a URL hash (with or without the leading `#`) into a view state.
 * Tolerant by design: unknown keys are ignored and malformed values are
 * dropped field-by-field, so a mangled link still restores what it can.
 */
export function decodeViewState(hash: string): ViewState {
  const state: ViewState = {};
  let params: URLSearchParams;
  try {
    params = new URLSearchParams(hash.replace(/^#/, ""));
  } catch {
    return state;
  }

  // Format only: the stories load when one is asked for (StoryCard.ts), and an
  // id that names none is ignored there. The id is untrusted link input, so
  // it is never used as an object key.
  const story = params.get("story");
  if (story && STORY_ID_RE.test(story)) state.story = story;

  const layer = params.get("layer");
  if (layer && isLayerId(layer)) state.layer = layer;

  const t = params.get("t")?.match(MONTH_RE);
  if (t) {
    const year = Number(t[1]);
    const month = Number(t[2]);
    if (year >= 1900 && year <= 2200 && month >= 1 && month <= 12) {
      state.month = { year, month };
    }
  }

  const lat = Number(params.get("lat"));
  const lon = Number(params.get("lon"));
  const alt = Number(params.get("alt"));
  if (
    params.has("lat") &&
    params.has("lon") &&
    params.has("alt") &&
    Number.isFinite(lat) &&
    Number.isFinite(lon) &&
    Number.isFinite(alt) &&
    Math.abs(lat) <= 90 &&
    Math.abs(lon) <= 180 &&
    // Street level at Houston is a few thousandths inside the unit sphere
    // (the ellipsoid sits near 0.995). -1 would be the core of the planet.
    alt > -0.02 &&
    alt <= 20
  ) {
    state.camera = { lat, lon, alt };
  }

  // Two components is the pre-mode link format, still in the wild in saved
  // bookmarks and published CSVs. Those links carry no evidence of which mode
  // produced them, so they resolve to the app's own default rather than
  // guessing — the one reading that cannot invent a statistic the sender may
  // not have used.
  const probe = params.get("probe")?.split(",");
  if (probe?.length === 5 && probe[4] === "region") {
    // A drawn region: four bounds, in the CSV's S W N E order. Validated as a
    // box the drawer could actually have produced — a link is untrusted input,
    // and an unusable box would reopen as a chart of nothing.
    const [south, west, north, east] = probe.slice(0, 4).map(Number);
    const bounds = { south, west, north, east };
    if (
      [south, west, north, east].every((n) => Number.isFinite(n)) &&
      isUsableBounds(bounds)
    ) {
      state.probe = { kind: "region", bounds };
    }
  } else if (probe?.length === 2 || probe?.length === 3) {
    const plat = Number(probe[0]);
    const plon = Number(probe[1]);
    const mode = probe.length === 3 ? probe[2] : "point";
    if (
      Number.isFinite(plat) &&
      Number.isFinite(plon) &&
      Math.abs(plat) <= 90 &&
      Math.abs(plon) <= 180 &&
      PROBE_MODES.includes(mode)
    ) {
      state.probe = {
        kind: "point",
        lat: plat,
        lon: plon,
        mode: mode as ProbeShareMode,
      };
    }
  }

  const pin = params.get("pin")?.match(MONTH_RE);
  if (pin) {
    const year = Number(pin[1]);
    const month = Number(pin[2]);
    if (year >= 1900 && year <= 2200 && month >= 1 && month <= 12) {
      state.pin = { year, month };
    }
  }

  const place = params.get("place");
  if (place) {
    const decoded = decodePlace(place);
    if (decoded) state.place = decoded;
  }

  const query = params.get("q");
  if (query) {
    const decoded = cleanLabel(query, QUERY_MAX);
    if (decoded) state.query = decoded;
  }

  return state;
}
