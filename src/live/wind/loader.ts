import { readWindCache, writeWindCache } from "./cache";
import {
  COARSE_WIND_GRID,
  OPEN_METEO_BATCH,
  decodeWindBinary,
  fillWindArrays,
  gridCoordinates,
  openMeteoCurrentUrl,
  parseOpenMeteoCurrentBody,
  parseWindHeader,
  type OpenMeteoPlace,
  type WindField,
  type WindGridSpec,
  type WindHeader,
} from "./field";

export { OPEN_METEO_BATCH, openMeteoCurrentUrl };

type FetchLike = typeof fetch;

function chunks<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size)
    out.push(items.slice(i, i + size));
  return out;
}

interface DecodedMessage {
  header?: WindHeader;
  u?: Float32Array;
  v?: Float32Array;
  t?: Float32Array;
  error?: string;
}

function decodeOffThread(
  buffer: ArrayBuffer,
  header: WindHeader
): Promise<WindField> {
  if (typeof Worker === "undefined") {
    return Promise.resolve(decodeWindBinary(buffer, header));
  }
  return new Promise((resolve, reject) => {
    let worker: Worker;
    try {
      worker = new Worker(new URL("./worker.ts", import.meta.url), {
        type: "module",
      });
    } catch (err) {
      reject(err);
      return;
    }
    const timer = setTimeout(() => {
      worker.terminate();
      reject(new Error("Wind worker timed out"));
    }, 8000);
    worker.onmessage = (event: MessageEvent<DecodedMessage>) => {
      clearTimeout(timer);
      worker.terminate();
      const data = event.data;
      if (
        !data ||
        data.error ||
        !data.u ||
        !data.v ||
        !data.t ||
        !data.header
      ) {
        reject(new Error(data?.error ?? "Wind worker returned no field"));
        return;
      }
      resolve({ header: data.header, u: data.u, v: data.v, t: data.t });
    };
    worker.onerror = () => {
      clearTimeout(timer);
      worker.terminate();
      reject(new Error("Wind worker failed"));
    };
    worker.postMessage({ buffer: buffer.slice(0), header });
  });
}

async function decodeField(
  buffer: ArrayBuffer,
  header: WindHeader
): Promise<WindField> {
  try {
    return await decodeOffThread(buffer, header);
  } catch (err) {
    console.warn(
      "RoamingEye: wind worker unavailable, decoding on the main thread",
      err
    );
    return decodeWindBinary(buffer, header);
  }
}

async function fetchPlaces(
  fetchImpl: FetchLike,
  grid: WindGridSpec
): Promise<OpenMeteoPlace[]> {
  const coords = gridCoordinates(grid);
  const places: OpenMeteoPlace[] = [];
  for (const batch of chunks(coords, OPEN_METEO_BATCH)) {
    const response = await fetchImpl(openMeteoCurrentUrl(batch));
    if (!response.ok) {
      throw new Error(`Open-Meteo answered ${response.status}`);
    }
    places.push(...parseOpenMeteoCurrentBody(await response.json()));
  }
  return places;
}

export async function loadCoarseWindField(
  fetchImpl: FetchLike
): Promise<WindField> {
  const places = await fetchPlaces(fetchImpl, COARSE_WIND_GRID);
  const filled = fillWindArrays(COARSE_WIND_GRID, places);
  if (filled.missing > filled.u.length * 0.5) {
    throw new Error("Open-Meteo wind grid is mostly empty");
  }
  const encoded = {
    header: parseWindHeader({
      ...COARSE_WIND_GRID,
      version: 1,
      time: filled.time,
      encoding: "int16le",
      scale: 0.01,
      order: ["u", "v", "t"],
      missing: -32768,
      source: "open-meteo-fallback",
    }),
    u: filled.u,
    v: filled.v,
    t: filled.t,
  };
  return encoded;
}

/**
 * Load the nightly field in one request. A direct Open-Meteo grid is only
 * fetched when that file is missing.
 */
export async function loadWindField(options?: {
  fetch?: FetchLike;
  baseUrl?: string;
  cache?: boolean;
  now?: number;
}): Promise<WindField> {
  const fetchImpl = options?.fetch ?? fetch;
  const base = options?.baseUrl ?? import.meta.env.BASE_URL ?? "/";
  const useCache =
    options?.cache === true ||
    (options?.cache !== false && options?.fetch === undefined);
  if (useCache) {
    const cached = await readWindCache(options?.now);
    if (cached) {
      try {
        return await decodeField(cached.buffer, parseWindHeader(cached.header));
      } catch {
        // A corrupt cache should not block the network copy.
      }
    }
  }
  try {
    const headerRes = await fetchImpl(`${base}data/wind/latest.json`);
    if (!headerRes.ok) throw new Error(`wind header HTTP ${headerRes.status}`);
    const header = parseWindHeader(await headerRes.json());
    const binRes = await fetchImpl(`${base}data/wind/latest.bin`);
    if (!binRes.ok) throw new Error(`wind field HTTP ${binRes.status}`);
    const buffer = await binRes.arrayBuffer();
    const field = await decodeField(buffer, header);
    if (useCache) {
      void writeWindCache({
        savedAt: options?.now ?? Date.now(),
        header,
        buffer,
      });
    }
    return field;
  } catch (err) {
    console.warn(
      "RoamingEye: prebuilt wind field unavailable, asking Open-Meteo for a coarse grid",
      err
    );
    return loadCoarseWindField(fetchImpl);
  }
}
