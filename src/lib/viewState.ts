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
 * specific view in a paper, thesis, or message. Pure logic, no DOM (see
 * viewState.test.ts); main.ts owns reading/writing `location.hash`.
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

export interface ViewState {
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
}

const MONTH_RE = /^(\d{4})-(\d{2})$/;

function isLayerId(value: string): value is LayerId {
  // Object.hasOwn, not `in`: the `in` operator walks the prototype chain, so
  // a crafted hash like #layer=toString would pass the guard and smuggle a
  // non-layer into app state — found by the fuzz suite (seed 1100653994).
  return Object.hasOwn(LAYERS, value);
}

/** Encode a view state as a URL-hash payload (no leading `#`). */
export function encodeViewState(state: ViewState): string {
  const params = new URLSearchParams();
  if (state.layer) params.set("layer", state.layer);
  if (state.month) {
    params.set(
      "t",
      `${state.month.year}-${String(state.month.month).padStart(2, "0")}`
    );
  }
  if (state.camera) {
    params.set("lat", state.camera.lat.toFixed(2));
    params.set("lon", state.camera.lon.toFixed(2));
    params.set("alt", state.camera.alt.toFixed(2));
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
    alt > 0 &&
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

  return state;
}
