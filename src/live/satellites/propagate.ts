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
