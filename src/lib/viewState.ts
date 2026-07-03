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

  return state;
}
