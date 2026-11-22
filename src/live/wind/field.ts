/**
 * Compact global wind field: a regular lat/lon grid of eastward wind (u),
 * northward wind (v), and 2 m temperature, stored as little-endian int16.
 *
 * The nightly job and the browser share this module. Open-Meteo reports
 * meteorological direction (where the wind comes from, degrees clockwise
 * from north) and speed. u is positive east, v is positive north:
 *   u = -speed * sin(direction)
 *   v = -speed * cos(direction)
 */

export const WIND_MISSING = -32768;
export const WIND_SCALE = 0.01;
/** Mean metres per degree of latitude. The shader templates the same value. */
export const METRES_PER_DEGREE = 111_320;
/**
 * Floor on cos(latitude) so a particle near the pole cannot jump a whole
 * hemisphere in one step. The advection shader uses the same floor.
 */
export const MIN_ADVECT_COS = 0.2;

export const OPEN_METEO_BATCH = 200;
const OPEN_METEO_FORECAST = "https://api.open-meteo.com/v1/forecast";

export function openMeteoCurrentUrl(
  coords: readonly { lat: number; lon: number }[]
): string {
  const latitude = coords.map((coord) => trimCoord(coord.lat)).join(",");
  const longitude = coords.map((coord) => trimCoord(coord.lon)).join(",");
  return (
    `${OPEN_METEO_FORECAST}?latitude=${latitude}&longitude=${longitude}` +
    "&current=temperature_2m,wind_speed_10m,wind_direction_10m" +
    "&wind_speed_unit=ms&timezone=UTC"
  );
}

function trimCoord(value: number): string {
  return String(Math.round(value * 1000) / 1000);
}

export const GLOBAL_WIND_GRID: WindGridSpec = {
  lat0: -90,
  lon0: -180,
  dLat: 2.5,
  dLon: 2.5,
  nLat: 73,
  nLon: 144,
};

/** Coarse grid used only when the prebuilt file is missing. */
export const COARSE_WIND_GRID: WindGridSpec = {
  lat0: -90,
  lon0: -180,
  dLat: 10,
  dLon: 10,
  nLat: 19,
  nLon: 36,
};

export interface WindGridSpec {
  lat0: number;
  lon0: number;
  dLat: number;
  dLon: number;
  nLat: number;
  nLon: number;
}

export interface WindHeader extends WindGridSpec {
  version: 1;
  time: string;
  encoding: "int16le";
  scale: number;
  order: ["u", "v", "t"];
  missing: number;
  source: string;
}

export interface WindField {
  header: WindHeader;
  u: Float32Array;
  v: Float32Array;
  t: Float32Array;
}

export interface WindSample {
  u: number;
  v: number;
  t: number;
  speed: number;
  /** Meteorological direction, degrees clockwise from north, where the wind comes from. */
  directionDeg: number;
}

export interface OpenMeteoPlace {
  time: string;
  temperature_2m: number | null;
  wind_speed_10m: number | null;
  wind_direction_10m: number | null;
}

const MAX_CELLS = 400 * 800;

export function gridCoordinates(
  grid: WindGridSpec
): { lat: number; lon: number }[] {
  const coords: { lat: number; lon: number }[] = [];
  for (let i = 0; i < grid.nLat; i++) {
    for (let j = 0; j < grid.nLon; j++) {
      coords.push({
        lat: grid.lat0 + i * grid.dLat,
        lon: grid.lon0 + j * grid.dLon,
      });
    }
  }
  return coords;
}

export function componentsFromSpeedDirection(
  speed: number,
  directionDeg: number
): { u: number; v: number } {
  const rad = (directionDeg * Math.PI) / 180;
  return {
    u: -speed * Math.sin(rad),
    v: -speed * Math.cos(rad),
  };
}

export function speedAndDirection(
  u: number,
  v: number
): { speed: number; directionDeg: number } {
  const speed = Math.hypot(u, v);
  if (speed === 0) return { speed: 0, directionDeg: 0 };
  const deg = (Math.atan2(-u, -v) * 180) / Math.PI;
  return { speed, directionDeg: (deg + 360) % 360 };
}

