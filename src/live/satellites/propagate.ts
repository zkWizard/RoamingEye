/**
 * SGP4 propagation. This is the only module that imports satellite.js.
 * The worker is its only runtime importer, so the library stays in the
 * worker chunk and out of the entry bundle.
 */
// Deep imports, not the package barrel: the barrel re-exports the WASM
// runtimes, and a worker bundle cannot swallow that top-level await.
import {
  degreesLat,
  degreesLong,
  degreesToRadians,
  ecfToLookAngles,
  eciToEcf,
  eciToGeodetic,
} from "../../../node_modules/satellite.js/dist/transforms.js";
import {
  gstime,
  propagate,
} from "../../../node_modules/satellite.js/dist/propagation.js";
import { json2satrec } from "../../../node_modules/satellite.js/dist/io.js";
import type { OMMJsonObject } from "../../../node_modules/satellite.js/dist/common-types.js";
import type { SatRec } from "../../../node_modules/satellite.js/dist/propagation/SatRec.js";
import type { GpRecord } from "./elements";

export interface SatState {
  lat: number;
  lon: number;
  altKm: number;
  speedKmS: number;
}

export function satrecFromRecord(record: GpRecord): SatRec | null {
  try {
    return json2satrec(record as OMMJsonObject);
  } catch {
    return null;
  }
}

export function satrecsFromRecords(
  records: readonly GpRecord[]
): (SatRec | null)[] {
  return records.map(satrecFromRecord);
}

/**
 * One position for a prepared record. `gmst` is the sidereal time for
 * `date`; the caller computes it once per tick.
 */
export function propagateSatrec(
  satrec: SatRec,
  date: Date,
  gmst: number
): SatState | null {
  const pv = propagate(satrec, date);
  if (!pv) return null;
  const geodetic = eciToGeodetic(pv.position, gmst);
  const lat = degreesLat(geodetic.latitude);
  const lon = degreesLong(geodetic.longitude);
  const altKm = geodetic.height;
  const speedKmS = Math.hypot(pv.velocity.x, pv.velocity.y, pv.velocity.z);
  if (![lat, lon, altKm, speedKmS].every(Number.isFinite)) return null;
  return { lat, lon, altKm, speedKmS };
}

/** Lat, lon, altKm, speedKmS packed per satellite. Failed rows are NaN. */
export function propagateGroup(
  satrecs: readonly (SatRec | null)[],
  timeMs: number
): Float32Array {
  const date = new Date(timeMs);
  const gmst = gstime(date);
  const out = new Float32Array(satrecs.length * 4);
  for (let index = 0; index < satrecs.length; index += 1) {
    const satrec = satrecs[index];
    const offset = index * 4;
    const state = satrec ? propagateSatrec(satrec, date, gmst) : null;
    if (!state) {
      out[offset] = Number.NaN;
      out[offset + 1] = Number.NaN;
      out[offset + 2] = Number.NaN;
      out[offset + 3] = Number.NaN;
      continue;
    }
    out[offset] = state.lat;
    out[offset + 1] = state.lon;
    out[offset + 2] = state.altKm;
    out[offset + 3] = state.speedKmS;
  }
  return out;
}

export function propagateRecord(
  record: GpRecord,
  timeMs: number
): SatState | null {
  const satrec = satrecFromRecord(record);
  if (!satrec) return null;
  const date = new Date(timeMs);
  return propagateSatrec(satrec, date, gstime(date));
}

export interface TrackPaths {
  /** One revolution at display altitude: lat, lon, altKm. */
  orbit: Float32Array;
  /** The next 90 minutes on the ground: lat, lon. */
  ground: Float32Array;
}

/** Orbit (one revolution) and the next 90 minutes of ground track. */
export function trackPaths(
  record: GpRecord,
  timeMs: number
): TrackPaths | null {
  const satrec = satrecFromRecord(record);
  if (!satrec || !(record.MEAN_MOTION > 0)) return null;
  const periodMs = (1440 / record.MEAN_MOTION) * 60_000;
  const orbitSteps = 96;
  const orbit = new Float32Array(orbitSteps * 3);
  for (let step = 0; step < orbitSteps; step += 1) {
    const state = propagateSatrec(
      satrec,
      new Date(timeMs + (periodMs * step) / orbitSteps),
      gstime(new Date(timeMs + (periodMs * step) / orbitSteps))
    );
    const offset = step * 3;
    if (!state) {
      orbit[offset] = Number.NaN;
      continue;
    }
    orbit[offset] = state.lat;
    orbit[offset + 1] = state.lon;
    orbit[offset + 2] = state.altKm;
  }
  const groundSteps = 90;
  const ground = new Float32Array(groundSteps * 2);
  for (let step = 0; step < groundSteps; step += 1) {
    const when = timeMs + step * 60_000;
    const state = propagateSatrec(
      satrec,
      new Date(when),
      gstime(new Date(when))
    );
    const offset = step * 2;
    if (!state) {
      ground[offset] = Number.NaN;
      continue;
    }
    ground[offset] = state.lat;
    ground[offset + 1] = state.lon;
  }
  return { orbit, ground };
}

export interface VisiblePass {
  startMs: number;
  durationMin: number;
  peakElevationDeg: number;
}

const PASS_ELEVATION_DEG = 10;
const PASS_STEP_MS = 30_000;
const PASS_WINDOW_MS = 24 * 60 * 60 * 1000;

/**
 * The next time the satellite climbs above 10 degrees for an observer.
 * Samples every 30 seconds for a day. Returns null when no pass falls in
 * the window.
 */
export function nextVisiblePass(
  record: GpRecord,
  timeMs: number,
  observerLat: number,
  observerLon: number
): VisiblePass | null {
  const satrec = satrecFromRecord(record);
  if (!satrec) return null;
  const observer = {
    longitude: degreesToRadians(observerLon),
    latitude: degreesToRadians(observerLat),
    height: 0,
  };
  let open = false;
  let startMs = 0;
  let peak = 0;
  for (
    let when = timeMs;
    when <= timeMs + PASS_WINDOW_MS;
    when += PASS_STEP_MS
  ) {
    const date = new Date(when);
    const pv = propagate(satrec, date);
    const elevation = pv
      ? (ecfToLookAngles(observer, eciToEcf(pv.position, gstime(date)))
          .elevation *
          180) /
        Math.PI
      : Number.NaN;
    const up = Number.isFinite(elevation) && elevation >= PASS_ELEVATION_DEG;
    if (up) {
      if (!open) {
        open = true;
        startMs = when;
        peak = elevation;
      } else if (elevation > peak) peak = elevation;
    } else if (open) {
      return {
        startMs,
        durationMin: (when - startMs) / 60_000,
        peakElevationDeg: peak,
      };
    }
  }
  return null;
}
