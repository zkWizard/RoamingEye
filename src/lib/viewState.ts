import { LAYERS, type LayerId, type YearMonth } from "./timeline";

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

export interface ViewState {
  layer?: LayerId;
  month?: YearMonth;
  camera?: CameraState;
  /** An open time-series probe at this point — the link reproduces the chart. */
  probe?: { lat: number; lon: number };
  /** An active comparison pinned to this month (the timeline month is the
   * other side) — the link reproduces the A/B view. */
  pin?: YearMonth;
}

const MONTH_RE = /^(\d{4})-(\d{2})$/;

function isLayerId(value: string): value is LayerId {
  return value in LAYERS;
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
  if (state.probe) {
    params.set(
      "probe",
      `${state.probe.lat.toFixed(4)},${state.probe.lon.toFixed(4)}`
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

  const probe = params.get("probe")?.split(",");
  if (probe?.length === 2) {
    const [plat, plon] = probe.map(Number);
    if (
      Number.isFinite(plat) &&
      Number.isFinite(plon) &&
      Math.abs(plat) <= 90 &&
      Math.abs(plon) <= 180
    ) {
      state.probe = { lat: plat, lon: plon };
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