export function windFromOpenMeteo(
  speed: number | null,
  directionDeg: number | null,
  temperature: number | null
): { u: number; v: number; t: number } {
  const t =
    temperature !== null && Number.isFinite(temperature) ? temperature : NaN;
  if (
    speed === null ||
    directionDeg === null ||
    !Number.isFinite(speed) ||
    !Number.isFinite(directionDeg)
  ) {
    return { u: NaN, v: NaN, t };
  }
  const { u, v } = componentsFromSpeedDirection(speed, directionDeg);
  return { u, v, t };
}

export function normalizeOpenMeteoTime(time: string): string {
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(time)) return `${time}:00Z`;
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(time)) return `${time}Z`;
  return time;
}

function numOrNull(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return value;
}

export function parseOpenMeteoCurrentBody(body: unknown): OpenMeteoPlace[] {
  const rows = Array.isArray(body) ? body : [body];
  return rows.map((row, index) => {
    if (!row || typeof row !== "object") {
      throw new Error(`Open-Meteo row ${index} is not an object`);
    }
    const current = (row as { current?: unknown }).current;
    if (!current || typeof current !== "object") {
      throw new Error(`Open-Meteo row ${index} has no current block`);
    }
    const block = current as Record<string, unknown>;
    if (typeof block.time !== "string") {
      throw new Error(`Open-Meteo row ${index} has no time`);
    }
    return {
      time: block.time,
      temperature_2m: numOrNull(block.temperature_2m),
      wind_speed_10m: numOrNull(block.wind_speed_10m),
      wind_direction_10m: numOrNull(block.wind_direction_10m),
    };
  });
}

export function fillWindArrays(
  grid: WindGridSpec,
  places: readonly OpenMeteoPlace[]
): {
  u: Float32Array;
  v: Float32Array;
  t: Float32Array;
  time: string;
  missing: number;
} {
  const n = grid.nLat * grid.nLon;
  if (places.length !== n) {
    throw new Error(
      `Open-Meteo returned ${places.length} rows for a ${n}-cell grid`
    );
  }
  const u = new Float32Array(n);
  const v = new Float32Array(n);
  const t = new Float32Array(n);
  let missing = 0;
  const times = new Map<string, number>();
  for (let i = 0; i < n; i++) {
    const sample = windFromOpenMeteo(
      places[i].wind_speed_10m,
      places[i].wind_direction_10m,
      places[i].temperature_2m
    );
    u[i] = sample.u;
    v[i] = sample.v;
    t[i] = sample.t;
    if (!Number.isFinite(sample.u) || !Number.isFinite(sample.v)) missing += 1;
    const key = places[i].time;
    times.set(key, (times.get(key) ?? 0) + 1);
  }
  let time = places[0]?.time ?? "";
  let best = -1;
  for (const [key, count] of times) {
    if (count > best) {
      best = count;
      time = key;
    }
  }
  return { u, v, t, time: normalizeOpenMeteoTime(time), missing };
}

function isGrid(value: unknown): value is WindGridSpec {
  if (!value || typeof value !== "object") return false;
  const g = value as WindGridSpec;
  return (
    Number.isFinite(g.lat0) &&
    Number.isFinite(g.lon0) &&
    Number.isFinite(g.dLat) &&
    g.dLat > 0 &&
    Number.isFinite(g.dLon) &&
    g.dLon > 0 &&
    Number.isInteger(g.nLat) &&
    g.nLat > 1 &&
    Number.isInteger(g.nLon) &&
    g.nLon > 1 &&
    g.nLat * g.nLon <= MAX_CELLS
  );
}

export function parseWindHeader(value: unknown): WindHeader {
  if (!isGrid(value) || typeof value !== "object" || value === null) {
    throw new Error("Wind header is not a grid");
  }
  const h = value as WindHeader;
  if (h.version !== 1) throw new Error("Wind header version is not 1");
  if (h.encoding !== "int16le")
    throw new Error("Wind header encoding is not int16le");
  if (!Array.isArray(h.order) || h.order.join(",") !== "u,v,t") {
    throw new Error("Wind header component order is not u, v, t");
  }
  if (typeof h.scale !== "number" || !(h.scale > 0)) {
    throw new Error("Wind header scale is not a positive number");
  }
  if (h.missing !== WIND_MISSING)
    throw new Error("Wind header missing sentinel changed");
  if (typeof h.time !== "string" || h.time.length === 0) {
    throw new Error("Wind header has no time");
  }
  if (typeof h.source !== "string" || h.source.length === 0) {
    throw new Error("Wind header has no source");
  }
  return {
    version: 1,
    time: h.time,
    lat0: h.lat0,
    lon0: h.lon0,
    dLat: h.dLat,
    dLon: h.dLon,
    nLat: h.nLat,
    nLon: h.nLon,
    encoding: "int16le",
    scale: h.scale,
    order: ["u", "v", "t"],
    missing: WIND_MISSING,
    source: h.source,
  };
}

function writeComponent(
  view: DataView,
  offset: number,
  value: number,
  scale: number
): void {
  if (!Number.isFinite(value)) {
    view.setInt16(offset, WIND_MISSING, true);
    return;
  }
  const raw = Math.round(value / scale);
  const clamped = Math.max(-32767, Math.min(32767, raw));
  view.setInt16(offset, clamped, true);
}

export function encodeWindField(
  spec: WindGridSpec & { time: string; source: string; scale?: number },
  u: ArrayLike<number>,
  v: ArrayLike<number>,
  t: ArrayLike<number>
): { header: WindHeader; buffer: ArrayBuffer } {
  const n = spec.nLat * spec.nLon;
  if (u.length !== n || v.length !== n || t.length !== n) {
    throw new Error("Wind arrays do not match the grid");
  }
  const header = parseWindHeader({
    ...spec,
    version: 1,
    encoding: "int16le",
    scale: spec.scale ?? WIND_SCALE,
    order: ["u", "v", "t"],
    missing: WIND_MISSING,
  });
  const buffer = new ArrayBuffer(n * 6);
  const view = new DataView(buffer);
  for (let i = 0; i < n; i++) {
    writeComponent(view, i * 6, u[i], header.scale);
    writeComponent(view, i * 6 + 2, v[i], header.scale);
    writeComponent(view, i * 6 + 4, t[i], header.scale);
  }
  return { header, buffer };
}

export function decodeWindBinary(
  buffer: ArrayBuffer,
  headerInput: unknown
): WindField {
  const header = parseWindHeader(headerInput);
  const n = header.nLat * header.nLon;
  if (buffer.byteLength !== n * 6) {
    throw new Error(
      `Wind field is ${buffer.byteLength} bytes, expected ${n * 6}`
    );
  }
  const view = new DataView(buffer);
  const u = new Float32Array(n);
  const v = new Float32Array(n);
  const t = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    u[i] = readComponent(view, i * 6, header);
    v[i] = readComponent(view, i * 6 + 2, header);
    t[i] = readComponent(view, i * 6 + 4, header);
  }
  return { header, u, v, t };
}

function readComponent(
  view: DataView,
  offset: number,
  header: WindHeader
): number {
  const raw = view.getInt16(offset, true);
  if (raw === header.missing) return NaN;
  return raw * header.scale;
}

/** RGBA float texels, south row first, west column first. Alpha is 0 where u or v is missing. */
export function fieldToRgba(field: WindField): Float32Array {
  const n = field.header.nLat * field.header.nLon;
  const rgba = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) {
    const u = field.u[i];
    const v = field.v[i];
    const t = field.t[i];
    const ok = Number.isFinite(u) && Number.isFinite(v);
    rgba[i * 4] = ok ? u : 0;
    rgba[i * 4 + 1] = ok ? v : 0;
    rgba[i * 4 + 2] = Number.isFinite(t) ? t : 0;
    rgba[i * 4 + 3] = ok ? 1 : 0;
  }
  return rgba;
}

interface Corner {
  u: number;
  v: number;
  t: number;
}

function cellAt(field: WindField, y: number, x: number): Corner | null {
  const { nLon } = field.header;
  const idx = y * nLon + x;
  const u = field.u[idx];
  const v = field.v[idx];
  if (!Number.isFinite(u) || !Number.isFinite(v)) return null;
  return { u, v, t: field.t[idx] };
}

function blend(
  corners: readonly { sample: Corner; weight: number }[]
): { u: number; v: number; t: number } | null {
  let weight = 0;
  let u = 0;
  let v = 0;
  let t = 0;
  let tWeight = 0;
  for (const corner of corners) {
    if (corner.weight <= 0) continue;
    weight += corner.weight;
    u += corner.sample.u * corner.weight;
    v += corner.sample.v * corner.weight;
    if (Number.isFinite(corner.sample.t)) {
      t += corner.sample.t * corner.weight;
      tWeight += corner.weight;
    }
  }
  if (weight <= 0) return null;
  return { u: u / weight, v: v / weight, t: tWeight > 0 ? t / tWeight : NaN };
}

/**
 * Bilinear sample of the vector wind. Longitude wraps. Latitude clamps to
 * the grid. A missing corner is dropped and the remaining weights are
 * renormalized. Speed and direction are taken from the blended vector, which
 * is what agrees with the Open-Meteo point that was stored on a grid node.
 */
export function sampleWind(
  field: WindField,
  lat: number,
  lon: number
): WindSample | null {
  const { lat0, lon0, dLat, dLon, nLat, nLon } = field.header;
  const maxLat = lat0 + (nLat - 1) * dLat;
  const latClamped = Math.min(maxLat, Math.max(lat0, lat));
  const y = (latClamped - lat0) / dLat;
  const y0 = Math.floor(y);
  const y1 = Math.min(nLat - 1, y0 + 1);
  const fy = y1 === y0 ? 0 : y - y0;

  const span = nLon * dLon;
  const shifted = (((lon - lon0) % span) + span) % span;
  const x = shifted / dLon;
  const x0 = Math.floor(x) % nLon;
  const fx = x - Math.floor(x);
  const x1 = (x0 + 1) % nLon;

  const s00 = cellAt(field, y0, x0);
  const s10 = cellAt(field, y0, x1);
  const s01 = cellAt(field, y1, x0);
  const s11 = cellAt(field, y1, x1);
  const parts: { sample: Corner; weight: number }[] = [];
  if (s00) parts.push({ sample: s00, weight: (1 - fx) * (1 - fy) });
  if (s10) parts.push({ sample: s10, weight: fx * (1 - fy) });
  if (s01) parts.push({ sample: s01, weight: (1 - fx) * fy });
  if (s11) parts.push({ sample: s11, weight: fx * fy });
  const mixed = blend(parts);
  if (!mixed) return null;
  const motion = speedAndDirection(mixed.u, mixed.v);
  return { ...mixed, ...motion };
}

/**
 * Move a point on the sphere by the local wind for `dtHours` of model time.
 * This is the CPU form of the particle shader's displacement.
 */
export function advect(
  lat: number,
  lon: number,
  u: number,
  v: number,
  dtHours: number
): { lat: number; lon: number } {
  const dtSec = dtHours * 3600;
  const dLat = (v * dtSec) / METRES_PER_DEGREE;
  const cosLat = Math.max(MIN_ADVECT_COS, Math.cos((lat * Math.PI) / 180));
  const dLon = (u * dtSec) / (METRES_PER_DEGREE * cosLat);
  const nextLat = Math.max(-90, Math.min(90, lat + dLat));
  const wrapped = (((lon + dLon + 180) % 360) + 360) % 360;
  return { lat: nextLat, lon: wrapped - 180 };
}
